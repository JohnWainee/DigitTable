import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "jest-axe";
import { describe, expect, it, vi } from "vitest";
import type { ViewerProjection } from "@digitable/contracts";
import {
  ORIGINAL_ROSTER,
  type CharacterFullSheet,
  type EatTheReichView,
} from "@digitable/template-eat-the-reich";
import { ComposeStep2 } from "../../src/player2/ComposeStep2.js";
import { ChooseInjuryPanel2 } from "../../src/player2/ChooseInjuryPanel2.js";

/**
 * Regression for the roster commit's two class-less buttons: "Mark and regain Blood" was nested in
 * the checkbox's <label> (invalid, folded into the checkbox's accessible name, and squeezed to a
 * ~61 px sliver beside the label text at 320-375 px; 27 px tall at desktop), and "Destroy Cowboy
 * hat" had no tap-size class at all. Layout itself is measured in real Chrome (see
 * docs/evidence/reskin-mobile-oct02b); jsdom checks the structure that causes it.
 */
const withUtilityItem = ORIGINAL_ROSTER.find((c) =>
  c.items.some((i) => i.useEffect?.kind === "gainBlood"),
);
const withHat = ORIGINAL_ROSTER.find((c) =>
  c.items.some((i) => i.useEffect?.kind === "ignoreInjuryOrDownedAndDestroy"),
);

describe("utility-item controls", () => {
  it("renders the roster fixtures this test depends on", () => {
    expect(withUtilityItem).toBeDefined();
    expect(withHat).toBeDefined();
  });

  it("keeps 'Mark and regain Blood' out of the checkbox label and at tap-size class", async () => {
    const character = withUtilityItem as unknown as CharacterFullSheet;
    const onUse = vi.fn();
    const projection = {
      view: { self: character, scene: null },
    } as unknown as ViewerProjection<EatTheReichView>;
    const { container } = render(
      <ComposeStep2
        projection={projection}
        character={character}
        threats={[]}
        onDeclare={() => undefined}
        onUseUtilityItem={onUse}
      />,
    );
    const button = screen.getByRole("button", { name: "Mark and regain Blood" });
    expect(button.closest("label")).toBeNull();
    expect(button.classList.contains("secondary-action")).toBe(true);
    // No checkbox label wraps an interactive control, so none folds a button name into its own.
    for (const box of screen.getAllByRole("checkbox")) {
      expect(box.closest("label")?.querySelector("button")).toBeNull();
    }
    await userEvent.click(button);
    expect(onUse).toHaveBeenCalledTimes(1);
    expect((await axe(container)).violations).toEqual([]);
  });

  it("gives 'Destroy Cowboy hat' the shared tap-size button class", () => {
    const character = withHat as unknown as CharacterFullSheet;
    render(
      <ChooseInjuryPanel2
        character={character}
        mode="single"
        preferredCategoryId={character.injuries[0]?.id}
        onChoose={() => undefined}
        onUseHat={() => undefined}
      />,
    );
    const button = screen.getByRole("button", { name: /Destroy Cowboy hat/ });
    expect(button.classList.contains("secondary-action")).toBe(true);
  });
});
