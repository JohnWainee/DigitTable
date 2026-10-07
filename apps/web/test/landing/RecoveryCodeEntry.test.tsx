import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { App } from "../../src/App.js";

/**
 * Minted recovery codes are uppercase with no whitespace and the server compares them exactly.
 * The field keeps what was typed verbatim (no autocorrect), so the submit handler must normalise
 * a lower-case or padded entry (hardware keyboard, paste) instead of rejecting a correct code.
 */
function goTo(hash: string): void {
  act(() => {
    window.location.hash = hash;
    window.dispatchEvent(new Event("hashchange"));
  });
}

describe("recovery code entry normalisation", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    window.location.hash = "";
  });

  it("redeems a lower-case, space-padded recovery code", async () => {
    const user = userEvent.setup();
    window.location.hash = "#/create";
    render(<App />);
    await user.type(screen.getByLabelText(/session name/i), "Rooftop Drop");
    await user.type(screen.getByLabelText(/^passphrase$/i), "wolfbane");
    await user.type(screen.getByLabelText(/your display name/i), "Nadia");
    await user.click(screen.getByRole("button", { name: /^create session$/i }));
    await screen.findByRole("heading", { name: /write these down/i });
    const roomCode = screen.getByText(/^room code$/i).nextElementSibling!.textContent;
    const recoveryCode = screen.getByText(/^gm recovery code$/i).nextElementSibling!.textContent;
    expect(recoveryCode).toMatch(/^[A-Z0-9]+$/);

    window.localStorage.clear();
    goTo("#/join");
    await user.click(screen.getByRole("button", { name: /recover/i }));
    await user.type(screen.getByLabelText(/^room code$/i), roomCode);
    await user.type(screen.getByLabelText(/^recovery code$/i), `  ${recoveryCode.toLowerCase()}  `);
    await user.type(screen.getByLabelText(/your display name/i), "Nadia");
    await user.click(screen.getByRole("button", { name: /recover my seat/i }));

    expect(
      await screen.findByRole("heading", { name: /your new recovery code/i }),
    ).toBeInTheDocument();
  });
});
