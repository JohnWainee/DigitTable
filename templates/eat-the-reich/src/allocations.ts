export const DAMAGE_THREAT_OPTION_ID = "damage-threat";
export const ADVANCE_OBJECTIVE_OPTION_ID = "advance-objective";

export interface AllocationOptionDef {
  readonly id: string;
  readonly label: string;
  readonly costPerUse: number;
  readonly maxUses: number;
}

/**
 * The allocation catalog for the one implemented opposed action, derived
 * only from publicly visible fields (`resolveRemaining`, `advancesRemaining`)
 * so it produces the same result whether called from `decide` (with the
 * full trusted threat/objective state) or from `validAllocations` (with a
 * viewer's projected, possibly-redacted view of the same fields).
 */
export function allocationOptionsFor(
  threat: { readonly resolveRemaining: number },
  objective: { readonly advancesRemaining: number },
  netSuccesses: number,
): readonly AllocationOptionDef[] {
  if (netSuccesses <= 0) {
    return [];
  }
  const options: AllocationOptionDef[] = [
    {
      id: DAMAGE_THREAT_OPTION_ID,
      label: "Wound the Enforcer",
      costPerUse: 1,
      maxUses: Math.min(netSuccesses, threat.resolveRemaining),
    },
    {
      id: ADVANCE_OBJECTIVE_OPTION_ID,
      label: "Create an opening toward the objective",
      costPerUse: 1,
      maxUses: Math.min(netSuccesses, objective.advancesRemaining),
    },
  ];
  return options.filter((option) => option.maxUses > 0);
}
