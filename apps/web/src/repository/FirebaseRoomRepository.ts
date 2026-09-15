import type { FirebaseApp } from "firebase/app";
import { FunctionsError } from "firebase/functions";
import { doc, getDoc, onSnapshot } from "firebase/firestore";
import {
  asTemplateId,
  type Capability,
  type MemberId,
  type RoomCommandRequest,
  type RoomCommandResult,
  type RoomDispatchFailure,
  type RoomId,
  type RoomRepository,
  type StableErrorCode,
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
    _memberId: MemberId,
    request: RoomCommandRequest<EatTheReichCommand>,
  ): Promise<RoomCommandResult<EatTheReichEvent>> {
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
        templateId: eatTheReichTemplate.manifest.templateId,
        templateVersion: eatTheReichTemplate.manifest.templateVersion,
      },
    };
    let result: RoomCommandResult<EatTheReichEvent>;
    try {
      const response = await fn(wire);
      result = response.data;
    } catch (error) {
      const { code, message } = this.stableErrorFromThrown(error);
      result = { status: "rejected", commandId: request.commandId, code, message };
    }
    if (result.status === "rejected") {
      this.notifyError({ capability: this.capability, code: result.code, message: result.message });
    }
    return result;
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
   */
  subscribeToProjection(
    viewer: ViewerContext,
    listener: (projection: ViewerProjection<EatTheReichView>) => void,
  ): Unsubscribe {
    const db = getRoomFirestore(this.app, this.emulator?.firestore);
    const ref = doc(db, `rooms/${this.roomId}/projections/${viewer.viewerId}`);
    return onSnapshot(ref, (snapshot) => {
      if (!snapshot.exists()) return;
      try {
        listener(parseViewerProjection(snapshot.data()));
      } catch {
        // A malformed projection document is a server bug, not something
        // this listener can recover from; drop the update rather than
        // crash the subscription (the next valid snapshot still arrives).
      }
    });
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

  private stableErrorFromThrown(error: unknown): { code: StableErrorCode; message: string } {
    if (error instanceof FunctionsError) {
      const details = error.details;
      if (
        typeof details === "object" &&
        details !== null &&
        typeof (details as { readonly code?: unknown }).code === "string"
      ) {
        return {
          code: (details as { readonly code: string }).code as StableErrorCode,
          message: error.message,
        };
      }
    }
    return { code: "UNKNOWN_ACTION", message: "The command could not be completed." };
  }
}
