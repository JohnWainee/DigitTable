import { createHash, randomBytes as nodeRandomBytes } from "node:crypto";
import type { Firestore, Transaction } from "firebase-admin/firestore";
import { eatTheReichTemplate } from "@digitable/template-eat-the-reich";
import type { EatTheReichEvent } from "@digitable/template-eat-the-reich";
import {
  authorizePlatform,
  createSeededRandom,
  projectViewer,
  runCommand,
} from "@digitable/engine";
import {
  RoomDataError,
  asCommandId,
  asMemberId,
  asRoomId,
  parseAuthorityRecord,
  parseCommandReceiptDocument,
  parseUidBindingDocument,
  receiptIdFor,
  type AuthorizedMemberContext,
  type Capability,
  type CommandReceiptDocument,
  type EventDestination,
  type MemberId,
  type RoomCommandRejected,
  type RoomCommandResult,
  type StableErrorCode,
} from "@digitable/contracts";

export type GameCommandResult = RoomCommandResult<EatTheReichEvent>;

// -- Wire-level request validation (board task A04) --

const MIN_COMMAND_ID_LENGTH = 8;
const MAX_COMMAND_ID_LENGTH = 128;
const MAX_TEMPLATE_VERSION_LENGTH = 32;

/**
 * `docs/ARCHITECTURE.md` section 8: "commandId validated as a UUID before
 * use." A UUID-*shaped* check (independent review finding, Low): the prior
 * length-only bound let a `commandId` containing `/` reach
 * `receiptIdFor`'s path construction unmangled, which could only ever
 * produce a malformed (odd-segment) Firestore path within this room's own
 * subtree — never an authorization bypass or a path outside `rooms/
 * {roomId}` — but would have surfaced as an unhandled exception (generic
 * `internal`) instead of a clean `INVALID_REQUEST`. `crypto.randomUUID()`
 * output is the only value a real client sends; this accepts that exact
 * shape.
 */
const COMMAND_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class GameCommandInputError extends Error {}

export interface WireCommandRequest {
  readonly commandId: string;
  readonly payload: unknown;
  readonly expectedRevision?: number;
  /**
   * The client's own template build (independent review finding, Medium):
   * without a client-asserted value here, `authorizePlatform`'s
   * `TEMPLATE_VERSION_MISMATCH` check was comparing the room's
   * `authority/current.templateId`/`templateVersion` against themselves —
   * vacuously true, so a stale/incompatible client build could never be
   * rejected by that guard. The client sends the template manifest it was
   * actually built against (`eatTheReichTemplate.manifest`), and this is
   * checked against the room's live values, not the other way around.
   */
  readonly templateId: string;
  readonly templateVersion: string;
}

/**
 * Runtime-validates the untrusted wire envelope — everything except
 * `payload`'s internal shape, which `template.schemas.parseCommand`
 * validates once platform authorization has already run (docs/PHASE_2_PR4_PLAN.md
 * §4.3, §12.1).
 */
export function parseWireCommandRequest(value: unknown): WireCommandRequest {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new GameCommandInputError("game command input: root: expected an object");
  }
  const { commandId, payload, expectedRevision, templateId, templateVersion } = value as Record<
    string,
    unknown
  >;
  if (
    typeof commandId !== "string" ||
    commandId.length < MIN_COMMAND_ID_LENGTH ||
    commandId.length > MAX_COMMAND_ID_LENGTH ||
    !COMMAND_ID_PATTERN.test(commandId)
  ) {
    throw new GameCommandInputError("game command input: commandId: expected a UUID");
  }
  if (typeof templateId !== "string" || templateId.length === 0) {
    throw new GameCommandInputError("game command input: templateId: expected a non-empty string");
  }
  if (
    typeof templateVersion !== "string" ||
    templateVersion.length === 0 ||
    templateVersion.length > MAX_TEMPLATE_VERSION_LENGTH
  ) {
    throw new GameCommandInputError(
      "game command input: templateVersion: expected a non-empty bounded string",
    );
  }
  if (
    expectedRevision !== undefined &&
    (typeof expectedRevision !== "number" ||
      !Number.isInteger(expectedRevision) ||
      expectedRevision < 0)
  ) {
    throw new GameCommandInputError(
      "game command input: expectedRevision: expected a non-negative integer or undefined",
    );
  }
  return expectedRevision === undefined
    ? { commandId, payload, templateId, templateVersion }
    : { commandId, payload, expectedRevision, templateId, templateVersion };
}

// -- Capability resolution (docs/PHASE_2_PR4_PLAN.md §1) --

