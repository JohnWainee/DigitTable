import {
  asMemberId,
  asRoomId,
  type AuthorityRecord,
  type AuthorizedMemberContext,
  type Capability,
  type CommandId,
  type MemberId,
  type PoolInput,
  type RoomCommandRequest,
  type RoomCommandResult,
  type RoomDispatchFailure,
  type RoomRepository,
  type Unsubscribe,
  type ViewerContext,
  type ViewerProjection,
  type VisibleRoll,
} from "@digitable/contracts";
import {
  createSeededRandom,
  projectViewer,
  runCommand,
  type AcceptedCommandReceipt,
} from "@digitable/engine";
import {
  eatTheReichTemplate,
  type EatTheReichCommand,
  type EatTheReichEvent,
  type EatTheReichState,
  type EatTheReichView,
  type RollAllocation,
} from "@digitable/template-eat-the-reich";

/** The one player seat this local vertical slice supports. */
export const PLAYER_MEMBER_ID = asMemberId("player-local");

/** The one GM seat this local vertical slice supports. */
const GM_MEMBER_ID = asMemberId("gm-local");

/**
 * Test-support only: a member registered with the `table` capability so the
 * local harness can prove platform authorization rejects a table-attributed
 * command through the same dispatch path every other command uses
 * (docs/PHASE_1C_PLAN.md, "Shared-table" test matrix). The table surface
 * itself never calls `dispatch` — it renders no controls.
 */
const TABLE_MEMBER_ID = asMemberId("table-local");

/** Exported for test-support only, so tests can build a `ViewerContext` for the generic `RoomRepository` methods without hardcoding this value. */
export const ROOM_ID = asRoomId("room-local");
const PLATFORM_VERSION = "0.0.0-local";

type ChangeListener = () => void;
type ErrorListener = (failure: RoomDispatchFailure) => void;

/**
 * Holds one `AuthorityRecord<EatTheReichState>` in memory and runs every
 * command through the same `runCommand`/`projectViewer` pipeline a trusted
 * server will later run, per docs/DATA_AND_SYNC_MODEL.md: "The local
 * vertical slice implements the same repository interface in memory/local
 * storage." There is no persistence beyond the lifetime of this object.
 *
 * Implements `@digitable/contracts`'s `RoomRepository` (Phase 2 PR 1):
 * `dispatch`/`getProjection`/`subscribeToProjection` are the async,
 * caller-supplied-`commandId` primitives a `FirebaseRoomRepository` will
 * also implement. The `beginAction`/`submitOpposition`/`allocateResults`/
 * `get*Projection` methods below are additive convenience wrappers kept for
 * the existing player/GM/table UI call sites; they are not part of the
 * interface and a Firebase-backed implementation need not provide them.
 *
 * One instance is shared across all three locally-simulated viewer roles
 * (player, GM, table — docs/PHASE_1C_PLAN.md's "multi-role local
 * simulation"): every surface reads its own projection off the same
 * `AuthorityRecord` and every command, from any role, flows through the one
 * `dispatch` method below.
 */
export class InMemoryRoomRepository implements RoomRepository<
  EatTheReichCommand,
  EatTheReichEvent,
  EatTheReichView
