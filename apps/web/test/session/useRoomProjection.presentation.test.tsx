import { act, renderHook, waitFor, type RenderHookResult } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  asCommandId,
  asMemberId,
  asTemplateId,
  type EventTailCursor,
  type EventTailPage,
  type EventTailPartition,
  type EventTailRecord,
  type MemberId,
  type RoomCommandRequest,
  type RoomCommandResult,
  type RoomDispatchFailure,
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
import {
  useRoomProjection,
  type RoomProjectionState,
} from "../../src/session/useRoomProjection.js";
import { MemoryStorage } from "../memoryStorage.js";

type ActionRolled = Extract<EatTheReichEvent, { type: "ActionRolled" }>;
type ActionResolved = Extract<EatTheReichEvent, { type: "ActionResolved" }>;
type Repository = RoomRepository<EatTheReichCommand, EatTheReichEvent, EatTheReichView>;

/**
 * `getRoomRepository` is read lazily so each test can swap in its own fake
 * without a real room client or Firebase.
 */
const mocks = vi.hoisted(() => ({
  repository: null as Repository | null,
}));

vi.mock("../../src/session/roomClient.js", () => ({
  getRoomRepository: () => mocks.repository,
  ensureLiveAuthReady: () => Promise.resolve(),
}));

interface TailEvent {
  readonly eventId: string;
  readonly sequence: number;
  readonly roomRevision: number;
  readonly payload: EatTheReichEvent;
  readonly partition: EventTailPartition;
}

class FakeRepository implements Repository {
  projection: ViewerProjection<EatTheReichView>;
  head: EventTailCursor = { shared: 0, gm: 0, member: 0 };
  tail: TailEvent[] = [];
  reconcileResults: readonly RoomCommandResult<EatTheReichEvent>[] = [];
  tailError: Error | null = null;
  /** Rejects the next N head reads (then succeeds). */
  headFailures = 0;
  /** Rejects `getProjection` on this (1-based) call number. */
  failProjectionOnCall: number | null = null;
  projectionCalls = 0;
  private projectionGate: Promise<void> | null = null;
  /** When true, `reconcilePending` hands its results out once, like the real outbox. */
  reconcileOnce = false;
  readonly readEventTailCalls: EventTailCursor[] = [];
  readonly readEventTailHeadCalls: MemberId[] = [];
  readonly presentationScopeCalls: MemberId[] = [];
  private readonly projectionListeners = new Set<
    (projection: ViewerProjection<EatTheReichView>) => void
  >();

  constructor(projection: ViewerProjection<EatTheReichView>) {
    this.projection = projection;
  }

  pushProjection(next: ViewerProjection<EatTheReichView>): void {
    this.projection = next;
    for (const listener of this.projectionListeners) listener(next);
  }

  dispatch(
    _memberId: MemberId,
    request: RoomCommandRequest<EatTheReichCommand>,
  ): Promise<RoomCommandResult<EatTheReichEvent>> {
    return Promise.resolve({
      status: "rejected",
      commandId: request.commandId,
      code: "INVALID_REQUEST",
      message: "not used by this test",
    });
  }

  reconcilePending(_memberId: MemberId): Promise<readonly RoomCommandResult<EatTheReichEvent>[]> {
    const results = this.reconcileResults;
    if (this.reconcileOnce) this.reconcileResults = [];
    return Promise.resolve(results);
  }

  pendingCommands(_memberId: MemberId): readonly RoomCommandRequest<EatTheReichCommand>[] {
    return [];
  }

  /** Holds the next `getProjection` until the returned function is called. */
  holdNextProjection(): () => void {
    let release: () => void = () => undefined;
    this.projectionGate = new Promise<void>((resolve) => {
      release = resolve;
    });
    return release;
  }

  async getProjection(_viewer: ViewerContext): Promise<ViewerProjection<EatTheReichView>> {
    this.projectionCalls += 1;
    const gate = this.projectionGate;
    this.projectionGate = null;
    if (gate) await gate;
    if (this.failProjectionOnCall === this.projectionCalls) {
      throw new Error("projection unavailable");
    }
    return this.projection;
  }

  readEventTail(
    _memberId: MemberId,
    _viewer: ViewerContext,
    after: EventTailCursor,
    limit?: number,
  ): Promise<EventTailPage<EatTheReichEvent>> {
    this.readEventTailCalls.push({ ...after });
    if (this.tailError) return Promise.reject(this.tailError);
    const pageLimit = limit ?? 50;
    const matching = this.tail
      .filter((event) => event.sequence > after[event.partition])
      .sort((a, b) => a.sequence - b.sequence);
    const selected = matching.slice(0, pageLimit);
    const cursor = { shared: after.shared, gm: after.gm, member: after.member };
    const records: EventTailRecord<EatTheReichEvent>[] = selected.map((event) => {
      cursor[event.partition] = event.sequence;
      return {
        eventId: event.eventId,
        commandId: `cmd-${event.eventId}`,
        sequence: event.sequence,
        roomRevision: event.roomRevision,
        partition: event.partition,
        payload: event.payload,
      };
    });
    return Promise.resolve({ records, cursor, hasMore: matching.length > selected.length });
  }

