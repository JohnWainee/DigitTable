import type { TemplateId } from "./ids.js";

/** Identity/version metadata a template publishes about itself. */
export interface TemplateManifest {
  readonly templateId: TemplateId;
  readonly templateVersion: string;
  readonly displayName: string;
  /** Highest schemaVersion this build of the template knows how to read. */
  readonly currentSchemaVersion: number;
}

/**
 * Version stamp persisted with every campaign so incompatible loads can be
 * refused with a recoverable export path instead of silently misread
 * (docs/TEMPLATE_ARCHITECTURE.md, "Versioning").
 */
export interface VersionedTemplateRecord {
  readonly platformVersion: string;
  readonly templateId: TemplateId;
  readonly templateVersion: string;
  readonly schemaVersion: number;
}

export type MigrationResult<TState> =
  | { readonly ok: true; readonly state: TState; readonly schemaVersion: number }
  | { readonly ok: false; readonly reason: string };
