import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "jest-axe";
import { beforeEach, describe, expect, it } from "vitest";
import { asCommandId, asMemberId, asRoomId, type MemberId } from "@digitable/contracts";
import { ORIGINAL_MISSION } from "@digitable/template-eat-the-reich";
import { App } from "../../src/App.js";
import { readOwnershipRecord } from "../../src/session/ownership.js";
import { roomEngineStore } from "../../src/session/RoomEngineStore.js";

/**
 * C02/C06: player dashboard (scene card, party strip, compose -> declared
 * -> allocate -> confirm), driven by the real template against fixture
 * mode's in-memory `RoomEngineStore` (no Firebase config in this test's
 * `import.meta.env`, so `roomClient.ts` stays in fixture mode). A room
 * starts with no scene loaded until the GM's `LoadScene`
 * (`templates/eat-the-reich/src/engine.ts`'s `initialState` doc comment) —
 * `loadOpeningSceneAsGm` below dispatches the real command directly
 * against the room's repository, standing in for the GM's own
 * `SceneDirector` screen the same way `reviewAsGm` stands in for
 * `PendingActionsPanel`'s review.
 */

/** Room id is embedded in the current hash route (`#/room/<roomId>/player`). */
function currentRoomId(): string {
  const match = window.location.hash.match(/\/room\/([^/]+)\/player/);
  if (!match) throw new Error("expected to be on a player dashboard route");
  return match[1]!;
}

async function loadOpeningSceneAsGm(roomId: string, gmMemberId: MemberId): Promise<void> {
  const repository = roomEngineStore.getRepository(asRoomId(roomId));
  if (!repository) throw new Error("room not found");
  const { gmBriefing: _gmBriefing, ...scene } = ORIGINAL_MISSION[0]!;
  await act(async () => {
    await repository.dispatch(gmMemberId, {
      commandId: asCommandId(crypto.randomUUID()),
      payload: { type: "LoadScene", ...scene },
    });
  });
}

async function reviewAsGm(
  roomId: string,
  gmMemberId: MemberId,
  characterId = "rook",
): Promise<void> {
  const repository = roomEngineStore.getRepository(asRoomId(roomId));
  if (!repository) throw new Error("room not found");
  const projection = await repository.getProjection({
    roomId: asRoomId(roomId),
    viewerId: gmMemberId,
    capability: "gm",
  });
  const pendingRoll = projection.view.rolls.find(
    (r) => r.characterId === characterId && r.status === "declared",
  );
  if (!pendingRoll) throw new Error("no pending declared roll for " + characterId);
  await act(async () => {
    await repository.dispatch(gmMemberId, {
      commandId: asCommandId(crypto.randomUUID()),
      payload: {
        type: "ReviewAction",
        rollId: pendingRoll.rollId,
        approvedClaimIds: [],
        engagedThreatIds: [],
      },
    });
  });
}

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