  presentationScope(memberId: MemberId): string {
    this.presentationScopeCalls.push(memberId);
    return "test-scope";
  }

  readEventTailHead(memberId: MemberId, _viewer: ViewerContext): Promise<EventTailCursor> {
    this.readEventTailHeadCalls.push(memberId);
    if (this.headFailures > 0) {
      this.headFailures -= 1;
      return Promise.reject(new Error("head unavailable"));
    }
    return Promise.resolve({ ...this.head });
  }

  subscribeToProjection(
    _viewer: ViewerContext,
    listener: (projection: ViewerProjection<EatTheReichView>) => void,
  ): Unsubscribe {
    this.projectionListeners.add(listener);
    return () => this.projectionListeners.delete(listener);
  }

  subscribeToErrors(_listener: (failure: RoomDispatchFailure) => void): Unsubscribe {
    return () => undefined;
  }
}

function projection(roomRevision: number): ViewerProjection<EatTheReichView> {
  return {
    platformVersion: "test",
    templateId: asTemplateId("eat-the-reich"),
    templateVersion: "test",
    schemaVersion: 1,
    viewerId: asMemberId("member-1"),
    roomRevision,
    view: {} as unknown as EatTheReichView,
  };
}

function tailEvent(
  eventId: string,
  sequence: number,
  roomRevision: number,
  payload: EatTheReichEvent,
  partition: EventTailPartition = "shared",
): TailEvent {
  return { eventId, sequence, roomRevision, payload, partition };
}

const rolled = (rollId: string, attackSuccessesRolled: number): ActionRolled => ({
  type: "ActionRolled",
  rollId,
  characterId: "rook",
  approvedBonusClaims: [],
  engagedThreatIds: [],
  primaryEngagedThreatId: null,
  playerFaces: [],
  keptDice: [],
  attackDiceRolled: 0,
  attackFaces: [],
  attackSuccessesRolled,
  itemIdsCharged: [],
  bloodSpent: 0,
  passiveBloodGained: 0,
});

const resolved = (rollId: string): ActionResolved => ({
  type: "ActionResolved",
  rollId,
  characterId: "rook",
  allocations: [],
  objectiveDeltas: [],
  threatDeltas: [],
  bloodDelta: 0,
  itemRestoreDeltas: [],
  injuryClearedCount: 0,
  remainingAttackSuccessesAfterAllocation: 0,
  attackBumpThreatId: null,
  injuryMark: null,
  injuryChoicePendingMode: null,
});

const ROOM = "room-1";
const MEMBER = "member-1";

const renderProjection = (storage?: Storage): RenderHookResult<RoomProjectionState, unknown> =>
  renderHook(() =>
    useRoomProjection(ROOM, MEMBER, "player", {
      presentEvents: true,
      ...(storage ? { storage } : {}),
    }),
  );

