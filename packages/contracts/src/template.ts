import type { StableError } from "./errors.js";
import type { EventDestination } from "./event.js";
import type { MemberId, RoomId, ViewerId } from "./ids.js";
import type { RandomSource } from "./random.js";
import type { TemplateManifest, VersionedTemplateRecord, MigrationResult } from "./versions.js";
import type { ViewerProjection } from "./projection.js";

/** A member's platform-granted capability, independent of URL/route intent. */
export type Capability = "player" | "gm" | "table";

/**
 * Context the platform hands a template for `authorizeGameAction`. Built
 * from trusted server-side membership data, never from client-asserted
 * fields.
 */
export interface AuthorizedMemberContext {
  readonly roomId: RoomId;
  readonly memberId: MemberId;
  readonly capability: Capability;
}

export type AuthorizationResult =
  { readonly allowed: true } | ({ readonly allowed: false } & StableError);

export function allow(): AuthorizationResult {
  return { allowed: true };
}

export function deny(error: StableError): AuthorizationResult {
  return { allowed: false, ...error };
}

/**
 * Context a template's `decide` runs against. `state` is the live
 * authority state; `actor` is the same trusted, server-verified membership
 * context passed to `authorizeGameAction` (`authorizeGameAction` cannot see
 * `state`, so entity-scoped ownership checks such as "this roll belongs to
 * this actor" or "roll remains unresolved" belong in `decide`, using
 * `actor` together with `state`). `random` is a deterministic generator
 * constructed from one seed generated per invocation, injected by the
 * trusted handler before the transaction begins (docs/ARCHITECTURE.md,
 * ADR-002). `decide` must draw from `random` in a fixed order relative to
 * its inputs so that retries of the same seed reproduce the same faces.
 */
export interface DecisionContext<TState> {
  readonly state: TState;
  readonly actor: AuthorizedMemberContext;
  readonly random: RandomSource;
}

/**
 * One logical event emitted by `decide`, with a canonical full payload used
 * by `reduce`, and zero or more destination-partitioned (possibly redacted)
 * copies used for storage/timeline delivery. Multiple `effects` entries may
 * share `eventId` because visibility partitioning, not `eventId` uniqueness,
 * is what makes each stored document unique.
 */
export interface DecidedEvent<TEvent> {
  readonly eventId: string;
  /** Full-fidelity payload. Only ever consumed by `reduce`; never sent to a client. */
  readonly event: TEvent;
  /** Destination-partitioned, possibly-redacted copies delivered to clients. */
  readonly effects: readonly EventEffect<TEvent>[];
}

export interface EventEffect<TEvent> {
  readonly destination: EventDestination;
  readonly payload: TEvent;
}

export type Decision<TEvent> =
  | { readonly ok: true; readonly events: readonly DecidedEvent<TEvent>[] }
  | ({ readonly ok: false } & StableError);

export function decided<TEvent>(events: readonly DecidedEvent<TEvent>[]): Decision<TEvent> {
  return { ok: true, events };
}

export function rejected<TEvent>(error: StableError): Decision<TEvent> {
  return { ok: false, code: error.code, message: error.message };
}

/** One event copy visible to every destination (no redaction needed). */
export function broadcastEvent<TEvent>(
  eventId: string,
  event: TEvent,
  destinations: readonly EventDestination[],
): DecidedEvent<TEvent> {
  return {
    eventId,
    event,
    effects: destinations.map((destination) => ({ destination, payload: event })),
  };
}

/** Context passed to `project` identifying which viewer the projection is for. */
export interface ViewerContext {
  readonly roomId: RoomId;
  readonly viewerId: ViewerId;
  readonly capability: Capability;
}

export interface InitialCampaignInput {
  readonly roomId: RoomId;
  readonly gmMemberId: MemberId;
  readonly memberIds: readonly MemberId[];
}

/** Input a viewer supplies when previewing a pool before committing an action. */
export interface PoolInput {
  readonly actionId: string;
  readonly gearIds: readonly string[];
}

export interface PoolComponent {
  readonly label: string;
  readonly value: number;
}

/**
 * A dice-pool breakdown. Built from a viewer's own projection, so it can
 * never include a hidden GM-only modifier the viewer's projection does not
 * carry (docs/ARCHITECTURE.md, N12). `total` is the sum of `components`.
 */
export interface PoolExplanation {
  readonly components: readonly PoolComponent[];
  readonly total: number;
  readonly diceSides: number;
  readonly successThreshold: number;
}

/** A roll as it appears inside a viewer's own projection: only what that viewer may see. */
export interface VisibleRoll {
  readonly rollId: string;
  readonly status: "awaiting_opposition" | "awaiting_allocation" | "resolved";
  readonly netSuccesses: number | null;
}

export interface AllocationOption {
  readonly id: string;
  readonly label: string;
  readonly costPerUse: number;
  readonly maxUses: number;
}

export interface PresentationPreferences {
  readonly reducedMotion: boolean;
}

export interface TheatreCue {
  readonly kind: string;
  readonly atMs: number;
}

export interface AccessibleScene {
  readonly announcement: string;
}

export interface TheatreScene {
  readonly id: string;
  readonly semanticLabel: string;
  readonly priority: "ambient" | "result" | "interrupt";
  readonly durationHintMs: number;
  readonly cues: readonly TheatreCue[];
  readonly fallback: AccessibleScene;
}

export interface TemplateSchemas<TState, TCommand, TEvent, TView> {
  readonly parseState: (value: unknown) => TState;
  readonly parseCommand: (value: unknown) => TCommand;
  readonly parseEvent: (value: unknown) => TEvent;
  readonly parseView: (value: unknown) => TView;
}

/**
 * Matches docs/ARCHITECTURE.md section 7. `authorizeGameAction`, `decide`,
 * `reduce`, `project`, `explainPool`, and `validAllocations` are pure: no
 * I/O, no ambient clock/randomness, no mutation of their inputs.
 */
export interface GameTemplate<TState, TCommand, TEvent, TView> {
  readonly manifest: TemplateManifest;
  readonly schemas: TemplateSchemas<TState, TCommand, TEvent, TView>;

  initialState(input: InitialCampaignInput): TState;

  authorizeGameAction(ctx: AuthorizedMemberContext, command: TCommand): AuthorizationResult;

  decide(ctx: DecisionContext<TState>, command: TCommand): Decision<TEvent>;

  reduce(state: TState, event: TEvent): TState;

  /**
   * Returns the raw, viewer-scoped view — not the wire envelope. `TState`
   * alone carries no room revision or version metadata (those live on
   * `AuthorityRecord`, one level up), so wrapping into a full
   * `ViewerProjection<TView>` is the engine's job (see
   * `@digitable/engine`'s `projectViewer`), the same way `decide` returns
   * raw `TEvent`s that the engine wraps into `EventEnvelope`s.
   */
  project(state: TState, viewer: ViewerContext): TView;

  explainPool(projection: ViewerProjection<TView>, input: PoolInput): PoolExplanation;

  validAllocations(
    projection: ViewerProjection<TView>,
    roll: VisibleRoll,
  ): readonly AllocationOption[];

  theatre(event: TEvent, prefs: PresentationPreferences): TheatreScene | null;

  migrate(record: VersionedTemplateRecord & { readonly state: unknown }): MigrationResult<TState>;
}
