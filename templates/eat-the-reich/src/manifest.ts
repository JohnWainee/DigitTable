import { asTemplateId, type TemplateManifest } from "@digitable/contracts";

/**
 * `templateVersion`/`currentSchemaVersion` bumped for B02's structural
 * rewrite (docs/ETR_RULES_IMPLEMENTATION_PLAN.md §1): no live room has ever
 * existed under schemaVersion 1's shape, so this is a fresh start, not a
 * migration. `migrate()` in `engine.ts` fails closed on anything else.
 */
export const EAT_THE_REICH_MANIFEST: TemplateManifest = {
  templateId: asTemplateId("eat-the-reich"),
  templateVersion: "0.2.0",
  displayName: "Eat the Reich",
  currentSchemaVersion: 2,
};
