import { render, screen } from "@testing-library/react";
import { axe } from "jest-axe";
import { describe, expect, it } from "vitest";
import { InvitePanel } from "../../src/gm2/InvitePanel.js";

/**
 * Review F5: the Invite card said "Neither is shown again after creation"
 * while displaying the room code right beside it. Only the passphrase is
 * never shown again; the room code stays on the console.
 */
describe("InvitePanel copy (F5)", () => {
  it("does not claim the room code is hidden while showing it", () => {
    const { container } = render(<InvitePanel roomCode="ABC234" />);
    expect(screen.getByText("ABC234")).toBeInTheDocument();
    expect(container).not.toHaveTextContent(/neither is shown/i);
    expect(container).not.toHaveTextContent(/room code[^.]*not shown again/i);
  });

  it("says the room code stays here and only the passphrase is not shown again", async () => {
    const { container } = render(<InvitePanel roomCode="ABC234" claimedCount={1} rosterSize={6} />);
    const hint = container.querySelector(".form-hint")!;
    expect(hint).toHaveTextContent(/share the room code and your passphrase with your players/i);
    expect(hint).toHaveTextContent(/the room code stays on this screen/i);
    expect(hint).toHaveTextContent(/the passphrase is shown only when you create the session/i);
    expect(screen.getByText(/characters claimed: 1\/6/i)).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });
});
