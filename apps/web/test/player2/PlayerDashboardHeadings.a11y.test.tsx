import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "jest-axe";
import { beforeEach, describe, expect, it } from "vitest";
import { asMemberId, asRoomId } from "@digitable/contracts";
import { writeOwnershipRecord } from "../../src/session/ownership.js";
import { expectNavigableHeadingOutline, headingOutline } from "../accessibility/headingOutline.js";
import {
  claimRook,
  createSessionAsGm,
  goTo,
  joinAsPlayer,
  loadOpeningSceneAsGm,
  renderApp,
  reviewAsGm,
  setViewport,
} from "../support/flows.js";

/**
 * Review F7 (docs/reviews/2026-09-18-staging-independent-playtest-review.md):
 * the player dashboard rendered no `<h1>`, so heading navigation had no
 * page-level landmark. Every state the route can render must expose exactly
 * one h1 first in document order and never skip a level.
 *
 * `expectNavigableHeadingOutline` asserts that structure directly (axe's own
 * `page-has-heading-one` targets the `html` element and cannot be pointed at
 * a jsdom body without jest-axe moving `<html>` into it, so it is not used);
 * axe then covers `heading-order`, `empty-heading`, landmark, and naming rules
 * over the same DOM.
 */
async function expectAccessibleHeadings(): Promise<void> {
  expectNavigableHeadingOutline();
  expect(await axe(document.body)).toHaveNoViolations();
}

/** GM creates and loads the opening scene; a player joins and claims Rook; the tab lands on the dashboard. */
async function reachDashboard(user: ReturnType<typeof userEvent.setup>): Promise<{
  readonly roomId: string;
  readonly gmMemberId: string;
}> {
  const { roomId, roomCode, gmOwnership } = await createSessionAsGm(user);
  await loadOpeningSceneAsGm(roomId, asMemberId(gmOwnership.memberId));
  await joinAsPlayer(user, roomCode);
  await claimRook(user);
  await user.click(screen.getByRole("button", { name: /continue to your dashboard/i }));
  await screen.findByRole("heading", { name: /choose an action/i });
  return { roomId, gmMemberId: gmOwnership.memberId };
}

describe("Player dashboard heading structure (F7)", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    setViewport(375, 812);
    window.location.hash = "";
  });

  it("names the page with one h1 while the projection is still loading", async () => {
    const user = userEvent.setup();
    const { roomId } = await reachDashboard(user);

    // Re-mount the dashboard route from scratch: the first render precedes any projection.
    goTo("#/");
    goTo(`#/room/${roomId}/player`);
    const outline = headingOutline();
    expect(outline.filter((h) => h.level === 1)).toEqual([{ level: 1, text: "Player dashboard" }]);
    expectNavigableHeadingOutline();
    await screen.findByRole("heading", { name: /choose an action/i });
  });

  it("names the page for a visitor with no seat in this room", async () => {
    renderApp("#/room/some-room/player");
    expect(await screen.findByRole("alert")).toHaveTextContent(/join and claim a character/i);
    expect(screen.getByRole("heading", { level: 1, name: "Player dashboard" })).toBeInTheDocument();
    await expectAccessibleHeadings();
  });

  it("names the page when the session has ended or fixture mode lost it", async () => {
    writeOwnershipRecord({
      roomId: asRoomId("ghost-room"),
      roomCode: "GHOST1",
      memberId: "member-ghost",
      capability: "player",
      recoveryCode: null,
      displayName: "Ghost",
      sessionName: "Gone",
    });
    renderApp("#/room/ghost-room/player");
    expect(await screen.findByRole("alert")).toHaveTextContent(/session has ended/i);
    expect(screen.getByRole("heading", { level: 1, name: "Player dashboard" })).toBeInTheDocument();
    await expectAccessibleHeadings();
  });

  it("has a navigable outline on the compose step", async () => {
    const user = userEvent.setup();
    await reachDashboard(user);
    expect(headingOutline()).toEqual([
      { level: 1, text: "Player dashboard" },
      expect.objectContaining({ level: 2 }), // scene title
      expect.objectContaining({ level: 3, text: "Objective" }),
      expect.objectContaining({ level: 3, text: "Threats" }),
      { level: 2, text: "Party" },
      { level: 2, text: "Choose an action" },
    ]);
    await expectAccessibleHeadings();
  });

  it("keeps the same h1 on the declared, allocation, and resolved steps", async () => {
    const user = userEvent.setup();
    const { roomId, gmMemberId } = await reachDashboard(user);

    await user.click(screen.getByRole("button", { name: /declare action/i }));
    await screen.findByRole("heading", { level: 2, name: /^declared$/i });
    await expectAccessibleHeadings();

    await reviewAsGm(roomId, gmMemberId);
    await screen.findByRole("heading", { level: 2, name: /your roll/i });
    await expectAccessibleHeadings();

    for (const group of screen.queryAllByRole("group")) {
      const feed = within(group).queryByRole("radio", { name: /^feed$/i });
      if (feed) await user.click(feed);
    }
    await user.click(screen.getByRole("button", { name: /confirm allocation/i }));
    await screen.findByRole("heading", { level: 2, name: /^resolved$/i });
    await expectAccessibleHeadings();
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
  });

  it("stays valid at desktop widths", async () => {
    const user = userEvent.setup();
    await reachDashboard(user);
    setViewport(1920, 1080);
    await expectAccessibleHeadings();
  });
});
