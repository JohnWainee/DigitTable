import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "jest-axe";
import { beforeEach, describe, expect, it } from "vitest";
import { asMemberId } from "@digitable/contracts";
import {
  claimRook,
  createSessionAsGm,
  joinAsPlayer,
  loadOpeningSceneAsGm,
  setViewport,
} from "../support/flows.js";

/**
 * Option rows on the compose step: a utility item's action ("Mark and regain Blood") must be its
 * own control beside the option row, never nested inside the checkbox's <label> (interactive content
 * in a label corrupts the checkbox's accessible name and puts a second tap target inside the row
 * that toggles the first), and it must carry the reskin's button class so the 48px tap rule and the
 * 16px type apply (a bare <button> got the browser's ~21px default).
 */
describe("Compose step option rows", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    setViewport(375, 812);
    window.location.hash = "";
  });

  it("renders the utility-item action beside, not inside, the item's label, with the button class", async () => {
    const user = userEvent.setup();
    const session = await createSessionAsGm(user);
    await loadOpeningSceneAsGm(session.roomId, asMemberId(session.gmOwnership.memberId));
    await joinAsPlayer(user, session.roomCode);
    await claimRook(user);
    await user.click(screen.getByRole("button", { name: /continue to your dashboard/i }));
    await screen.findByRole("heading", { name: /choose an action/i });

    const action = screen.getByRole("button", { name: /mark and regain blood/i });
    expect(action.closest("label")).toBeNull();
    expect(action).toHaveClass("secondary-action");

    // The row wrapper holds exactly the option label and its action.
    const row = action.closest(".gear-row");
    expect(row).not.toBeNull();
    const label = within(row as HTMLElement)
      .getByText(/cigarettes/i)
      .closest("label");
    expect(label).not.toBeNull();
    expect(label).toHaveClass("gear-option");

    // The checkbox's name is the item's own text and no longer includes the action's label.
    const checkbox = within(label as HTMLElement).getByRole("checkbox");
    expect(checkbox).toHaveAccessibleName(expect.stringMatching(/cigarettes/i));
    expect(checkbox).not.toHaveAccessibleName(expect.stringMatching(/mark and regain blood/i));

    expect(await axe(document.body)).toHaveNoViolations();
  });
});
