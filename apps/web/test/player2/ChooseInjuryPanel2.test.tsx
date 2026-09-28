import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { CharacterFullSheet } from "@digitable/template-eat-the-reich";
import { ChooseInjuryPanel2 } from "../../src/player2/ChooseInjuryPanel2.js";

/**
 * Regression coverage for the class-less "Destroy Cowboy hat" utility-item
 * button (see ComposeStep2.test.tsx's doc comment for the full history: a
 * bare `<button>` shipped in `5e8907b` with no `className`, so it got none
 * of the reskin's tap-target sizing or theming; `reskinContract.test.ts`'s
 * static contract now pins the class itself, this file proves the rendered
 * control from a real component render).
 *
 * Only `injuries` and `items` are read by `ChooseInjuryPanel2`, so a minimal
 * fixture is enough — no full room/session harness needed.
 */
function characterWithHat(usesRemaining: number): CharacterFullSheet {
  return {
    injuries: [
      {
        id: "cat-a",
        label: "Suit Torn / Abdominal Puncture",
        boxes: [{ marked: false }, { marked: false }],
      },
    ],
    items: [
      {
        id: "hat-1",
        name: "Cowboy hat",
        bonusRequirement: "",
        bonusPlus: 0,
        maxUses: 1,
        usesRemaining,
        useEffect: { kind: "ignoreInjuryOrDownedAndDestroy" },
      },
    ],
  } as unknown as CharacterFullSheet;
}

describe("ChooseInjuryPanel2 utility-item control (Cowboy hat / Destroy to ignore)", () => {
  it("styles the button as a link-button (48px tap target, themed) instead of an unstyled bare <button>", () => {
    render(
      <ChooseInjuryPanel2
        character={characterWithHat(1)}
        mode="single"
        preferredCategoryId="cat-a"
        onChoose={() => undefined}
        onUseHat={() => undefined}
      />,
    );
    const button = screen.getByRole("button", { name: /destroy cowboy hat/i });
    expect(button).toHaveClass("link-button");
  });

  it("calls onUseHat with the hat's item id when clicked", async () => {
    const user = userEvent.setup();
    const onUseHat = vi.fn();
    render(
      <ChooseInjuryPanel2
        character={characterWithHat(1)}
        mode="single"
        preferredCategoryId="cat-a"
        onChoose={() => undefined}
        onUseHat={onUseHat}
      />,
    );
    await user.click(screen.getByRole("button", { name: /destroy cowboy hat/i }));
    expect(onUseHat).toHaveBeenCalledWith("hat-1");
  });

  it("does not render the hat-destroy control once the hat has no uses left", () => {
    render(
      <ChooseInjuryPanel2
        character={characterWithHat(0)}
        mode="single"
        preferredCategoryId="cat-a"
        onChoose={() => undefined}
        onUseHat={() => undefined}
      />,
    );
    expect(screen.queryByRole("button", { name: /destroy cowboy hat/i })).toBeNull();
  });

  it("does not render the hat-destroy control when the caller passes no onUseHat handler", () => {
    render(
      <ChooseInjuryPanel2
        character={characterWithHat(1)}
        mode="downed"
        onChoose={() => undefined}
        onUseHat={null}
      />,
    );
    expect(screen.queryByRole("button", { name: /destroy cowboy hat/i })).toBeNull();
  });
});
