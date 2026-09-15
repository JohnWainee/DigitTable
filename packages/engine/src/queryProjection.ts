import type {
  AllocationOption,
  PoolExplanation,
  PoolInput,
  ViewerProjection,
  VisibleRoll,
} from "@digitable/contracts";

/** The subset of GameTemplate needed to answer read-only UI queries. */
export interface QueryingTemplate<TView> {
  explainPool(projection: ViewerProjection<TView>, input: PoolInput): PoolExplanation;
  validAllocations(
    projection: ViewerProjection<TView>,
    roll: VisibleRoll,
  ): readonly AllocationOption[];
}

/**
 * A02 (board task A02, "game projection selectors"): binds a template's
 * read-only query methods to one already-fetched projection, so UI code
 * (Sonnet C) calls `query.explainPool(input)` / `query.validAllocations(roll)`
 * without re-threading the template and projection through every call site,
 * and without importing `@digitable/engine`'s command-dispatch surface just
 * to ask a question. Every value returned is derived only from `projection`
 * (a viewer's own authorized view), so it can never surface hidden GM-only
 * state (docs/ARCHITECTURE.md, N12) — the same guarantee `explainPool` and
 * `validAllocations` already carry on `GameTemplate`, just given a stable,
 * template-agnostic call shape for the platform layer.
 */
export interface ProjectionQuery<TView> {
  readonly projection: ViewerProjection<TView>;
  explainPool(input: PoolInput): PoolExplanation;
  validAllocations(roll: VisibleRoll): readonly AllocationOption[];
}

export function queryProjection<TView>(
  template: QueryingTemplate<TView>,
  projection: ViewerProjection<TView>,
): ProjectionQuery<TView> {
  return {
    projection,
    explainPool: (input) => template.explainPool(projection, input),
    validAllocations: (roll) => template.validAllocations(projection, roll),
  };
}
