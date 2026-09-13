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
import { LOCAL_GM_PUSH_DICE } from "./localGmPolicy.js";

/** The one player seat this local vertical slice supports. */
export const PLAYER_MEMBER_ID = asMemberId("player-local");

/** Internal-only: the local GM stand-in's seat. Never surfaced to the UI. */
const GM_MEMBER_ID = asMemberId("gm-local");

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

/**
 * Holds one `AuthorityRecord<EatTheReichState>` in memory and runs every
 * command through the same `runCommand`/`projectViewer` pipeline a trusted
 * server will later run, per docs/DATA_AND_SYNC_MODEL.md: "The local
 * vertical slice implements the same repository interface in memory/local
 * storage." There is no persistence beyond the lifetime of this object.
 */
export class InMemoryRoomRepository {
  private authority: AuthorityRecord<EatTheReichState>;
  private readonly capabilities: ReadonlyMap<MemberId, Capability>;
  private readonly receipts = new Map<string, AcceptedCommandReceipt>();
  private readonly listeners = new Set<Listener>();

  constructor() {
    this.authority = createInitialAuthority();
    this.capabilities = new Map([
      [PLAYER_MEMBER_ID, "player"],
      [GM_MEMBER_ID, "gm"],
    ]);
  }

  /** Notifies `listener` after every accepted command (including the local GM stand-in's). */
  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getPlayerProjection(): ViewerProjection<EatTheReichView> {
    return projectViewer(
      eatTheReichTemplate,
      this.authority,
      this.viewerContextFor(PLAYER_MEMBER_ID),
    );
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
   * The local GM stand-in described in ./localGmPolicy.ts. The UI decides
   * *when* to call this (it owns the reduced-motion-aware presentation
   * delay for the `waiting-on-gm` state); this method only decides *what*
   * the stand-in submits.
   */
  simulateOpposition(rollId: string): DispatchResult {
    return this.dispatch(GM_MEMBER_ID, {
      type: "SubmitOpposition",
      rollId,
      pushDice: LOCAL_GM_PUSH_DICE,
    });
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
