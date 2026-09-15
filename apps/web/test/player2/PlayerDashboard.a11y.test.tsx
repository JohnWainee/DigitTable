import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "jest-axe";
import { beforeEach, describe, expect, it } from "vitest";
import { App } from "../../src/App.js";

/**
 * C02: player dashboard (scene card, party strip, compose -> declared ->
 * allocate -> confirm). Reuses C01's create/join/claim flow to reach a
 * claimed character, then drives the fixture play loop
 * (apps/web/src/session/fixturePlayLoop.ts + usePlayLoopFixture.ts —
 * TEMPORARY until B03 lands) end to end.
 */

function setViewport(width: number, height: number): void {
  window.innerWidth = width;
  window.innerHeight = height;
}

function goTo(hash: string): void {
  act(() => {
    window.location.hash = hash;
    window.dispatchEvent(new Event("hashchange"));
  });
}

function renderApp(hash = "#/"): ReturnType<typeof render> {
  window.location.hash = hash;
  return render(<App />);
}

/** Create a session, join as a player, and claim Rook, landing on the dashboard. */
async function reachDashboardAsRook(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  renderApp("#/create");
  await user.type(screen.getByLabelText(/session name/i), "Rooftop Drop");
  await user.type(screen.getByLabelText(/^passphrase$/i), "wolfbane");
  await user.type(screen.getByLabelText(/your display name/i), "Nadia");
  await user.click(screen.getByRole("button", { name: /^create session$/i }));
  await screen.findByRole("heading", { name: /write these down/i });
  const roomCode = screen.getByText(/^room code$/i).nextElementSibling!.textContent;

  window.localStorage.clear();
  goTo("#/join");
  await user.type(screen.getByLabelText(/room code/i), roomCode);
  await user.type(screen.getByLabelText(/^passphrase$/i), "wolfbane");
  await user.type(screen.getByLabelText(/your display name/i), "Rook's Player");
  await user.click(screen.getByRole("button", { name: /^join session$/i }));
  await screen.findByRole("heading", { name: /your recovery code/i });
  await user.click(screen.getByRole("button", { name: /i wrote it down/i }));
  await screen.findByRole("heading", { name: /pick your character/i });

  const rookCard = screen.getByRole("heading", { name: "Rook" }).closest("li")!;
  await user.click(within(rookCard).getByRole("button", { name: /claim/i }));
  await within(rookCard).findByText(/^yours$/i);
  await user.click(screen.getByRole("button", { name: /continue to your dashboard/i }));
}

describe("Player dashboard (C02)", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    setViewport(375, 812);
    window.location.hash = "";
  });

  it("renders the scene card, party strip, and compose step for the claimed character", async () => {
    const user = userEvent.setup();
    await reachDashboardAsRook(user);

    expect(await screen.findByRole("heading", { name: /choose an action/i })).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /forecourt of the gare des ombres/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/get clear of the wreckage/i)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /^party$/i })).toBeInTheDocument();
    expect(screen.getByText(/rook \(you\)/i)).toBeInTheDocument();
    // Rook's items from the roster fixture render as real checkboxes.
    expect(screen.getByRole("checkbox", { name: /silenced pistol/i })).toBeInTheDocument();
  });

  it("declares an action, waits for the roll, and reaches the allocation step", async () => {
    const user = userEvent.setup();
    await reachDashboardAsRook(user);
    await screen.findByRole("heading", { name: /choose an action/i });

    await user.click(screen.getByRole("button", { name: /declare action/i }));
    expect(await screen.findByRole("heading", { name: /^declared$/i })).toBeInTheDocument();
    expect(screen.getAllByText(/waiting for the gm/i).length).toBeGreaterThan(0);

    expect(
      await screen.findByRole("heading", { name: /your roll/i }, { timeout: 2000 }),
    ).toBeInTheDocument();
    expect(screen.getByText(/points left to assign/i)).toBeInTheDocument();
  });

  it("allocates every point and reaches a resolved confirmation", async () => {
    const user = userEvent.setup();
    await reachDashboardAsRook(user);
    await screen.findByRole("heading", { name: /choose an action/i });
    await user.click(screen.getByRole("button", { name: /declare action/i }));
    await screen.findByRole("heading", { name: /your roll/i }, { timeout: 2000 });

    const increaseObjective = screen.queryByRole("button", { name: /^increase .*wreckage/i });
    if (increaseObjective) {
      // Assign everything to the objective via the AllocationStepper (keyboard/click operable).
      for (let i = 0; i < 20; i += 1) {
        const btn = screen.queryByRole("button", { name: /^increase .*wreckage/i });
        if (!btn || btn.hasAttribute("disabled")) break;

        await user.click(btn);
      }
    }

    const confirmButton = screen.getByRole("button", { name: /confirm allocation/i });
    expect(confirmButton).not.toBeDisabled();
    await user.click(confirmButton);

    expect(await screen.findByRole("heading", { name: /^resolved$/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /back to scene/i })).toBeInTheDocument();
  });

  it("has no detectable accessibility violations on the compose step at 375x812 and 1280x800", async () => {
    const user = userEvent.setup();
    const { container } = await (async () => {
      await reachDashboardAsRook(user);
      await screen.findByRole("heading", { name: /choose an action/i });
      return { container: document.body };
    })();

    expect(await axe(container)).toHaveNoViolations();

    setViewport(1280, 800);
    expect(await axe(container)).toHaveNoViolations();
  });
});
