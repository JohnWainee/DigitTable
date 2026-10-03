import { render, screen } from "@testing-library/react";
import { axe } from "jest-axe";
import { describe, expect, it, vi } from "vitest";
import {
  ORIGINAL_ROSTER,
  type CharacterFullSheet,
  type RollViewFull,
} from "@digitable/template-eat-the-reich";
import { PendingActionsPanel } from "../../src/gm2/PendingActionsPanel.js";

/** The GM review card's commit row: one dock per pending roll, each naming its own status line. */
function declared(rollId: string, characterId: string): RollViewFull {
  return {
    rollId,
    characterId,
    status: "declared",
    declaredStat: "none",
    declaredItemIds: [],
    declaredAbilityIds: [],
    declaredBonusClaimIds: [],
    declaredEngagedThreatIds: [],
    note: null,
  } as unknown as RollViewFull;
}

describe("PendingActionsPanel dock", () => {
  it("gives every pending card its own dock whose status describes its Roll it button", async () => {
    const [first, second] = ORIGINAL_ROSTER;
    const onReview = vi.fn();
    const { container } = render(
      <PendingActionsPanel
        pending={[declared("roll-a", first!.id), declared("roll-b", second!.id)]}
        gmSheets={ORIGINAL_ROSTER as unknown as readonly CharacterFullSheet[]}
        threats={[]}
        onReview={onReview}
      />,
    );
    const buttons = screen.getAllByRole("button", { name: /^roll it$/i });
    expect(buttons).toHaveLength(2);
    const ids = buttons.map((b) => b.getAttribute("aria-describedby"));
    expect(ids).toEqual(["pending-roll-a-dock-status", "pending-roll-b-dock-status"]);
    for (const button of buttons) {
      expect(button).toHaveAccessibleDescription(/^pool: \d+ dice?/i);
      expect(button.closest(".action-dock")).not.toBeNull();
    }
    // No duplicate ids anywhere in the panel.
    const allIds = Array.from(container.querySelectorAll("[id]")).map((el) => el.id);
    expect(new Set(allIds).size).toBe(allIds.length);
    expect(await axe(container)).toHaveNoViolations();
  });
});
