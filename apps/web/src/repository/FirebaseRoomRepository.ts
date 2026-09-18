import type { FirebaseApp } from "firebase/app";
import { doc, getDoc, getDocFromServer, onSnapshot } from "firebase/firestore";
import { getAuth } from "firebase/auth";
import { FunctionsError } from "firebase/functions";
import {
  asTemplateId,
  parseCommandReceiptDocument,
  receiptIdFor,
  STABLE_ERROR_CODES,
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
import type {
  EatTheReichCommand,
  EatTheReichEvent,
  EatTheReichView,
} from "@digitable/template-eat-the-reich";
import { eatTheReichTemplate } from "@digitable/template-eat-the-reich";
import { callable, getRoomFunctions, type FunctionsEmulatorConfig } from "../firebase/functions.js";
import { getRoomFirestore, type FirestoreEmulatorConfig } from "../firebase/firestore.js";
import { stableErrorFromThrown } from "../firebase/functionsError.js";
import { CommandOutbox, type PendingCommand } from "./commandOutbox.js";

export interface RoomRepositoryEmulatorConfig {
  readonly functions: FunctionsEmulatorConfig;
  readonly firestore: FirestoreEmulatorConfig;
}

/** The wire shape `submitRoomCommand` actually expects (board task A04): a `roomId` plus the command envelope, which now carries the client's own template identity. */
interface SubmitRoomCommandWireRequest {
  readonly roomId: string;
  readonly command: {
    readonly commandId: string;
    readonly payload: unknown;
    readonly expectedRevision?: number;
    readonly templateId: string;
    readonly templateVersion: string;
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Runtime-validates a `projections/{viewerId}` document read from Firestore.
 * Client reads are read-only and rules-enforced (Phase 2 PR 2), but a
 * document is still untrusted *shape* until checked — this never
 * reconstructs a projection from event history (docs/ARCHITECTURE.md
 * section 8: "Client receives projections only"), only validates the one
 * document it was given.
 */
function parseViewerProjection(data: unknown): ViewerProjection<EatTheReichView> {
  if (!isRecord(data)) {
    throw new Error("Malformed projection document.");
  }
  const {
    platformVersion,
    templateId,
    templateVersion,
    schemaVersion,
    viewerId,
    roomRevision,
    view,
  } = data;
  if (
    typeof platformVersion !== "string" ||
    typeof templateId !== "string" ||
    typeof templateVersion !== "string" ||
    typeof schemaVersion !== "number" ||
    typeof viewerId !== "string" ||
    typeof roomRevision !== "number" ||
    view === undefined
  ) {
    throw new Error("Malformed projection document.");
  }
  return {
    platformVersion,
    templateId: asTemplateId(templateId),
    templateVersion,
    schemaVersion,
    viewerId: viewerId as ViewerContext["viewerId"],
    roomRevision,
    view: view as EatTheReichView,
  };
}

/**
 * Board task A05: the real, network-backed `RoomRepository` — the client
 * half of board tasks A01/A03/A04's trusted authority. Every command flows
 * through the `submitRoomCommand` callable (real HTTPS/SDK transport, not a
 * local handler call); every projection is read or watched directly off
 * `rooms/{roomId}/projections/{viewerId}` (Firestore SDK), never
 * reconstructed from `authority/current` or an event tail — that document
 * and the event partitions are denied to every client role
 * (`firestore.rules`, Phase 2 PR 2).
 */
export class FirebaseRoomRepository implements RoomRepository<
  EatTheReichCommand,
  EatTheReichEvent,
  EatTheReichView
> {
  private readonly app: FirebaseApp;
  private readonly roomId: RoomId;
  private readonly capability: Capability;
  private readonly emulator: RoomRepositoryEmulatorConfig | undefined;
  private readonly errorListeners = new Set<(failure: RoomDispatchFailure) => void>();
  private uid: string | null = null;
  private readonly waiting = new Map<
    string,
    {
      promise: Promise<RoomCommandResult<EatTheReichEvent>>;
      resolve: (result: RoomCommandResult<EatTheReichEvent>) => void;
    }
  >();
  private readonly sending = new Set<string>();

  /**
   * `capability` is this browser tab's own seat capability (known once from
   * the create/join/claim result — `FirebaseSessionClient`), used only to
   * label this repository's own `subscribeToErrors` broadcasts; unlike
   * `InMemoryRoomRepository`, a single instance here always belongs to
   * exactly one signed-in identity, never simulates multiple roles.
   */
  constructor(
    app: FirebaseApp,
    roomId: RoomId,
    capability: Capability,
    emulator?: RoomRepositoryEmulatorConfig,
    private readonly storage?: Storage,
  ) {
    this.app = app;
    this.roomId = roomId;
    this.capability = capability;
    this.emulator = emulator;
  }

  /**
   * `memberId` is accepted for `RoomRepository` interface conformance
   * (`InMemoryRoomRepository`'s local simulation needs it to pick a
   * capability out of its own in-process map) but is not sent over the
   * wire: the trusted `submitRoomCommand` callable resolves the acting
   * member from the caller's Firebase Auth UID via `uidBindings` alone,
   * never from a client-asserted identity (board task A04, §1).
   */
  async dispatch(
    memberId: MemberId,
    request: RoomCommandRequest<EatTheReichCommand>,
  ): Promise<RoomCommandResult<EatTheReichEvent>> {
    let entry: PendingCommand;
    try {
      entry = this.outbox(memberId).remember(request);
    } catch {
      return {
        status: "rejected",
        commandId: request.commandId,
        code: "INVALID_REQUEST",
        message:
          "Could not save this action safely. Check browser storage and your signed-in seat before trying again.",
      };
    }
    const existing = this.waiting.get(request.commandId);
    if (existing) return existing.promise;
    let resolve!: (result: RoomCommandResult<EatTheReichEvent>) => void;
    const promise = new Promise<RoomCommandResult<EatTheReichEvent>>((done) => {
      resolve = done;
    });
    this.waiting.set(request.commandId, { promise, resolve });
    // A failed transport leaves the promise and saved command pending.
    // Reconciliation settles it only after a definitive outcome is known.
    void this.send(memberId, entry).catch(() => {
      /* Reconnect will retry. */
    });
    return promise;
  }

  private outbox(memberId: MemberId): CommandOutbox {
    const uid = getAuth(this.app).currentUser?.uid;
    if (!uid || (this.uid !== null && this.uid !== uid)) throw new Error("Identity changed.");
    this.uid = uid;
    const storage = this.storage ?? (typeof window !== "undefined" ? window.localStorage : null);
    if (!storage) throw new Error("Persistent storage unavailable.");
    const project = `${this.app.options.projectId ?? this.app.name}:${this.emulator ? `${this.emulator.firestore.host}:${this.emulator.firestore.port}` : "live"}`;
    return new CommandOutbox(storage, project, uid, this.roomId, memberId);
  }

  pendingCommands(memberId: MemberId): readonly RoomCommandRequest<EatTheReichCommand>[] {
    return this.outbox(memberId)
      .read()
      .map((entry) => entry.request);
  }

  private async send(
    memberId: MemberId,
    entry: PendingCommand,
  ): Promise<RoomCommandResult<EatTheReichEvent> | null> {
    const { request } = entry;
    if (this.sending.has(request.commandId)) return null;
    this.outbox(memberId); // Check identity again immediately before sending.
    this.sending.add(request.commandId);
    try {
      const fn = callable<SubmitRoomCommandWireRequest, RoomCommandResult<EatTheReichEvent>>(
        getRoomFunctions(this.app, this.emulator?.functions),
        "submitRoomCommand",
      );
      const wire: SubmitRoomCommandWireRequest = {
        roomId: this.roomId,
        command: {
          commandId: request.commandId,
          payload: request.payload,
          ...(request.expectedRevision === undefined
            ? {}
            : { expectedRevision: request.expectedRevision }),
          templateId: entry.templateId,
          templateVersion: entry.templateVersion,
        },
      };
      let result: RoomCommandResult<EatTheReichEvent>;
      try {
        const response = await fn(wire);
        result = response.data;
      } catch (error) {
        // Only explicit, validated application rejections are terminal.
        // Timeouts, unavailable/internal errors and malformed replies are
        // ambiguous even when the request may already have committed.
        if (
          !(error instanceof FunctionsError) ||
          !isRecord(error.details) ||
          !STABLE_ERROR_CODES.includes(error.details.code as (typeof STABLE_ERROR_CODES)[number])
        )
          return null;
        const { code, message } = stableErrorFromThrown(error);
        result = { status: "rejected", commandId: request.commandId, code, message };
      }
      if (
        result.commandId !== request.commandId ||
        (result.status !== "accepted" && result.status !== "rejected")
      )
        return null;
      this.complete(memberId, result);
      return result;
    } finally {
      this.sending.delete(request.commandId);
    }
  }

  private complete(memberId: MemberId, result: RoomCommandResult<EatTheReichEvent>): void {
    this.outbox(memberId).forget(result.commandId);
    this.waiting.get(result.commandId)?.resolve(result);
    this.waiting.delete(result.commandId);
    if (result.status === "rejected") {
      this.notifyError({ capability: this.capability, code: result.code, message: result.message });
    }
  }

  async reconcilePending(
    memberId: MemberId,
  ): Promise<readonly RoomCommandResult<EatTheReichEvent>[]> {
    const outbox = this.outbox(memberId);
    const results: RoomCommandResult<EatTheReichEvent>[] = [];
    const db = getRoomFirestore(this.app, this.emulator?.firestore);
    for (const entry of outbox.read()) {
      const { request } = entry;
      if (this.sending.has(request.commandId)) continue;
      const receiptId = receiptIdFor(memberId, request.commandId);
      const snapshot = await getDocFromServer(
        doc(db, `rooms/${this.roomId}/receipts/${receiptId}`),
      );
      this.outbox(memberId); // Never continue under a replacement identity.
      if (snapshot.exists()) {
        const receipt = parseCommandReceiptDocument(snapshot.data());
        if (
          receipt.memberId !== memberId ||
          receipt.commandId !== request.commandId ||
          receipt.receiptId !== receiptId
        ) {
          throw new Error("Receipt identity mismatch.");
        }
        let result: RoomCommandResult<EatTheReichEvent>;
        if (receipt.status === "rejected") {
          result = {
            status: "rejected",
            commandId: request.commandId,
            code: receipt.code!,
            message: receipt.message!,
          };
        } else {
          const sharedEvents: EatTheReichEvent[] = [];
          if (receipt.acceptedSequence !== null) {
            const event = await getDocFromServer(
              doc(db, `rooms/${this.roomId}/events/shared/items/${receipt.acceptedSequence}`),
            );
            if (event.exists()) {
              const data = event.data();
              if (data.commandId !== request.commandId) throw new Error("Event identity mismatch.");
              sharedEvents.push(eatTheReichTemplate.schemas.parseEvent(data.payload));
            }
          }
          result = {
            status: "accepted",
            commandId: request.commandId,
            roomRevision: receipt.roomRevision,
            sharedEvents,
          };
        }
        this.complete(memberId, result);
        results.push(result);
        continue;
      }
      // No durable outcome exists. Retrying the identical command ID is
      // safe: the trusted transaction either commits it once or returns its
      // existing receipt if a concurrent/lost invocation already won.
      const result = await this.send(memberId, entry);
      if (result) results.push(result);
    }
    return results;
  }

  async getProjection(viewer: ViewerContext): Promise<ViewerProjection<EatTheReichView>> {
    const db = getRoomFirestore(this.app, this.emulator?.firestore);
    const snapshot = await getDoc(doc(db, `rooms/${this.roomId}/projections/${viewer.viewerId}`));
    if (!snapshot.exists()) {
      throw new Error(`No projection exists yet for viewer "${viewer.viewerId}".`);
    }
    return parseViewerProjection(snapshot.data());
  }

  /**
   * `RoomRepository`'s live-update primitive. Delivers no initial value
   * synchronously (matching the in-memory implementation's own documented
   * contract) — `onSnapshot`'s first callback (which fires once with the
   * current cached/server value) is intentionally not treated specially
   * here; callers that need a starting value call `getProjection` first.
   *
   * `onSnapshot`'s error callback (independent A05 review, Low finding: the
   * first version of this method had none, so a dead listener —
   * permission-denied after a rules change, a sustained network partition —
   * went completely silent, with neither `listener` nor
   * `subscribeToErrors`' listeners ever told the live feed had stopped)
   * relays the failure through `subscribeToErrors`, the same broadcast
   * channel `dispatch` rejections already use — there is no second,
   * projection-specific error channel in the `RoomRepository` interface to
   * add one to.
   */
  subscribeToProjection(
    viewer: ViewerContext,
    listener: (projection: ViewerProjection<EatTheReichView>) => void,
  ): Unsubscribe {
    const db = getRoomFirestore(this.app, this.emulator?.firestore);
    const ref = doc(db, `rooms/${this.roomId}/projections/${viewer.viewerId}`);
    return onSnapshot(
      ref,
      (snapshot) => {
        if (!snapshot.exists()) return;
        try {
          listener(parseViewerProjection(snapshot.data()));
        } catch {
          // A malformed projection document is a server bug, not something
          // this listener can recover from; drop the update rather than
          // crash the subscription (the next valid snapshot still arrives).
        }
      },
      () => {
        this.notifyError({
          capability: this.capability,
          code: "ROOM_DATA_INVALID",
          message: "Lost the live connection to this room's data. Refresh to reconnect.",
        });
      },
    );
  }

  /**
   * Narrower than `InMemoryRoomRepository`'s same-named method: that one
   * broadcasts every role's rejected dispatch to every locally-simulated
   * role because all roles share one in-process object. A real client has
   * no server-side "broadcast this rejection to every connected viewer"
   * channel today (nothing in `docs/ARCHITECTURE.md` proposes one, and
   * `apps/functions` never writes anything queryable for it) — this
   * repository instance only ever notifies its own local listeners about
   * its own dispatch attempts, which is what one browser tab actually has
   * available. Documented here rather than silently matching the wider
   * in-memory contract's wording without the machinery to back it.
   */
  subscribeToErrors(listener: (failure: RoomDispatchFailure) => void): Unsubscribe {
    this.errorListeners.add(listener);
    return () => this.errorListeners.delete(listener);
  }

  private notifyError(failure: RoomDispatchFailure): void {
    for (const listener of this.errorListeners) listener(failure);
  }
}
