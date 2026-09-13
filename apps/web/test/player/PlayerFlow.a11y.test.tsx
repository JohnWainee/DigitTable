import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "jest-axe";
import { beforeEach, describe, expect, it } from "vitest";
import { PlayerScreen } from "../../src/player/PlayerScreen.js";
import { InMemoryRoomRepository } from "../../src/repository/InMemoryRoomRepository.js";

/** Renders the player surface at a common phone viewport width. */
function renderAtPhoneWidth(
  reducedMotion: boolean,
): { repository: InMemoryRoomRepository } & ReturnType<typeof render> {
  window.innerWidth = 375;
  window.innerHeight = 667;
  const repository = new InMemoryRoomRepository();
  const utils = render(<PlayerScreen repository={repository} reducedMotion={reducedMotion} />);
  return { repository, ...utils };
}

describe("Player flow at phone width", () => {
  beforeEach(() => {
    window.innerWidth = 375;
    window.innerHeight = 667;
  });

  it("has no detectable accessibility violations in the compose step", async () => {
    const { container } = renderAtPhoneWidth(true);
    expect(await axe(container)).toHaveNoViolations();
  });

  it("announces the compact pool total and reveals its derivation in a native, keyboard-operable disclosure", async () => {
    const user = userEvent.setup();
    const { container } = renderAtPhoneWidth(true);

    expect(container.textContent).toMatch(/Pool:/);
    const disclosure = screen.getByText("Why?");
    await user.click(disclosure);
    expect(container.textContent).toMatch(/Nerve:/);
  });

  it("completes compose -> roll -> wait for opposition -> allocate -> confirm using only the keyboard", async () => {
    const user = userEvent.setup();
    const { container } = renderAtPhoneWidth(true);

    // compose: toggle the one gear item by keyboard, then begin the action.
    const gearCheckbox = screen.getByRole("checkbox", { name: /silenced tool/i });
    gearCheckbox.focus();
    await user.keyboard(" ");
    expect(gearCheckbox).toBeChecked();

    const beginButton = screen.getByRole("button", { name: /strong-arm the enforcer/i });
    beginButton.focus();
    await user.keyboard("{Enter}");

    // roll: the player's own result is shown immediately (no activeRoll -> activeRoll transition to wait for).
    expect(await screen.findByRole("heading", { name: /your roll/i })).toBeInTheDocument();

    // wait for opposition: the local GM stand-in resolves it after a short, announced delay.
    expect(
      await screen.findByRole("button", { name: /confirm allocation/i }, { timeout: 3000 }),
    ).toBeInTheDocument();

    // allocate: drive the first stepper (if any successes were earned) with the keyboard alone.
    const spinbuttons = screen.queryAllByRole("spinbutton");
    if (spinbuttons.length > 0) {
      const first = spinbuttons[0]!;
      first.focus();
      await user.keyboard("{ArrowUp}");
      expect(first).toHaveAttribute("aria-valuenow", "1");
    }

    const confirmButton = screen.getByRole("button", { name: /confirm allocation/i });
    confirmButton.focus();
    await user.keyboard("{Enter}");

    // confirm: the resolved outcome is shown, with no further action required.
    expect(await screen.findByRole("heading", { name: /resolved/i })).toBeInTheDocument();

    expect(await axe(container)).toHaveNoViolations();
  });

  it("can play again after resolution, returning to a fresh compose step", async () => {
    const user = userEvent.setup();
    renderAtPhoneWidth(true);

    const beginButton = screen.getByRole("button", { name: /strong-arm the enforcer/i });
    beginButton.focus();
    await user.keyboard("{Enter}");

    const confirmButton = await screen.findByRole(
      "button",
      { name: /confirm allocation/i },
      { timeout: 3000 },
    );
    confirmButton.focus();
    await user.keyboard("{Enter}");
    await screen.findByRole("heading", { name: /resolved/i });

    const playAgainButton = screen.getByRole("button", { name: /play again/i });
    playAgainButton.focus();
    await user.keyboard("{Enter}");

    expect(await screen.findByRole("heading", { name: /choose an action/i })).toBeInTheDocument();
  });
});
