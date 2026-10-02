import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "jest-axe";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { asMemberId } from "@digitable/contracts";
import { ORIGINAL_ROSTER, type CharacterFullSheet } from "@digitable/template-eat-the-reich";
import { ChooseInjuryPanel2 } from "../../src/player2/ChooseInjuryPanel2.js";
import {
  claimRook,
  createSessionAsGm,
  joinAsPlayer,
  loadOpeningSceneAsGm,
  setViewport,
} from "../support/flows.js";

/**
 * A utility item's own action (Iryna's Cigarettes, Chuck's Cowboy hat) used to be a class-less
 * `<button>` nested INSIDE the item's checkbox `<label>` (and, for the hat, a class-less button).
 * That is invalid HTML (a label may not contain other interactive content), folded the button's text
 * into the checkbox's accessible name, and rendered the browser's own grey button, squeezed to a
 * narrow sliver beside the label text on a phone, while the real-browser audit's size check still
 * passed because the squeezed box was over 44px on both axes. The action now sits beside the claim
 * row as a reskinned button.
 */

async function reachCompose(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  const { roomId, roomCode, gmOwnership } = await createSessionAsGm(user);
  await loadOpeningSceneAsGm(roomId, asMemberId(gmOwnership.memberId));
  await joinAsPlayer(user, roomCode);
  await claimRook(user);
  await user.click(screen.getByRole("button", { name: /continue to your dashboard/i }));
  await screen.findByRole("heading", { name: /choose an action/i });
}

describe("utility item controls", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    setViewport(375, 812);
    window.location.hash = "";
  });

  it("renders Mark-and-regain-Blood as a styled button beside the claim row, not inside its label", async () => {
    const user = userEvent.setup();
    await reachCompose(user);

    const button = screen.getByRole("button", { name: "Mark and regain Blood" });
    expect(button.closest("label")).toBeNull();
    expect(button).toHaveClass("secondary-action");
    // Still tied to its item for assistive technology, without being part of the checkbox's name.
    expect(button).toHaveAccessibleDescription(/cigarettes/i);
    expect(screen.getByRole("checkbox", { name: /cigarettes/i })).toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: /mark and regain blood/i })).toBeNull();
    // The claim row and the action are siblings inside one item wrapper.
    const row = button.parentElement!;
    expect(row).toHaveClass("gear-item");
    expect(row.querySelector("label")).not.toBeNull();
  });

  it("has no axe violations with the utility action present", async () => {
    const user = userEvent.setup();
    await reachCompose(user);
    expect(await axe(document.body)).toHaveNoViolations();
  });

  it("still marks the item and regains Blood when the action is pressed", async () => {
    const user = userEvent.setup();
    await reachCompose(user);
    expect(
      screen.getByRole("checkbox", { name: /cigarettes.*\(3\/3 uses\)/i }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Mark and regain Blood" }));
    expect(
      await screen.findByRole("checkbox", { name: /cigarettes.*\(2\/3 uses\)/i }),
    ).toBeInTheDocument();
  });
});

describe("Cowboy hat action on the injury choice", () => {
  it("is a reskinned button with the tap-size class, not a browser-default one", () => {
    const chuck = ORIGINAL_ROSTER.find((c) =>
      c.items.some((i) => i.useEffect?.kind === "ignoreInjuryOrDownedAndDestroy"),
    ) as CharacterFullSheet | undefined;
    expect(chuck, "the roster has a Cowboy hat owner").toBeDefined();
    const onUseHat = vi.fn();
    render(
      <ChooseInjuryPanel2
        character={chuck!}
        mode="single"
        onChoose={vi.fn()}
        onUseHat={onUseHat}
      />,
    );
    const hat = screen.getByRole("button", { name: /destroy cowboy hat/i });
    expect(hat).toHaveClass("secondary-action");
    expect(hat.closest("label")).toBeNull();
  });
});
