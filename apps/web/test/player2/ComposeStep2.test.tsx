import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { asMemberId } from "@digitable/contracts";
import {
  claimRook,
  createSessionAsGm,
  joinAsPlayer,
  loadOpeningSceneAsGm,
} from "../support/flows.js";

/**
 * Regression coverage for the class-less "Mark and regain Blood" utility-item
 * button (CLAUDE_HANDOFF.md: two `<button>`s shipped in `5e8907b` with no
 * `className` at all, so they got none of the reskin's tap-target sizing,
 * touch-action, or ink-black styling — `apps/web/test/styles/
 * reskinContract.test.ts`'s static contract now pins the class itself; this
 * file proves the control is reachable, styled, and functionally correct
 * from a real render, not just a source-text match).
 *
 * Iryna ("rook") carries Cigarettes (`rook-pocket-mirror`, a `gainBlood`
 * utility item, `poolEligible: false`) with 3 starting uses, so the button
 * renders on the compose step with no extra setup beyond claiming her.
 */
async function reachComposeStepAsRook(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  const { roomId, roomCode, gmOwnership } = await createSessionAsGm(user);
  await loadOpeningSceneAsGm(roomId, asMemberId(gmOwnership.memberId));
  await joinAsPlayer(user, roomCode);
  await claimRook(user);
  await user.click(screen.getByRole("button", { name: /continue to your dashboard/i }));
  await screen.findByRole("heading", { name: /choose an action/i });
}

describe("ComposeStep2 utility-item control (Cigarettes / Mark and regain Blood)", () => {
  it("styles the button as a link-button (48px tap target, themed) instead of an unstyled bare <button>", async () => {
    const user = userEvent.setup();
    await reachComposeStepAsRook(user);

    const button = screen.getByRole("button", { name: /mark and regain blood/i });
    expect(button).toHaveClass("link-button");
  });

  it("marking a use decrements the item's remaining uses without checking its pool-selection box", async () => {
    const user = userEvent.setup();
    await reachComposeStepAsRook(user);

    const checkbox = screen.getByRole("checkbox", { name: /cigarettes/i });
    expect(checkbox).not.toBeChecked();
    expect(screen.getByText(/cigarettes.*\(3\/3 uses\)/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /mark and regain blood/i }));

    expect(await screen.findByText(/cigarettes.*\(2\/3 uses\)/i)).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: /cigarettes/i })).not.toBeChecked();
  });
});