/**
 * Resolves the caller's Firebase Auth UID to a platform capability, reading
 * only `uidBindings/{uid}` — never a client-asserted `memberId`/`capability`
 * field, and never `bindings/{memberId}` (that document's only field beyond
 * what `uidBindings` already gives is `uid`, needed only to cross-check a
 * binding back against itself, which is circular — see §1's plan note).
 */
/** Kept branded (`MemberId`), unlike `@digitable/engine`'s `PlatformMember.memberId: string` — this module needs the branded form for `receiptIdFor`/`CommandReceiptDocument`; it widens implicitly (a `MemberId` is always assignable to `string`) at the one call site (`authorizePlatform`) that wants `PlatformMember`. */
export interface ResolvedMember {
  readonly memberId: MemberId;
  readonly capability: Capability;
}

async function resolveCapability(
  txn: Transaction,
  db: Firestore,
  roomId: string,
  uid: string,
): Promise<ResolvedMember | null> {
  const snapshot = await txn.get(db.doc(`rooms/${roomId}/uidBindings/${uid}`));
  if (!snapshot.exists) return null;
  const binding = parseUidBindingDocument(snapshot.data());
  return { memberId: binding.memberId, capability: binding.capability };
}

// -- Structured logging (docs/PHASE_2_PR4_PLAN.md §10) --

export interface GameCommandLogger {
  info(event: string, fields: Readonly<Record<string, string>>): void;
}

/** A hash, never the raw room ID, in log lines (docs/PHASE_2_PR4_PLAN.md §10.1). */
function hashForLog(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex").slice(0, 16);
}

export interface GameCommandDependencies {
  readonly db: Firestore;
  readonly logger: GameCommandLogger;
  /** Injected so `occurredAtServer` is testable; `() => new Date().toISOString()` in production. */
  readonly occurredAtServer: () => string;
  /** Injected seed source so tests can fix dice outcomes; `crypto.randomBytes` in production. */
  readonly randomBytes: (size: number) => Uint8Array;
}

export const productionGameCommandClock = {
  occurredAtServer: (): string => new Date().toISOString(),
  randomBytes: (size: number): Uint8Array => new Uint8Array(nodeRandomBytes(size)),
};

// -- Event partition paths (docs/PHASE_2_PR4_PLAN.md §5.5, matching firestore.rules literally) --

function eventPartitionPath(
  roomId: string,
  destination: EventDestination,
  sequence: number,
): string {
  const partition =
    destination.kind === "member" ? `member-${destination.memberId}` : destination.kind;
  return `rooms/${roomId}/events/${partition}/items/${sequence}`;
}

function rejectedResult(
  commandId: string,
  code: StableErrorCode,
  message: string,
): RoomCommandRejected {
  return { status: "rejected", commandId: asCommandId(commandId), code, message };
}

/** Writes a rejected receipt (docs/PHASE_2_PR4_PLAN.md §2.2 option (a)) so a retry replays the identical rejection instead of re-deciding against possibly-changed state. Skipped when `member` is `null` (no receipt path exists without a memberId). */
function writeRejectedReceipt(
  txn: Transaction,
  db: Firestore,
  roomId: string,
  member: ResolvedMember | null,
  commandId: string,
  roomRevision: number,
  code: StableErrorCode,
  message: string,
): void {
  if (member === null) return;
  const receiptId = receiptIdFor(member.memberId, asCommandId(commandId));
  const receipt: CommandReceiptDocument = {
    receiptId,
    memberId: member.memberId,
    commandId: asCommandId(commandId),
    status: "rejected",
    acceptedSequence: null,
    roomRevision,
    code,
    message,
  };
  txn.set(db.doc(`rooms/${roomId}/receipts/${receiptId}`), receipt);
}

/**
 * Every live viewer's memberId+capability for the current room, read from
 * the `bindings` collection (which has one document per seated member,
 * including the table seat) — the same set `docs/PHASE_2_PR4_PLAN.md` §5.3
 * calls "every member with a binding, plus `gm`, plus `table` if a table
 * seat is claimed." Read unconditionally, before any write, so the
 * transaction never reads after a write (Firestore's own requirement) even
 * though this list is only used when a command is actually accepted.
 */