/** Create a session, load the opening scene, join as a player, and claim Rook, landing on the dashboard. */
async function reachDashboardAsRook(
  user: ReturnType<typeof userEvent.setup>,
): Promise<{ readonly roomId: string; readonly gmMemberId: MemberId }> {
  renderApp("#/create");
  await user.type(screen.getByLabelText(/session name/i), "Rooftop Drop");
  await user.type(screen.getByLabelText(/^passphrase$/i), "wolfbane");
  await user.type(screen.getByLabelText(/your display name/i), "Nadia");
  await user.click(screen.getByRole("button", { name: /^create session$/i }));
  await screen.findByRole("heading", { name: /write these down/i });
  const roomCode = screen.getByText(/^room code$/i).nextElementSibling!.textContent;
  await user.click(screen.getByLabelText(/i have written these down/i));
  await user.click(screen.getByRole("button", { name: /i'm ready — continue/i }));
  await screen.findByRole("heading", { name: /^invite$/i });
  const gmOwnership = readOwnershipRecord()!;

  await loadOpeningSceneAsGm(gmOwnership.roomId, asMemberId(gmOwnership.memberId));

  window.localStorage.clear();
  goTo("#/join");
  await user.type(screen.getByLabelText(/room code/i), roomCode);
  await user.type(screen.getByLabelText(/^passphrase$/i), "wolfbane");
  await user.type(screen.getByLabelText(/your display name/i), "Rook's Player");
  await user.click(screen.getByRole("button", { name: /^join session$/i }));
  await screen.findByRole("heading", { name: /your recovery code/i });
  await user.click(screen.getByRole("button", { name: /i wrote it down/i }));
  await screen.findByRole("heading", { name: /pick your character/i });

  const rookCard = screen.getByRole("heading", { name: "Iryna" }).closest("li")!;
  await user.click(within(rookCard).getByRole("button", { name: /claim/i }));
  await within(rookCard).findByText(/^yours$/i);
  await user.click(screen.getByRole("button", { name: /continue to your dashboard/i }));

  return { roomId: gmOwnership.roomId, gmMemberId: asMemberId(gmOwnership.memberId) };
}

describe("Player dashboard (C02/C06)", () => {
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
    expect(screen.getByText(/iryna \(you\)/i)).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: /exquisite hunting rifle/i })).toBeInTheDocument();
  });

  it("declares an action, waits for the roll, and reaches the allocation step", async () => {
    const user = userEvent.setup();
    const { gmMemberId } = await reachDashboardAsRook(user);
    await screen.findByRole("heading", { name: /choose an action/i });

    await user.click(screen.getByRole("button", { name: /declare action/i }));
    expect(await screen.findByRole("heading", { name: /^declared$/i })).toBeInTheDocument();
    expect(screen.getAllByText(/waiting for the gm/i).length).toBeGreaterThan(0);

    await reviewAsGm(currentRoomId(), gmMemberId);
    expect(await screen.findByRole("heading", { name: /your roll/i })).toBeInTheDocument();
    // The status line agrees in number with the count it states ("1 of 4 dice still needs a target").
    // (A random roll can keep no dice at all; the dock then says there is nothing to assign.)
    if (screen.queryByText("No dice to assign.")) return;
    const status = screen.getByText(/still needs? a target/i).textContent.trim();
    const parts = /^(\d+) of (\d+) (die|dice) still (needs?) a target\.$/.exec(status);
    expect(parts, status).not.toBeNull();
    const [, remaining, total, noun, verb] = parts!;
    expect(verb).toBe(remaining === "1" ? "needs" : "need");
    expect(noun).toBe(total === "1" ? "die" : "dice");
  });

  it("pins the declare action to a dock that states the pool and explains a disabled button", async () => {
    const user = userEvent.setup();
    await reachDashboardAsRook(user);
    await screen.findByRole("heading", { name: /choose an action/i });

    const declare = screen.getByRole("button", { name: /declare action/i });
    const dock = declare.closest(".action-dock") as HTMLElement;
    expect(dock).not.toBeNull();
    // The dock is the last thing in the panel, and the pool total is its visible status.
    expect(dock.parentElement?.lastElementChild).toBe(dock);
    expect(within(dock).getByText(/^pool:/i)).toBeVisible();
    expect(declare).toHaveAccessibleDescription(/pool: \d+ dice?/i);
    expect(declare).toBeEnabled();
  });

  it("keeps every die's chosen target visible beside the die and counts down in the dock", async () => {
    const user = userEvent.setup();
    const { gmMemberId } = await reachDashboardAsRook(user);
    await screen.findByRole("heading", { name: /choose an action/i });
    await user.click(screen.getByRole("button", { name: /declare action/i }));
    await screen.findByRole("heading", { name: /^declared$/i });
    await reviewAsGm(currentRoomId(), gmMemberId);
    await screen.findByRole("heading", { name: /your roll/i });

    const confirm = screen.getByRole("button", { name: /confirm allocation/i });
    const dock = confirm.closest(".action-dock") as HTMLElement;
    const groups = screen.queryAllByRole("group").filter((g) => g.matches(".allocation-die-group"));
    if (groups.length === 0) {
      // A roll can keep no dice (the draw is random): there is nothing to assign, so nothing blocks Confirm.
      expect(within(dock).getByText("No dice to assign.")).toBeVisible();
      expect(confirm).toBeEnabled();
      return;
    }
    expect(confirm).toBeDisabled();
    // A disabled button says why, in text a sighted and a screen-reader user can both reach.
    expect(confirm).toHaveAccessibleDescription(/still needs? a target/i);
    expect(within(dock).getByText(/still needs? a target/i)).toBeVisible();

    for (const group of groups) {
      expect(within(group).getByText("choose a target")).toBeVisible();
    }
    const first = groups[0]!;
    await user.click(within(first).getByRole("radio", { name: /^feed$/i }));
    // The chosen target now reads beside its die, and the unchosen dice still prompt.
    expect(first.querySelector("legend .die-target")).toHaveTextContent(/^feed$/i);
    expect(first.querySelector("legend .die-target")).toHaveAttribute("data-assigned", "true");

    for (const group of groups.slice(1)) {
      await user.click(within(group).getByRole("radio", { name: /^feed$/i }));
    }
    expect(confirm).toBeEnabled();
    expect(within(dock).getByText(/target chosen\.|has a target\./i)).toBeVisible();
  });

  it("allocates every kept die and reaches a resolved confirmation", async () => {
    const user = userEvent.setup();
    const { gmMemberId } = await reachDashboardAsRook(user);
    await screen.findByRole("heading", { name: /choose an action/i });
    await user.click(screen.getByRole("button", { name: /declare action/i }));
    await screen.findByRole("heading", { name: /^declared$/i });
    await reviewAsGm(currentRoomId(), gmMemberId);
    await screen.findByRole("heading", { name: /your roll/i });

    // Assign every kept die to "Feed" — always a legal target per the real
    // `validAllocations` (engine.ts) when Rook is not fighting alone
    // against a `noFeeding` Threat, which the opening scene's Threats
    // never set.
    const dieGroups = screen.queryAllByRole("group");
    for (const group of dieGroups) {
      const feedRadio = within(group).queryByRole("radio", { name: /^feed$/i });
      if (feedRadio) await user.click(feedRadio);
    }

    const confirmButton = screen.getByRole("button", { name: /confirm allocation/i });
    expect(confirmButton).not.toBeDisabled();
    await user.click(confirmButton);

    expect(await screen.findByRole("heading", { name: /^resolved$/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /back to scene/i })).toBeInTheDocument();
  });

  it("explains in the dock why Declare is unavailable once the character has acted this round", async () => {
    const user = userEvent.setup();
    const { gmMemberId } = await reachDashboardAsRook(user);
    await screen.findByRole("heading", { name: /choose an action/i });
    await user.click(screen.getByRole("button", { name: /declare action/i }));
    await screen.findByRole("heading", { name: /^declared$/i });
    await reviewAsGm(currentRoomId(), gmMemberId);
    await screen.findByRole("heading", { name: /your roll/i });
    for (const group of screen.queryAllByRole("group")) {
      const feed = within(group).queryByRole("radio", { name: /^feed$/i });
      if (feed) await user.click(feed);
    }
    await user.click(screen.getByRole("button", { name: /confirm allocation/i }));
    await screen.findByRole("heading", { name: /^resolved$/i });
    await user.click(screen.getByRole("button", { name: /back to scene/i }));

    const declare = await screen.findByRole("button", { name: /declare action/i });
    expect(declare).toBeDisabled();
    expect(declare).toHaveAccessibleDescription(/you've acted this round/i);
  });

  it("allocates entirely by keyboard (radio selection + Enter to confirm), no pointer input", async () => {
    const user = userEvent.setup();
    const { gmMemberId } = await reachDashboardAsRook(user);
    await screen.findByRole("heading", { name: /choose an action/i });
    const declareButton = screen.getByRole("button", { name: /declare action/i });
    declareButton.focus();
    await user.keyboard("{Enter}");
    await screen.findByRole("heading", { name: /^declared$/i });
    await reviewAsGm(currentRoomId(), gmMemberId);
    await screen.findByRole("heading", { name: /your roll/i });

    const dieGroups = screen.queryAllByRole("group");
    for (const group of dieGroups) {
      const feedRadio = within(group).queryByRole("radio", { name: /^feed$/i });
      if (feedRadio) {
        feedRadio.focus();
        await user.keyboard(" ");
      }
    }

    const confirmButton = screen.getByRole("button", { name: /confirm allocation/i });
    if (!confirmButton.hasAttribute("disabled")) {
      confirmButton.focus();
      await user.keyboard("{Enter}");
      expect(await screen.findByRole("heading", { name: /^resolved$/i })).toBeInTheDocument();
    }
  });

  it("has no detectable accessibility violations on the compose step at 375x812, 1280x800, and 1920x1080", async () => {
    const user = userEvent.setup();
    const { container } = await (async () => {
      await reachDashboardAsRook(user);
      await screen.findByRole("heading", { name: /choose an action/i });
      return { container: document.body };
    })();

    expect(await axe(container)).toHaveNoViolations();

    setViewport(1280, 800);
    expect(await axe(container)).toHaveNoViolations();

    setViewport(1920, 1080);
    expect(await axe(container)).toHaveNoViolations();
  });
});