describe("useRoomProjection presentation", () => {
  let repository: FakeRepository;

  beforeEach(() => {
    repository = new FakeRepository(projection(1));
    mocks.repository = repository;
  });

  it("never exposes an item before the projection has caught up (a)", async () => {
    const storage = new MemoryStorage();
    repository.projection = projection(4);
    repository.tail = [tailEvent("resolved-1", 5, 5, resolved("roll-1"))];
    const renders: { readonly presentation: readonly number[]; readonly projection: number }[] = [];
    const { result } = renderHook(() => {
      const state = useRoomProjection(ROOM, MEMBER, "player", { presentEvents: true, storage });
      renders.push({
        presentation: state.presentation.map((item) => item.roomRevision),
        projection: state.projection?.roomRevision ?? -1,
      });
      return state;
    });

    await waitFor(() => expect(repository.readEventTailCalls.length).toBeGreaterThan(0));
    // Let the publish that follows the tail read flush before asserting the gate holds.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(result.current.projection?.roomRevision).toBe(4);
    expect(result.current.presentation).toEqual([]);

    act(() => {
      repository.pushProjection(projection(5));
    });
    await waitFor(() => expect(result.current.presentation).toHaveLength(1));
    expect(result.current.presentation[0]?.eventId).toBe("resolved-1");

    for (const render of renders) {
      for (const revision of render.presentation) {
        expect(revision).toBeLessThanOrEqual(render.projection);
      }
    }
  });

  it("keeps an ordered queue that a later item never overwrites (b)", async () => {
    const storage = new MemoryStorage();
    repository.projection = projection(10);
    repository.tail = [
      tailEvent("resolved-1", 3, 3, resolved("roll-1")),
      tailEvent("paused-1", 4, 4, { type: "Paused" }),
    ];
    const { result } = renderProjection(storage);

    await waitFor(() => expect(result.current.presentation).toHaveLength(2));
    expect(result.current.presentation.map((item) => item.eventId)).toEqual([
      "resolved-1",
      "paused-1",
    ]);

    repository.tail.push(tailEvent("paused-2", 5, 5, { type: "Paused" }));
    act(() => {
      window.dispatchEvent(new Event("online"));
    });
    await waitFor(() => expect(result.current.presentation).toHaveLength(3));
    expect(result.current.presentation.map((item) => item.eventId)).toEqual([
      "resolved-1",
      "paused-1",
      "paused-2",
    ]);
  });

  it("does not re-present an acknowledged event after a remount (c)", async () => {
    const storage = new MemoryStorage();
    repository.projection = projection(10);
    repository.tail = [
      tailEvent("resolved-1", 1, 1, resolved("roll-1")),
      tailEvent("paused-1", 2, 2, { type: "Paused" }),
    ];
    const first = renderProjection(storage);
    await waitFor(() => expect(first.result.current.presentation).toHaveLength(2));
    act(() => {
      first.result.current.acknowledgePresentation("resolved-1");
    });
    await waitFor(() => expect(first.result.current.presentation).toHaveLength(1));
    expect(first.result.current.presentation[0]?.eventId).toBe("paused-1");
    first.unmount();

    repository.projection = projection(10);
    const second = renderProjection(storage);
    await waitFor(() => expect(second.result.current.presentation).toHaveLength(1));
    expect(second.result.current.presentation.map((item) => item.eventId)).toEqual(["paused-1"]);
  });

  it("baselines to the head so history is never replayed (d)", async () => {
    const storage = new MemoryStorage();
    repository.projection = projection(10);
    repository.head = { shared: 10, gm: 0, member: 0 };
    repository.tail = Array.from({ length: 10 }, (_, index) =>
      tailEvent(`event-${index + 1}`, index + 1, index + 1, { type: "Paused" }),
    );
    const { result } = renderProjection(storage);

    await waitFor(() => expect(repository.readEventTailCalls.length).toBeGreaterThan(0));
    expect(repository.readEventTailCalls[0]).toEqual({ shared: 10, gm: 0, member: 0 });
    await waitFor(() => expect(result.current.status).toBe("live"));
    expect(result.current.presentation).toEqual([]);
  });

  it("does not baseline away a recovered command's own events (d2)", async () => {
    const storage = new MemoryStorage();
    repository.projection = projection(10);
    repository.head = { shared: 10, gm: 0, member: 0 };
    repository.tail = [tailEvent("recovered-8", 8, 8, resolved("roll-recovered"))];
    repository.reconcileResults = [
      {
        status: "accepted",
        commandId: asCommandId("11111111-1111-4111-8111-111111111111"),
        roomRevision: 8,
        sharedEvents: [],
        acceptedSequence: 8,
      },
    ];
    const { result } = renderProjection(storage);

    await waitFor(() => expect(repository.readEventTailCalls.length).toBeGreaterThan(0));
    expect(repository.readEventTailCalls[0]).toEqual({ shared: 7, gm: 0, member: 0 });
    await waitFor(() => expect(result.current.presentation).toHaveLength(1));
    expect(result.current.presentation[0]?.eventId).toBe("recovered-8");
  });

  it("keeps a recovered command's baseline across a failed head read (d3)", async () => {
    const storage = new MemoryStorage();
    repository.projection = projection(10);
    repository.head = { shared: 10, gm: 0, member: 0 };
    repository.tail = [tailEvent("recovered-8", 8, 8, resolved("roll-recovered"))];
    repository.reconcileOnce = true;
    repository.headFailures = 1;
    repository.reconcileResults = [
      {
        status: "accepted",
        commandId: asCommandId("11111111-1111-4111-8111-111111111111"),
        roomRevision: 8,
        sharedEvents: [],
        acceptedSequence: 8,
      },
    ];
    const { result } = renderProjection(storage);

    await waitFor(() => expect(repository.readEventTailHeadCalls).toHaveLength(1));
    expect(result.current.presentation).toEqual([]);

    // The outbox is already drained; the retry must still not baseline past sequence 8.
    act(() => {
      window.dispatchEvent(new Event("online"));
    });
    await waitFor(() => expect(result.current.presentation).toHaveLength(1));
    expect(repository.readEventTailHeadCalls).toHaveLength(2);
    expect(repository.readEventTailCalls[0]).toEqual({ shared: 7, gm: 0, member: 0 });
    expect(result.current.presentation[0]?.eventId).toBe("recovered-8");
  });

  it("keeps a recovered sequence when the post-reconcile refresh fails (d4)", async () => {
    const storage = new MemoryStorage();
    repository.projection = projection(10);
    repository.head = { shared: 10, gm: 0, member: 0 };
    repository.tail = [tailEvent("recovered-8", 8, 8, resolved("roll-recovered"))];
    repository.reconcileOnce = true;
    // Call 1 is the initial refresh; call 2 is the refresh after a non-empty reconcile.
    repository.failProjectionOnCall = 2;
    repository.reconcileResults = [
      {
        status: "accepted",
        commandId: asCommandId("11111111-1111-4111-8111-111111111111"),
        roomRevision: 8,
        sharedEvents: [],
        acceptedSequence: 8,
      },
    ];
    const { result } = renderProjection(storage);

    await waitFor(() => expect(repository.projectionCalls).toBeGreaterThanOrEqual(2));
    await waitFor(() => expect(result.current.status).toBe("reconnecting"));
    expect(repository.readEventTailHeadCalls).toEqual([]);

    act(() => {
      window.dispatchEvent(new Event("online"));
    });
    await waitFor(() => expect(result.current.presentation).toHaveLength(1));
    expect(repository.readEventTailCalls[0]).toEqual({ shared: 7, gm: 0, member: 0 });
    expect(result.current.presentation[0]?.eventId).toBe("recovered-8");
  });

  it("re-syncs promptly when a sync is requested during one in flight (h)", async () => {
    const storage = new MemoryStorage();
    repository.projection = projection(10);
    const release = repository.holdNextProjection();
    const { result } = renderProjection(storage);

    // The first sync is now parked inside getProjection.
    await waitFor(() => expect(repository.projectionCalls).toBe(1));
    await act(async () => {
      await result.current.dispatch(asCommandId("22222222-2222-4222-8222-222222222222"), {
        type: "Pause",
      });
    });
    expect(repository.readEventTailCalls).toEqual([]);

    // The dropped request must run right after the in-flight pass, not a full
    // 30 s backoff later (waitFor's default timeout is 1 s).
    release();
    await waitFor(() => expect(repository.readEventTailCalls.length).toBeGreaterThanOrEqual(2));
  });

  it("restores the attack-success explanation for a recovered resolution (e)", async () => {
    const storage = new MemoryStorage();
    repository.projection = projection(1);
    repository.tail = [tailEvent("rolled-1", 1, 1, rolled("roll-1", 3))];
    const first = renderProjection(storage);
    await waitFor(() => expect(first.result.current.presentation).toHaveLength(1));
    act(() => {
      first.result.current.acknowledgePresentation("rolled-1");
    });
    await waitFor(() => expect(first.result.current.presentation).toHaveLength(0));
    first.unmount();

    repository.projection = projection(2);
    repository.tail = [tailEvent("resolved-1", 2, 2, resolved("roll-1"))];
    const second = renderProjection(storage);
    await waitFor(() => expect(second.result.current.presentation).toHaveLength(1));
    expect(second.result.current.presentation[0]?.attackSuccessesRolled).toBe(3);
  });

  it("isolates a tail failure from game state (f)", async () => {
    const storage = new MemoryStorage();
    repository.projection = projection(1);
    repository.tailError = new Error("tail unavailable");
    const { result } = renderProjection(storage);

    await waitFor(() => expect(repository.readEventTailCalls.length).toBeGreaterThan(0));
    expect(result.current.status).toBe("live");
    expect(result.current.projection?.roomRevision).toBe(1);
    expect(result.current.lastError).toBeNull();
    expect(result.current.presentation).toEqual([]);

    // The failure is transient: the next sync reads the tail and presents it.
    repository.tailError = null;
    repository.tail = [tailEvent("paused-1", 1, 1, { type: "Paused" })];
    act(() => {
      window.dispatchEvent(new Event("online"));
    });
    await waitFor(() => expect(result.current.presentation).toHaveLength(1));
    expect(result.current.presentation[0]?.eventId).toBe("paused-1");
  });

  it("reads no tail at all when presentEvents is false (g)", async () => {
    repository.projection = projection(3);
    repository.head = { shared: 3, gm: 0, member: 0 };
    repository.tail = [tailEvent("paused-1", 4, 4, { type: "Paused" })];
    const { result } = renderHook(() => useRoomProjection(ROOM, MEMBER, "player"));

    await waitFor(() => expect(result.current.status).toBe("live"));
    expect(result.current.projection?.roomRevision).toBe(3);
    expect(result.current.presentation).toEqual([]);
    expect(repository.readEventTailCalls).toEqual([]);
    expect(repository.readEventTailHeadCalls).toEqual([]);
    expect(repository.presentationScopeCalls).toEqual([]);
  });
});
