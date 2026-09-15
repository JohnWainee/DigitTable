/**
 * B03 (docs/ETR_RULES_MATRIX.md 3.5): the five allocation families a kept
 * die may be spent on. Replaces the old two-option placeholder catalog
 * entirely (deleted in B02 along with the rest of the placeholder loop).
 */
export type AllocationTarget =
  | { readonly kind: "objective"; readonly objectiveId: string }
  | { readonly kind: "threat"; readonly threatId: string }
  | { readonly kind: "defend" }
  | { readonly kind: "feed" }
  | { readonly kind: "special"; readonly abilityId: string };

/** A stable string key for grouping/looking up a target (matrix A7's per-target Challenge grouping). */
export function allocationTargetKey(target: AllocationTarget): string {
  switch (target.kind) {
    case "objective":
      return `objective:${target.objectiveId}`;
    case "threat":
      return `threat:${target.threatId}`;
    case "defend":
      return "defend";
    case "feed":
      return "feed";
    case "special":
      return `special:${target.abilityId}`;
  }
}
