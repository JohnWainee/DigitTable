import {
  asCommandId,
  asMemberId,
  asRoomId,
  type AuthorityRecord,
  type AuthorizedMemberContext,
  type Capability,
  type MemberId,
  type PoolInput,
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

const ROOM_ID = asRoomId("room-local");
const PLATFORM_VERSION = "0.0.0-local";

type Listener = () => void;

export interface DispatchResult {
  readonly ok: boolean;
  readonly code?: string;
  readonly message?: string;
  /** The subset of emitted events sent to the "shared" destination, in emission order. */
  readonly sharedEvents: readonly EatTheReichEvent[];
}

/** A rejected or failed command dispatch, broadcast to every surface regardless of who attempted it. */
export interface RoomDispatchFailure {
  readonly capability: Capability;
  readonly code?: string;
  readonly message?: string;
}

type ErrorListener = (failure: RoomDispatchFailure) => void;

/**
 * Holds one `AuthorityRecord<EatTheReichState>` in memory and runs every
 * command through the same `runCommand`/`projectViewer` pipeline a trusted
 * server will later run, per docs/DATA_AND_SYNC_MODEL.md: "The local
 * vertical slice implements the same repository interface in memory/local
 * storage." There is no persistence beyond the lifetime of this object.
 *
 * One instance is shared across all three locally-simulated viewer roles
 * (player, GM, table — docs/PHASE_1C_PLAN.md's "multi-role local
 * simulation"): every surface reads its own projection off the same
 * `AuthorityRecord` and every command, from any role, flows through the one
 * `dispatch` method below.
 */
export class InMemoryRoomRepository {
  private authority: AuthorityRecord<EatTheReichState>;
  private readonly capabilities: ReadonlyMap<MemberId, Capability>;
  private readonly receipts = new Map<string, AcceptedCommandReceipt>();
  private readonly listeners = new Set<Listener>();
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
  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Notifies `listener` after every rejected/failed dispatch, from any role (see `RoomDispatchFailure`). */
  subscribeToErrors(listener: ErrorListener): () => void {
    this.errorListeners.add(listener);
    return () => this.errorListeners.delete(listener);
  }

  getPlayerProjection(): ViewerProjection<EatTheReichView> {
    return projectViewer(
      eatTheReichTemplate,
      this.authority,
      this.viewerContextFor(PLAYER_MEMBER_ID),
    );
  }

  /** The GM's own projection: full threat list and un-redacted active-roll fields (docs/PHASE_1C_PLAN.md). */
  getGmProjection(): ViewerProjection<EatTheReichView> {
    return projectViewer(eatTheReichTemplate, this.authority, {
      roomId: ROOM_ID,
      viewerId: "gm",
      capability: "gm",
    });
  }

  /** The read-only shared-table projection: public summaries only, `self` always null. */
  getTableProjection(): ViewerProjection<EatTheReichView> {
    return projectViewer(eatTheReichTemplate, this.authority, {
      roomId: ROOM_ID,
      viewerId: "table",
      capability: "table",
    });
  }

  explainPool(input: PoolInput): ReturnType<typeof eatTheReichTemplate.explainPool> {
    return eatTheReichTemplate.explainPool(this.getPlayerProjection(), input);
  }

  validAllocations(roll: VisibleRoll): ReturnType<typeof eatTheReichTemplate.validAllocations> {
    return eatTheReichTemplate.validAllocations(this.getPlayerProjection(), roll);
  }

  beginAction(threatId: string, actionId: string, gearIds: readonly string[]): DispatchResult {
    return this.dispatch(PLAYER_MEMBER_ID, {
      type: "BeginAction",
      actorMemberId: PLAYER_MEMBER_ID,
      threatId,
      actionId,
      gearIds,
    });
  }

  allocateResults(rollId: string, allocations: readonly RollAllocation[]): DispatchResult {
    return this.dispatch(PLAYER_MEMBER_ID, { type: "AllocateResults", rollId, allocations });
  }

  /**
   * The GM's opposition control (docs/PHASE_1C_PLAN.md, "GM opposition
   * controls"): submits `SubmitOpposition` with a human-chosen push-dice
   * value through the same dispatch path every other command uses. Replaces
   * Phase 1B's timed local GM stand-in.
   */
  submitOpposition(rollId: string, pushDice: number): DispatchResult {
    return this.dispatch(GM_MEMBER_ID, { type: "SubmitOpposition", rollId, pushDice });
  }

  /**
   * Test-support only (see `TABLE_MEMBER_ID`): attempts a command attributed
   * to the table capability through the real dispatch path, so a regression
   * test can prove platform authorization rejects it rather than relying on
   * the table UI's omission of controls alone.
   */
  attemptCommandAsTable(command: EatTheReichCommand): DispatchResult {
    return this.dispatch(TABLE_MEMBER_ID, command);
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

  private dispatch(memberId: MemberId, command: EatTheReichCommand): DispatchResult {
    const capability = this.capabilities.get(memberId);
    if (!capability) {
      throw new Error(`Unknown local member "${memberId}".`);
    }
    const actor: AuthorizedMemberContext = { roomId: ROOM_ID, memberId, capability };
    const commandId = asCommandId(globalThis.crypto.randomUUID());
    const seed = globalThis.crypto.getRandomValues(new Uint8Array(16));
    const random = createSeededRandom(seed);
    const receiptKey = `${memberId}:${commandId}`;
    const priorReceipt = this.receipts.get(receiptKey);

    const result = runCommand(eatTheReichTemplate, {
      member: actor,
      authority: this.authority,
      random,
      command,
      commandId,
      occurredAtServer: new Date().toISOString(),
      ...(priorReceipt !== undefined ? { priorReceipt } : {}),
    });

    if (!result.ok) {
      this.notifyError({ capability, code: result.code, message: result.message });
      return { ok: false, code: result.code, message: result.message, sharedEvents: [] };
    }

    this.authority = result.authority;
    this.receipts.set(receiptKey, result.receipt);
    const sharedEvents = result.envelopes
      .filter((delivered) => delivered.destination.kind === "shared")
      .map((delivered) => delivered.envelope.payload);
    this.notify();
    return { ok: true, sharedEvents };
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
    state,
  };
}