async function liveBindings(
  txn: Transaction,
  db: Firestore,
  roomId: string,
): Promise<readonly { readonly memberId: MemberId; readonly capability: Capability }[]> {
  const snapshot = await txn.get(db.collection(`rooms/${roomId}/bindings`));
  return snapshot.docs.map((doc) => {
    const data = doc.data() as { readonly memberId?: unknown; readonly capability?: unknown };
    if (typeof data.memberId !== "string" || data.memberId.length === 0) {
      throw new RoomDataError(`room data: bindings/${doc.id}.memberId: malformed or missing`);
    }
    if (data.capability !== "player" && data.capability !== "gm" && data.capability !== "table") {
      throw new RoomDataError(`room data: bindings/${doc.id}.capability: malformed or missing`);
    }
    return { memberId: asMemberId(data.memberId), capability: data.capability };
  });
}

/** Runs one game-command transaction, mapping a fail-closed data error to a stable denial — same shape as `admissionAuthority.ts`/`createRoomAuthority.ts`. */
async function runGameCommandTransaction(
  db: Firestore,
  commandId: string,
  body: (txn: Transaction) => Promise<GameCommandResult>,
): Promise<GameCommandResult> {
  try {
    return await db.runTransaction(body);
  } catch (error) {
    if (error instanceof RoomDataError) {
      return rejectedResult(
        commandId,
        "ROOM_DATA_INVALID",
        "This room's data could not be verified.",
      );
    }
    throw error;
  }
}

/**
 * Resolves and dispatches one game command inside a single Firestore
 * transaction (board task A04, `docs/PHASE_2_PR4_PLAN.md`). Order:
 * capability resolution (§1) → receipt lookup (§2) → authority read →
 * every-live-viewer read → [pure decision, no I/O] → expectedRevision
 * check (§6) → platform authorization (§4) → command parse (§12.1) →
 * `runCommand` (decide/reduce) → atomic writes (§5): authority, receipt,
 * every emitted event's destination-partitioned copy, and every live
 * viewer's freshly recomputed projection.
 *
 * A rejected outcome (from any of the checks above, or from `runCommand`
 * itself) still writes a receipt (§2.2 option (a)) so a client retry of a
 * rejected command replays the identical rejection rather than re-deciding
 * against possibly-changed state — except when the caller isn't a member
 * at all (`AUTH_REQUIRED`), which has no receipt path to write to.
 */
