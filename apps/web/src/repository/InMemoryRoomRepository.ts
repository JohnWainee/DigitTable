import {
  type AuthorityRecord,
  type AuthorizedMemberContext,
  type Capability,
  type MemberId,
  type RoomCommandRequest,
  type RoomCommandResult,
  type RoomDispatchFailure,
  type RoomId,
  type RoomRepository,
  type Unsubscribe,
  type ViewerContext,
  type ViewerProjection,
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
} from "@digitable/template-eat-the-reich";

const PLATFORM_VERSION = "0.0.0-local";

type ChangeListener = () => void;
type ErrorListener = (failure: RoomDispatchFailure) => void;

/**
 * C06 (issue #14): holds one `AuthorityRecord<EatTheReichState>` in memory
 * and runs every command through the same `runCommand`/`projectViewer`
 * pipeline the trusted server (`apps/functions`) runs, per
 * docs/DATA_AND_SYNC_MODEL.md: "The local vertical slice implements the
 * same repository interface in memory/local storage." There is no
 * persistence beyond the lifetime of this object.
 *
 * Rewritten for C06 to be multi-room: the Phase 1C version hardcoded one
 * fixed room/player/GM/table member ID for a single-browser-tab local
 * simulation of the (now-deleted) placeholder template. Real membership
 * (which memberId maps to which capability) is decided by
 * `apps/web/src/session/RoomEngineStore.ts`'s create/join/claim simulation,
 * not by this class — this class only needs to know which capability each
 * memberId it is told about holds, via `registerMember`.
 *
 * Implements `@digitable/contracts`'s `RoomRepository`, the same interface
 * `FirebaseRoomRepository` implements, so UI code can be written once
 * against `RoomRepository` and given either at runtime
 * (`apps/web/src/session/roomClient.ts`'s bootstrap seam).
 */
export class InMemoryRoomRepository implements RoomRepository<
  EatTheReichCommand,
  EatTheReichEvent,
  EatTheReichView
> {
  private authority: AuthorityRecord<EatTheReichState>;
  private readonly roomId: RoomId;
  private readonly capabilities = new Map<MemberId, Capability>();
  private readonly receipts = new Map<string, AcceptedCommandReceipt>();
  private readonly listeners = new Set<ChangeListener>();
  private readonly errorListeners = new Set<ErrorListener>();

  constructor(roomId: RoomId, gmMemberId: MemberId) {
    this.roomId = roomId;
    this.authority = createInitialAuthority(roomId, gmMemberId);
    this.capabilities.set(gmMemberId, "gm");
  }

  /** Called by `RoomEngineStore` once a join/claim-table simulation admits a new member. */
  registerMember(memberId: MemberId, capability: Capability): void {
    this.capabilities.set(memberId, capability);
  }

  /** Notifies `listener` after every accepted command, from any role. */
  subscribe(listener: ChangeListener): Unsubscribe {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Notifies `listener` after every rejected/failed dispatch, from any role. */
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

  private projectionFor(viewer: ViewerContext): ViewerProjection<EatTheReichView> {
    return projectViewer(eatTheReichTemplate, this.authority, viewer);
  }

  /**
   * `RoomRepository.dispatch`: the sole command-execution entry point.
   * `request.commandId` is caller-supplied so a caller that stores it
   * before dispatching and resubmits the same value on retry reaches
   * `runCommand`'s `priorReceipt` short-circuit and gets back the original
   * result without re-deciding or re-drawing randomness.
   */
  dispatch(
    memberId: MemberId,
    request: RoomCommandRequest<EatTheReichCommand>,
  ): Promise<RoomCommandResult<EatTheReichEvent>> {
    const capability = this.capabilities.get(memberId);
    if (!capability) {
      throw new Error(`Unknown local member "${memberId}".`);
    }
    const actor: AuthorizedMemberContext = { roomId: this.roomId, memberId, capability };
    const seed = globalThis.crypto.getRandomValues(new Uint8Array(16));
    const random = createSeededRandom(seed);
    // `${memberId}_${commandId}`: docs/ARCHITECTURE.md section 8's receipt-id scheme.
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

function createInitialAuthority(
  roomId: RoomId,
  gmMemberId: MemberId,
): AuthorityRecord<EatTheReichState> {
  const state = eatTheReichTemplate.initialState({ roomId, gmMemberId, memberIds: [] });
  return {
    platformVersion: PLATFORM_VERSION,
    templateId: eatTheReichTemplate.manifest.templateId,
    templateVersion: eatTheReichTemplate.manifest.templateVersion,
    schemaVersion: eatTheReichTemplate.manifest.currentSchemaVersion,
    roomRevision: 0,
    nextSequence: 1,
    roomStatus: "active",
    gmMemberId,
    admissionStatus: "open",
    participantCount: 1,
    tableSeatClaimed: false,
    state,
  };
}