> {
  private authority: AuthorityRecord<EatTheReichState>;
  private readonly capabilities: ReadonlyMap<MemberId, Capability>;
  private readonly receipts = new Map<string, AcceptedCommandReceipt>();
  private readonly listeners = new Set<ChangeListener>();
  private readonly errorListeners = new Set<ErrorListener>();

  constructor() {
    this.authority = createInitialAuthority();
    this.capabilities = new Map([
      [PLAYER_MEMBER_ID, "player"],
      [GM_MEMBER_ID, "gm"],
      [TABLE_MEMBER_ID, "table"],
    ]);
  }

  /** Notifies `listener` after every accepted command, from any role. */
  subscribe(listener: ChangeListener): Unsubscribe {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Notifies `listener` after every rejected/failed dispatch, from any role (see `RoomDispatchFailure`). */
  subscribeToErrors(listener: ErrorListener): Unsubscribe {
    this.errorListeners.add(listener);
    return () => this.errorListeners.delete(listener);
  }

  /**
   * `RoomRepository`'s live-update primitive: re-reads `viewer`'s projection
   * after every accepted command and pushes it to `listener`. Delivers no
   * initial value synchronously (matching a real listener-based backend);
   * callers that need a starting value call `getProjection` first.
   */
  subscribeToProjection(
    viewer: ViewerContext,
    listener: (projection: ViewerProjection<EatTheReichView>) => void,
  ): Unsubscribe {
    return this.subscribe(() => listener(this.projectionFor(viewer)));
  }

  /** `RoomRepository`'s one-shot projection read. */
  getProjection(viewer: ViewerContext): Promise<ViewerProjection<EatTheReichView>> {
    return Promise.resolve(this.projectionFor(viewer));
  }

  getPlayerProjection(): ViewerProjection<EatTheReichView> {
    return this.projectionFor(this.viewerContextFor(PLAYER_MEMBER_ID));
  }

  /** The GM's own projection: full threat list and un-redacted active-roll fields (docs/PHASE_1C_PLAN.md). */
  getGmProjection(): ViewerProjection<EatTheReichView> {
    return this.projectionFor({ roomId: ROOM_ID, viewerId: "gm", capability: "gm" });
  }

  /** The read-only shared-table projection: public summaries only, `self` always null. */
  getTableProjection(): ViewerProjection<EatTheReichView> {
    return this.projectionFor({ roomId: ROOM_ID, viewerId: "table", capability: "table" });
  }

  explainPool(input: PoolInput): ReturnType<typeof eatTheReichTemplate.explainPool> {
    return eatTheReichTemplate.explainPool(this.getPlayerProjection(), input);
  }

  validAllocations(roll: VisibleRoll): ReturnType<typeof eatTheReichTemplate.validAllocations> {
    return eatTheReichTemplate.validAllocations(this.getPlayerProjection(), roll);
  }

  beginAction(
    commandId: CommandId,
    threatId: string,
    actionId: string,
    gearIds: readonly string[],
  ): Promise<RoomCommandResult<EatTheReichEvent>> {
    return this.dispatch(PLAYER_MEMBER_ID, {
      commandId,
      payload: {
        type: "BeginAction",
        actorMemberId: PLAYER_MEMBER_ID,
        threatId,
        actionId,
        gearIds,
      },
    });
  }

  allocateResults(
    commandId: CommandId,
    rollId: string,
    allocations: readonly RollAllocation[],
  ): Promise<RoomCommandResult<EatTheReichEvent>> {
    return this.dispatch(PLAYER_MEMBER_ID, {
      commandId,
      payload: { type: "AllocateResults", rollId, allocations },
    });
  }

  /**
   * The GM's opposition control (docs/PHASE_1C_PLAN.md, "GM opposition
   * controls"): submits `SubmitOpposition` with a human-chosen push-dice
   * value through the same dispatch path every other command uses.
   */
  submitOpposition(
    commandId: CommandId,
    rollId: string,
    pushDice: number,
  ): Promise<RoomCommandResult<EatTheReichEvent>> {
    return this.dispatch(GM_MEMBER_ID, {
      commandId,
      payload: { type: "SubmitOpposition", rollId, pushDice },
    });
  }

  /**
   * Test-support only (see `TABLE_MEMBER_ID`): attempts a command attributed
   * to the table capability through the real dispatch path, so a regression
   * test can prove platform authorization rejects it rather than relying on
   * the table UI's omission of controls alone.
   */
  attemptCommandAsTable(
    commandId: CommandId,
    command: EatTheReichCommand,
  ): Promise<RoomCommandResult<EatTheReichEvent>> {
    return this.dispatch(TABLE_MEMBER_ID, { commandId, payload: command });
  }

  reset(): void {
    this.authority = createInitialAuthority();
    this.receipts.clear();
    this.notify();
  }

  private viewerContextFor(memberId: MemberId): ViewerContext {
    const capability = this.capabilities.get(memberId);
    if (!capability) {
      throw new Error(`Unknown local member "${memberId}".`);
    }
    return { roomId: ROOM_ID, viewerId: memberId, capability };
  }

  private projectionFor(viewer: ViewerContext): ViewerProjection<EatTheReichView> {
    return projectViewer(eatTheReichTemplate, this.authority, viewer);
  }

  /**
   * `RoomRepository.dispatch`: the sole command-execution entry point.
   * `request.commandId` is caller-supplied (Phase 2 preflight review finding
   * P1) rather than minted here, so a caller that stores it before
   * dispatching and resubmits the same value on retry reaches `runCommand`'s
   * `priorReceipt` short-circuit and gets back the original result without
   * re-deciding or re-drawing randomness. Returns a promise (not declared
   * `async`, since every step below is synchronous — there is nothing to
   * `await`) for interface conformance with a real network-backed
   * implementation: every synchronous side effect (`notify`/`notifyError`)
   * has already run by the time this method returns, regardless of when the
   * caller observes the resolved promise.
   */
  dispatch(
    memberId: MemberId,
    request: RoomCommandRequest<EatTheReichCommand>,
  ): Promise<RoomCommandResult<EatTheReichEvent>> {
    const capability = this.capabilities.get(memberId);
    if (!capability) {
      throw new Error(`Unknown local member "${memberId}".`);
    }
    const actor: AuthorizedMemberContext = { roomId: ROOM_ID, memberId, capability };
    const seed = globalThis.crypto.getRandomValues(new Uint8Array(16));
    const random = createSeededRandom(seed);
    // `${memberId}_${commandId}`: docs/ARCHITECTURE.md section 8's receipt-id scheme
    // (Phase 2 preflight review, finding R6/P2), so a future FirebaseRoomRepository's
    // receipt lookup is written against the same key shape this repository uses.
    const receiptKey = `${memberId}_${request.commandId}`;
    const priorReceipt = this.receipts.get(receiptKey);

    const result = runCommand(eatTheReichTemplate, {
      member: actor,
      authority: this.authority,
      random,
      command: request.payload,
      commandId: request.commandId,
      occurredAtServer: new Date().toISOString(),
      ...(priorReceipt !== undefined ? { priorReceipt } : {}),
    });

    if (!result.ok) {
      const failure: RoomDispatchFailure = {
        capability,
        code: result.code,
        message: result.message,
      };
      this.notifyError(failure);
      return Promise.resolve({
        status: "rejected",
        commandId: request.commandId,
        code: result.code,
        message: result.message,
      });
    }

    this.authority = result.authority;
    this.receipts.set(receiptKey, result.receipt);
    const sharedEvents = result.envelopes
      .filter((delivered) => delivered.destination.kind === "shared")
      .map((delivered) => delivered.envelope.payload);
    this.notify();
    return Promise.resolve({
      status: "accepted",
      commandId: request.commandId,
      roomRevision: result.authority.roomRevision,
      sharedEvents,
    });
  }

  private notify(): void {
    for (const listener of this.listeners) listener();
  }

  private notifyError(failure: RoomDispatchFailure): void {
    for (const listener of this.errorListeners) listener(failure);
  }
}

function createInitialAuthority(): AuthorityRecord<EatTheReichState> {
  const state = eatTheReichTemplate.initialState({
    roomId: ROOM_ID,
    gmMemberId: GM_MEMBER_ID,
    memberIds: [PLAYER_MEMBER_ID],
  });
  return {
    platformVersion: PLATFORM_VERSION,
    templateId: eatTheReichTemplate.manifest.templateId,
    templateVersion: eatTheReichTemplate.manifest.templateVersion,
    schemaVersion: eatTheReichTemplate.manifest.currentSchemaVersion,
    roomRevision: 0,
    nextSequence: 1,
    roomStatus: "active",
    gmMemberId: GM_MEMBER_ID,
    admissionStatus: "open",
    participantCount: 2,
    tableSeatClaimed: false,
    state,
  };
}