export async function submitRoomCommand(
  roomId: string,
  uid: string,
  wire: WireCommandRequest,
  deps: GameCommandDependencies,
): Promise<GameCommandResult> {
  const { db } = deps;
  const seed = deps.randomBytes(32);
  const occurredAtServer = deps.occurredAtServer();
  const startedAtMs = Date.now();
  const result = await runGameCommandTransaction(db, wire.commandId, async (txn) => {
    const member = await resolveCapability(txn, db, roomId, uid);
    // Checked immediately, before any other read: an unauthenticated-for-
    // this-room caller must never learn anything about the room's data
    // (independent review finding, Low — a corrupted authority/bindings
    // document previously surfaced as ROOM_DATA_INVALID before this check
    // ever ran, a minor "room exists and is corrupted" disclosure to a
    // caller who isn't even a member).
    if (member === null) {
      return rejectedResult(
        wire.commandId,
        "AUTH_REQUIRED",
        "Sign-in is required to act in this room.",
      );
    }

    const receiptRef = db.doc(
      `rooms/${roomId}/receipts/${receiptIdFor(member.memberId, asCommandId(wire.commandId))}`,
    );
    const receiptSnap = await txn.get(receiptRef);

    const authorityRef = db.doc(`rooms/${roomId}/authority/current`);
    const authoritySnap = await txn.get(authorityRef);
    if (!authoritySnap.exists) {
      throw new RoomDataError("room data: authority/current: missing");
    }
    const authority = parseAuthorityRecord(authoritySnap.data(), eatTheReichTemplate);

    // Read unconditionally (before any write); only used on the accept path.
    const bindings = await liveBindings(txn, db, roomId);

    if (receiptSnap.exists) {
      const stored = parseCommandReceiptDocument(receiptSnap.data());
      if (stored.status === "rejected") {
        return rejectedResult(
          wire.commandId,
          stored.code ?? "ROOM_DATA_INVALID",
          stored.message ?? "This command was previously rejected.",
        );
      }
      // Matches ADR-002/repository.ts's documented limitation: a retry's
      // `sharedEvents` comes back empty rather than duplicating the
      // original (receipts store sequence numbers, not event payloads), so
      // there is no need to reconstruct `runCommand`'s `priorReceipt`
      // short-circuit here — the stored receipt alone is enough to answer.
      return {
        status: "accepted",
        commandId: asCommandId(wire.commandId),
        roomRevision: stored.roomRevision,
        sharedEvents: [],
      };
    }

    if (wire.expectedRevision !== undefined && wire.expectedRevision !== authority.roomRevision) {
      writeRejectedReceipt(
        txn,
        db,
        roomId,
        member,
        wire.commandId,
        authority.roomRevision,
        "REVISION_CONFLICT",
        "This room has moved on since your last update. Refresh and try again.",
      );
      return rejectedResult(
        wire.commandId,
        "REVISION_CONFLICT",
        "This room has moved on since your last update. Refresh and try again.",
      );
    }

    const platformResult = authorizePlatform(
      member,
      {
        status: authority.roomStatus,
        templateId: authority.templateId,
        templateVersion: authority.templateVersion,
      },
      // The client's own asserted build (`wire.templateId`/`templateVersion`,
      // independent review finding) checked against the room's live values
      // — not the room's values compared to themselves, which could never
      // reject anything.
      { templateId: wire.templateId, templateVersion: wire.templateVersion, payload: wire.payload },
    );
    if (!platformResult.allowed) {
      writeRejectedReceipt(
        txn,
        db,
        roomId,
        member,
        wire.commandId,
        authority.roomRevision,
        platformResult.code,
        platformResult.message,
      );
      return rejectedResult(wire.commandId, platformResult.code, platformResult.message);
    }

    let command;
    try {
      command = eatTheReichTemplate.schemas.parseCommand(wire.payload);
    } catch {
      const code: StableErrorCode = "UNKNOWN_ACTION";
      const message = "This command was not recognized.";
      writeRejectedReceipt(
        txn,
        db,
        roomId,
        member,
        wire.commandId,
        authority.roomRevision,
        code,
        message,
      );
      return rejectedResult(wire.commandId, code, message);
    }

    const actorContext: AuthorizedMemberContext = {
      roomId: asRoomId(roomId),
      memberId: member.memberId,
      capability: member.capability,
    };
    const random = createSeededRandom(seed);
    const decision = runCommand(eatTheReichTemplate, {
      member: actorContext,
      authority,
      random,
      command,
      commandId: asCommandId(wire.commandId),
      occurredAtServer,
    });

    if (!decision.ok) {
      writeRejectedReceipt(
        txn,
        db,
        roomId,
        member,
        wire.commandId,
        authority.roomRevision,
        decision.code,
        decision.message,
      );
      return rejectedResult(wire.commandId, decision.code, decision.message);
    }

    txn.set(authorityRef, decision.authority);

    const acceptedReceiptId = receiptIdFor(member.memberId, asCommandId(wire.commandId));
    const acceptedReceipt: CommandReceiptDocument = {
      receiptId: acceptedReceiptId,
      memberId: member.memberId,
      commandId: asCommandId(wire.commandId),
      status: "accepted",
      acceptedSequence: decision.receipt.acceptedSequences[0] ?? null,
      roomRevision: decision.receipt.roomRevision,
    };
    txn.set(db.doc(`rooms/${roomId}/receipts/${acceptedReceiptId}`), acceptedReceipt);

    const sharedEvents: EatTheReichEvent[] = [];
    for (const { destination, envelope } of decision.envelopes) {
      txn.set(db.doc(eventPartitionPath(roomId, destination, envelope.sequence)), envelope);
      if (destination.kind === "shared") {
        sharedEvents.push(envelope.payload);
      }
    }

    // Every live viewer's projection, freshly recomputed against the
    // post-command authority (docs/PHASE_2_PR4_PLAN.md §5.3/§5.4) — never
    // reused across viewers, never computed against pre-command state. Uses
    // the platform's own `projectViewer` (independent review finding, Low:
    // a hand-duplicated envelope here would silently drift if that
    // function's shape ever changed) rather than reassembling the same
    // fields inline.
    for (const binding of bindings) {
      const viewerId = binding.capability === "player" ? binding.memberId : binding.capability;
      const projection = projectViewer(eatTheReichTemplate, decision.authority, {
        roomId: asRoomId(roomId),
        viewerId,
        capability: binding.capability,
      });
      txn.set(db.doc(`rooms/${roomId}/projections/${viewerId}`), projection);
    }

    return {
      status: "accepted",
      commandId: asCommandId(wire.commandId),
      roomRevision: decision.receipt.roomRevision,
      sharedEvents,
    };
  });

  // Structured log: commandId, hashed roomId, result code/status, latency —
  // never payload, state, or the random seed (docs/PHASE_2_PR4_PLAN.md §10).
  deps.logger.info("gameCommand.result", {
    commandId: wire.commandId,
    roomIdHash: hashForLog(roomId),
    status: result.status,
    code: result.status === "rejected" ? result.code : "accepted",
    latencyMs: String(Date.now() - startedAtMs),
  });

  return result;
}
