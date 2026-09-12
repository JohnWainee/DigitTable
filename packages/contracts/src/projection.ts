import type { ViewerId } from "./ids.js";
import { jsonByteSize, PROJECTION_CEILING_BYTES } from "./size.js";
import type { VersionedTemplateRecord } from "./versions.js";

/**
 * One complete, atomic projection document per viewer (a member, `gm`, or
 * `table`). This replaces split shared/private listeners: shared content is
 * an input to the projection, not a separately observed document, which is
 * what avoids cross-document revision tearing (docs/ARCHITECTURE.md section
 * 8, N3). `view` must contain everything that viewer is authorized to see
 * and nothing else.
 */
export interface ViewerProjection<TView> extends VersionedTemplateRecord {
  readonly viewerId: ViewerId;
  readonly roomRevision: number;
  readonly view: TView;
}

export interface ProjectionBudgetCheck {
  readonly bytes: number;
  readonly withinCeiling: boolean;
}

export function checkProjectionBudget<TView>(
  projection: ViewerProjection<TView>,
): ProjectionBudgetCheck {
  const bytes = jsonByteSize(projection);
  return {
    bytes,
    withinCeiling: bytes <= PROJECTION_CEILING_BYTES,
  };
}
