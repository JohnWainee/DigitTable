import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "jest-axe";
import { asCommandId, type CommandId } from "@digitable/contracts";
import { beforeEach, describe, expect, it } from "vitest";
import { PlayerScreen } from "../../src/player/PlayerScreen.js";
import { InMemoryRoomRepository } from "../../src/repository/InMemoryRoomRepository.js";

function newCommandId(): CommandId {
  return asCommandId(globalThis.crypto.randomUUID());
}

/** Renders the player surface at a common phone viewport width. */
function renderAtPhoneWidth(): { repository: InMemoryRoomRepository } & ReturnType<typeof render> {
  window.innerWidth = 375;
  window.innerHeight = 667;
  const repository = new InMemoryRoomRepository();
  const utils = render(<PlayerScreen repository={repository} />);
  return { repository, ...utils };
}

/**
 * Stands in for the GM surface (out of scope for this test file — see
 * apps/web/test/gm/GmScreen.test.tsx) by submitting opposition directly
 * through the shared repository, exactly as `GmScreen` would.
 */
async function resolveOppositionAsGm(
  repository: InMemoryRoomRepository,
  pushDice = 0,
): Promise<void> {
  const rollId = repository.getPlayerProjection().view.activeRoll?.rollId;
  if (!rollId) {
    throw new Error("expected an active roll awaiting opposition");
  }
  await act(async () => {
    const result = await repository.submitOpposition(newCommandId(), rollId, pushDice);
    if (result.status !== "accepted") {
      throw new Error(`opposition dispatch unexpectedly failed: ${result.message}`);
    }
  });
}

describe("Player flow at phone width", () => {
  beforeEach(() => {
    window.innerWidth = 375;
    window.innerHeight = 667;
  });

  it("has no detectable accessibility violations in the compose step", async () => {
    const { container } = renderAtPhoneWidth();
    expect(await axe(container)).toHaveNoViolations();
  });

  it("announces the compact pool total and reveals its derivation in a native, keyboard-operable disclosure", async () => {
    const user = userEvent.setup();
    const { container } = renderAtPhoneWidth();

    expect(container.textContent).toMatch(/Pool:/);
    const disclosure = screen.getByText("Why?");
    await user.click(disclosure);
    expect(container.textContent).toMatch(/Nerve:/);
  });

  it("shows the waiting-on-gm state as soon as the roll is submitted, with no fixed delay", async () => {
    const user = userEvent.setup();
    renderAtPhoneWidth();

    const beginButton = screen.getByRole("button", { name: /strong-arm the enforcer/i });
    beginButton.focus();
    await user.keyboard("{Enter}");

    expect(await screen.findByRole("heading", { name: /your roll/i })).toBeInTheDocument();
    expect(screen.getAllByText(/waiting on the opposition/i)).toHaveLength(2);
  });

  it("completes compose -> roll -> wait for opposition -> allocate -> confirm using only the keyboard", async () => {
    const user = userEvent.setup();
    const { container, repository } = renderAtPhoneWidth();

    // compose: toggle the one gear item by keyboard, then begin the action.
    const gearCheckbox = screen.getByRole("checkbox", { name: /silenced tool/i });
    gearCheckbox.focus();
    await user.keyboard(" ");
    expect(gearCheckbox).toBeChecked();

    const beginButton = screen.getByRole("button", { name: /strong-arm the enforcer/i });
    beginButton.focus();
    await user.keyboard("{Enter}");

    // roll: the player's own result is shown immediately.
    expect(await screen.findByRole("heading", { name: /your roll/i })).toBeInTheDocument();

    // wait for opposition: a real GM surface (not this one) submits it through the shared repository.
    await resolveOppositionAsGm(repository);
    expect(await screen.findByRole("button", { name: /confirm allocation/i })).toBeInTheDocument();

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
    const { repository } = renderAtPhoneWidth();

    const beginButton = screen.getByRole("button", { name: /strong-arm the enforcer/i });
    beginButton.focus();
    await user.keyboard("{Enter}");

    await screen.findByRole("heading", { name: /your roll/i });
    await resolveOppositionAsGm(repository);

    const confirmButton = await screen.findByRole("button", { name: /confirm allocation/i });
    confirmButton.focus();
    await user.keyboard("{Enter}");
    await screen.findByRole("heading", { name: /resolved/i });

    const playAgainButton = screen.getByRole("button", { name: /play again/i });
    playAgainButton.focus();
    await user.keyboard("{Enter}");

    expect(await screen.findByRole("heading", { name: /choose an action/i })).toBeInTheDocument();
  });

  it("surfaces an opposition-dispatch failure instead of waiting silently forever", async () => {
    const user = userEvent.setup();
    const { repository } = renderAtPhoneWidth();

    const beginButton = screen.getByRole("button", { name: /strong-arm the enforcer/i });
    beginButton.focus();
    await user.keyboard("{Enter}");
    await screen.findByRole("heading", { name: /your roll/i });

    const rollId = repository.getPlayerProjection().view.activeRoll?.rollId;
    if (!rollId) throw new Error("expected an active roll");

    // An out-of-range push-dice value is rejected by the template's own validation
    // (templates/eat-the-reich/src/engine.ts), simulating any other reason the GM's
    // dispatch might fail.
    await act(async () => {
      await repository.submitOpposition(newCommandId(), rollId, 99);
    });

    expect(await screen.findByRole("alert")).toHaveTextContent(/push dice/i);
  });
});
