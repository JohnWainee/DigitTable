import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { CharacterFullSheet } from "@digitable/template-eat-the-reich";
import { CorrectionDialog } from "../../src/gm2/CorrectionDialog.js";

const character = {
  name: "Test Rook",
  blood: 5,
  downed: false,
  retired: false,
  injuries: [],
  items: [{ id: "smokes", name: "Smokes", usesRemaining: 1, maxUses: 2 }],
} as unknown as CharacterFullSheet;

function open(): void {
  render(<CorrectionDialog character={character} onApply={vi.fn()} onClose={vi.fn()} />);
}

describe("CorrectionDialog item-uses stepper focus", () => {
  it("keeps focus on an enabled control when a tap reaches the upper bound", async () => {
    const user = userEvent.setup();
    open();
    await user.click(screen.getByRole("button", { name: "Increase Smokes uses" }));
    expect(screen.getByRole("button", { name: "Increase Smokes uses" })).toBeDisabled();
    // Not the disabled button, not <body>: the opposite button, so the next tap/keypress works.
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Decrease Smokes uses" }),
    );
  });

  it("keeps focus on an enabled control when a tap reaches zero", async () => {
    const user = userEvent.setup();
    open();
    await user.click(screen.getByRole("button", { name: "Decrease Smokes uses" }));
    expect(screen.getByRole("button", { name: "Decrease Smokes uses" })).toBeDisabled();
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Increase Smokes uses" }),
    );
  });

  it.each([
    ["upper bound", 0, "Increase", "Decrease"],
    ["zero", 1, "Decrease", "Increase"],
  ])(
    "hands focus over on a one-use item whose opposite button is still disabled at the tap (%s)",
    async (_label, usesRemaining, tapped, other) => {
      const user = userEvent.setup();
      render(
        <CorrectionDialog
          character={
            {
              ...character,
              items: [{ id: "one", name: "Flask", usesRemaining, maxUses: 1 }],
            } as unknown as CharacterFullSheet
          }
          onApply={vi.fn()}
          onClose={vi.fn()}
        />,
      );
      await user.click(screen.getByRole("button", { name: `${tapped} Flask uses` }));
      expect(screen.getByRole("button", { name: `${tapped} Flask uses` })).toBeDisabled();
      expect(document.activeElement).toBe(
        screen.getByRole("button", { name: `${other} Flask uses` }),
      );
    },
  );

  it("does not move focus on a step that stays inside the bounds", async () => {
    const user = userEvent.setup();
    render(
      <CorrectionDialog
        character={
          {
            ...character,
            items: [{ id: "s", name: "Smokes", usesRemaining: 1, maxUses: 3 }],
          } as unknown as CharacterFullSheet
        }
        onApply={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    const increase = screen.getByRole("button", { name: "Increase Smokes uses" });
    await user.click(increase);
    expect(document.activeElement).toBe(increase);
  });
});
