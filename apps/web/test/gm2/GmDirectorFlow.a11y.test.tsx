import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "jest-axe";
import { beforeEach, describe, expect, it } from "vitest";
import { App } from "../../src/App.js";
import {
  readOwnershipRecord,
  writeOwnershipRecord,
  type LocalOwnershipRecord,
} from "../../src/session/ownership.js";

/**
 * C03/C06: GM director console (invite/scene director/pending actions/
 * roster/correction) and the read-only table display, driven by the real
 * template against fixture mode's in-memory `RoomEngineStore` (no Firebase
 * config in this test's `import.meta.env`, so `roomClient.ts` stays in
 * fixture mode — see `apps/web/src/session/roomClient.ts`'s `isLiveMode`).
 * Drives all three viewer roles (GM, player, table) in one browser tab,
 * switching the ownership record in `localStorage` between them the same
 * way a real multi-device session would use three different browsers —
 * `roomEngineStore` is a shared in-page singleton, so what one role does
 * is visible to the others.
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

interface SessionHandles {
  readonly roomId: string;
  readonly roomCode: string;
  readonly tableCode: string;
  readonly gmOwnership: LocalOwnershipRecord;
}

/** Creates a session as GM and returns everything needed to switch roles later. */
async function createSessionAsGm(
  user: ReturnType<typeof userEvent.setup>,
): Promise<SessionHandles> {
  renderApp("#/create");
  await user.type(screen.getByLabelText(/session name/i), "Rooftop Drop");
  await user.type(screen.getByLabelText(/^passphrase$/i), "wolfbane");
  await user.type(screen.getByLabelText(/your display name/i), "Nadia");
  await user.click(screen.getByRole("button", { name: /^create session$/i }));
  await screen.findByRole("heading", { name: /write these down/i });
  const roomCode = screen.getByText(/^room code$/i).nextElementSibling!.textContent;
  const tableCode = screen.getByText(/^table code$/i).nextElementSibling!.textContent;
  await user.click(screen.getByLabelText(/i have written these down/i));
  await user.click(screen.getByRole("button", { name: /i'm ready — continue/i }));
  await screen.findByRole("heading", { name: /^invite$/i });
  await user.click(screen.getByRole("button", { name: /open the director console/i }));
  await screen.findByRole("heading", { name: /director console/i });
  // Real `BeginAction` requires an active scene (matrix S05: "no active
  // scene" is a real rejection) — load the opening scene through the real
  // `SceneDirector` UI before any test that needs a player to declare.
  await user.click(screen.getByRole("button", { name: /^load scene$/i }));
  const gmOwnership = readOwnershipRecord()!;
  return { roomId: gmOwnership.roomId, roomCode, tableCode, gmOwnership };
}

/** Switches this tab to a different browser tab, join code = a different local identity. */
async function joinAndClaimRook(
  user: ReturnType<typeof userEvent.setup>,
  roomCode: string,
): Promise<LocalOwnershipRecord> {
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
  await screen.findByRole("heading", { name: /choose an action/i });
  return readOwnershipRecord()!;
}

describe("GM director console and table display (C03)", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    setViewport(375, 812);
    window.location.hash = "";
  });

  it("shows the invite panel, scene director, and empty roster before anyone joins", async () => {
    const user = userEvent.setup();
    await createSessionAsGm(user);
    const container = document.body;

    expect(screen.getByRole("heading", { name: /invite/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /scene director/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /^roster$/i })).toBeInTheDocument();
    const rookRow = screen.getByText("Rook").closest("li")!;
    expect(rookRow.textContent).toMatch(/unclaimed/i);
    expect(await axe(container)).toHaveNoViolations();
  });

  it("routes a declared action through GM review, where striking the bonus claim shrinks the rolled pool", async () => {
    const user = userEvent.setup();
    const { roomCode, roomId, gmOwnership } = await createSessionAsGm(user);
    const playerOwnership = await joinAndClaimRook(user, roomCode);

    // Player declares Sneak (4) with the silenced pistol and claims its +1 bonus:
    // the full pool (bonus approved) would be 4 + 1 item + 1 bonus = 6.
    await user.click(screen.getByRole("radio", { name: /^sneak/i }));
    await user.click(screen.getByRole("checkbox", { name: /silenced pistol/i }));
    await user.click(screen.getByRole("checkbox", { name: /meeting.*silenced pistol.*bonus/i }));
    await user.click(screen.getByRole("button", { name: /declare action/i }));
    await screen.findByRole("heading", { name: /^declared$/i });

    // Switch to the GM.
    writeOwnershipRecord(gmOwnership);
    goTo(`#/room/${roomId}/gm`);
    await screen.findByRole("heading", { name: /pending actions/i });
    const pendingCard = screen.getByRole("heading", { name: "Rook" }).closest("li")!;
    expect(pendingCard.textContent).toMatch(/pool:\s*6\s*dice/i);

    // GM strikes the bonus claim: the displayed pool drops to 5.
    const bonusCheckbox = within(pendingCard).getByRole("checkbox", { name: /close quarters/i });
    expect(bonusCheckbox).toBeChecked();
    await user.click(bonusCheckbox);
    expect(pendingCard.textContent).toMatch(/pool:\s*5\s*dice/i);

    await user.click(within(pendingCard).getByRole("button", { name: /roll it/i }));
    expect(screen.getByText(/no one is waiting on you/i)).toBeInTheDocument();

    // Confirm on the player's side: exactly 5 dice were rolled (no bonus die), never charged twice.
    writeOwnershipRecord(playerOwnership);
    goTo(`#/room/${roomId}/player`);
    const rollHeading = await screen.findByRole("heading", { name: /your roll/i });
    const rollSection = rollHeading.closest("section")!;
    const kept = within(rollSection).getAllByLabelText(/kept dice/i);
    const discarded = within(rollSection).queryAllByLabelText(/discarded dice/i);
    const keptCount = kept.length > 0 ? within(kept[0]!).queryAllByRole("listitem").length : 0;
    const discardedCount =
      discarded.length > 0 ? within(discarded[0]!).queryAllByRole("listitem").length : 0;
    expect(keptCount + discardedCount).toBe(5);
  });

  it("lets the GM correct a character's Blood with a required reason", async () => {
    const user = userEvent.setup();
    const { roomCode, roomId, gmOwnership } = await createSessionAsGm(user);
    await joinAndClaimRook(user, roomCode);

    writeOwnershipRecord(gmOwnership);
    goTo(`#/room/${roomId}/gm`);
    await screen.findByRole("heading", { name: /^roster$/i });

    const rookRow = screen.getByText(/^rook/i).closest("li")!;
    const correctButton = within(rookRow).getByRole("button", { name: /correct/i });
    await user.click(correctButton);

    const dialog = screen.getByRole("dialog", { name: /correct rook/i });
    // C05: focus moves into the dialog on open, not left behind on the trigger.
    expect(within(dialog).getByRole("heading", { name: /correct rook/i })).toHaveFocus();

    const applyButton = within(dialog).getByRole("button", { name: /apply correction/i });
    expect(applyButton).toBeDisabled(); // no reason yet, delta is 0

    await user.click(within(dialog).getByRole("button", { name: /^increase blood change$/i }));
    expect(applyButton).toBeDisabled(); // delta != 0 but reason is still empty
    await user.type(within(dialog).getByLabelText(/reason/i), "Fed off-screen between scenes");
    expect(applyButton).not.toBeDisabled();
    await user.click(applyButton);

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByText(/blood 1\/10/i)).toBeInTheDocument();
    // C05: focus returns to whatever triggered the dialog once it closes.
    expect(correctButton).toHaveFocus();
  });

  it("closes the correction dialog on Escape without applying anything, returning focus to the trigger", async () => {
    const user = userEvent.setup();
    const { roomCode, roomId, gmOwnership } = await createSessionAsGm(user);
    await joinAndClaimRook(user, roomCode);

    writeOwnershipRecord(gmOwnership);
    goTo(`#/room/${roomId}/gm`);
    await screen.findByRole("heading", { name: /^roster$/i });

    const rookRow = screen.getByText(/^rook/i).closest("li")!;
    const correctButton = within(rookRow).getByRole("button", { name: /correct/i });
    await user.click(correctButton);
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(correctButton).toHaveFocus();
    expect(within(rookRow).getByText(/blood 0\/10/i)).toBeInTheDocument(); // unchanged
  });

  it("traps Tab focus inside the correction dialog and is itself axe-clean", async () => {
    const user = userEvent.setup();
    const { roomCode, roomId, gmOwnership } = await createSessionAsGm(user);
    await joinAndClaimRook(user, roomCode);

    writeOwnershipRecord(gmOwnership);
    goTo(`#/room/${roomId}/gm`);
    await screen.findByRole("heading", { name: /^roster$/i });

    const rookRow = screen.getByText(/^rook/i).closest("li")!;
    await user.click(within(rookRow).getByRole("button", { name: /correct/i }));
    const dialog = screen.getByRole("dialog");

    expect(await axe(dialog)).toHaveNoViolations();

    // Shift+Tab from the first focusable control wraps to the last, never
    // escaping into the console behind the backdrop.
    const cancelButton = within(dialog).getByRole("button", { name: /cancel/i });
    await user.tab({ shift: true });
    expect(cancelButton).toHaveFocus();

    // Tab from the last control wraps back to the first.
    await user.tab();
    expect(within(dialog).getByRole("button", { name: /decrease blood change/i })).toHaveFocus();
  });

  it("table display shows the route map and party strip with no form controls and no secrets", async () => {
    const user = userEvent.setup();
    const { roomCode, tableCode } = await createSessionAsGm(user);
    await joinAndClaimRook(user, roomCode);

    window.localStorage.clear();
    goTo("#/table");
    await user.type(screen.getByLabelText(/room code/i), roomCode);
    await user.type(screen.getByLabelText(/table code/i), tableCode);
    await user.click(screen.getByRole("button", { name: /connect display/i }));
    await user.click(await screen.findByRole("button", { name: /open the table display/i }));

    expect(await screen.findByRole("img", { name: /route map/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /^party$/i })).toBeInTheDocument();
    expect(screen.getByText(/rook/i)).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    // Never a code/passphrase on the table.
    expect(screen.queryByText(roomCode)).not.toBeInTheDocument();
    expect(screen.queryByText(/wolfbane/i)).not.toBeInTheDocument();

    expect(await axe(document.body)).toHaveNoViolations();
    setViewport(1920, 1080);
    expect(await axe(document.body)).toHaveNoViolations();
  });

  it("has no detectable accessibility violations on the GM console at 375x812, 1280x800, and 1920x1080", async () => {
    const user = userEvent.setup();
    await createSessionAsGm(user);
    const container = document.body;

    expect(await axe(container)).toHaveNoViolations();
    setViewport(1280, 800);
    expect(await axe(container)).toHaveNoViolations();
    setViewport(1920, 1080);
    expect(await axe(container)).toHaveNoViolations();
  });
});
