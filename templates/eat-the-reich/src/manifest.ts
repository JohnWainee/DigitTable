import { asTemplateId, type TemplateManifest } from "@digitable/contracts";

/**
 * `templateVersion`/`currentSchemaVersion` bumped again for B04's addition
 * of the Scene wrapper, rounds, and Pause (docs/ETR_RULES_IMPLEMENTATION_PLAN.md
 * §1's fresh-start rationale still applies: no live room has ever existed
 * under any prior shape). `migrate()` in `engine.ts` fails closed on
 * anything but the current `schemaVersion`.
 */
export const EAT_THE_REICH_MANIFEST: TemplateManifest = {
  templateId: asTemplateId("eat-the-reich"),
  templateVersion: "0.4.0",
  displayName: "Eat the Reich",
  currentSchemaVersion: 4,
};
