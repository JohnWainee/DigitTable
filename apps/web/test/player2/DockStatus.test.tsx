import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import {
  ORIGINAL_ROSTER,
  type CharacterFullSheet,
  type EatTheReichView,
} from "@digitable/template-eat-the-reich";
import type { ViewerProjection } from "@digitable/contracts";
import { AllocationPanel2 } from "../../src/player2/AllocationPanel2.js";
import { ComposeStep2 } from "../../src/player2/ComposeStep2.js";

/**
 * Deterministic cover for the dock's status wording in states a random browser roll only sometimes
 * reaches: a roll that keeps no dice, and a character who cannot act. Minimal projections: both
 * panels read only `view.self`, `view.rolls`, `view.objectives`, `view.threats` and `view.scene`.
 */
const base = ORIGINAL_ROSTER[0] as unknown as CharacterFullSheet;

function projectionFor(
  character: CharacterFullSheet,
  extra: Partial<EatTheReichView> = {},
): ViewerProjection<EatTheReichView> {
  return {
    view: { self: character, rolls: [], objectives: [], threats: [], scene: null, ...extra },
  } as unknown as ViewerProjection<EatTheReichView>;
}

describe("Compose dock status when the character cannot act", () => {
  for (const [label, patch, reason] of [
    ["downed", { downed: true }, /you're down/i],
    ["retired", { retired: true }, /your story is told/i],
  ] as const) {
    it(`says why Declare is unavailable (${label})`, () => {
      const character = { ...base, ...patch } as CharacterFullSheet;
      render(
        <ComposeStep2
          projection={projectionFor(character)}
          character={character}
          threats={[]}
          onDeclare={vi.fn()}
          onUseUtilityItem={vi.fn()}
        />,
      );
      const declare = screen.getByRole("button", { name: /declare action/i });
      expect(declare).toBeDisabled();
      expect(declare).toHaveAccessibleDescription(reason);
    });
  }
});

describe("Allocation dock status", () => {
  function roll(keptDice: readonly { faceIndex: number; face: number; result: string }[]) {
    return {
      rollId: "roll-1",
      status: "awaiting_allocation",
      keptDice,
      playerFaces: keptDice.map((die) => die.face),
      attackSuccessesRolled: 0,
    } as never;
  }

  it("says there is nothing to assign when the roll kept no dice, and lets the player confirm", () => {
    const r = roll([]);
    render(
      <AllocationPanel2
        projection={projectionFor(base, { rolls: [r] })}
        roll={r}
        character={base}
        onConfirm={vi.fn()}
      />,
    );
    const confirm = screen.getByRole("button", { name: /confirm allocation/i });
    expect(confirm).toBeEnabled();
    expect(confirm).toHaveAccessibleDescription("No dice to assign.");
  });

  it("counts a single die down to 'Target chosen.'", async () => {
    const r = roll([{ faceIndex: 0, face: 5, result: "success" }]);
    render(
      <AllocationPanel2
        projection={projectionFor(base, { rolls: [r] })}
        roll={r}
        character={base}
        onConfirm={vi.fn()}
      />,
    );
    const confirm = screen.getByRole("button", { name: /confirm allocation/i });
    expect(confirm).toBeDisabled();
    expect(confirm).toHaveAccessibleDescription("1 of 1 die still needs a target.");
    await userEvent.setup().click(screen.getByRole("radio", { name: /^feed$/i }));
    expect(confirm).toBeEnabled();
    expect(confirm).toHaveAccessibleDescription("Target chosen.");
  });
});
