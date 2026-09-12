import type { AuthorityRecord, ViewerContext, ViewerProjection } from "@digitable/contracts";

/** The subset of GameTemplate needed to build one viewer's projection. */
export interface ProjectingTemplate<TState, TView> {
  project(state: TState, viewer: ViewerContext): TView;
}

/**
 * Wraps a template's raw `project` output into the full wire envelope,
 * pulling `roomRevision` and version metadata from the live
 * `AuthorityRecord` (docs/ARCHITECTURE.md section 8: one complete
 * projection document per viewer).
 */
export function projectViewer<TState, TView>(
  template: ProjectingTemplate<TState, TView>,
  authority: AuthorityRecord<TState>,
  viewer: ViewerContext,
): ViewerProjection<TView> {
  return {
    platformVersion: authority.platformVersion,
    templateId: authority.templateId,
    templateVersion: authority.templateVersion,
    schemaVersion: authority.schemaVersion,
    viewerId: viewer.viewerId,
    roomRevision: authority.roomRevision,
    view: template.project(authority.state, viewer),
  };
}
