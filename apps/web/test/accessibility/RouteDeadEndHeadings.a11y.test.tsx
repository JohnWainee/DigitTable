import { screen } from "@testing-library/react";
import { axe } from "jest-axe";
import { beforeEach, describe, expect, it } from "vitest";
import { asRoomId } from "@digitable/contracts";
import { writeOwnershipRecord, type LocalOwnershipRecord } from "../../src/session/ownership.js";
import { renderApp } from "../support/flows.js";
import { expectNavigableHeadingOutline, headingOutline } from "./headingOutline.js";

/**
 * Every dead-end state a route can render (no seat here, the session is gone, still loading) must
 * name the page with exactly one `<h1>`. Before this, the claim, GM and table routes rendered a bare
 * `<main>` with only an alert, so a screen-reader user had no page title and the real-browser audit
 * (`scripts/playtest/ui-audit.mjs`) kept reporting axe `page-has-heading-one` on
 * `#/claim/no-such-room`. The player route already had this guarantee
 * (`test/player2/PlayerDashboardHeadings.a11y.test.tsx`).
 */
function ghostOwnership(capability: LocalOwnershipRecord["capability"]): void {
  writeOwnershipRecord({
    roomId: asRoomId("ghost-room"),
    roomCode: "GHOST1",
    memberId: "member-ghost",
    capability,
    recoveryCode: null,
    displayName: "Ghost",
    sessionName: "Gone",
  });
}

async function expectOneH1(name: string): Promise<void> {
  const h1s = headingOutline().filter((h) => h.level === 1);
  expect(h1s).toEqual([{ level: 1, text: name }]);
  expectNavigableHeadingOutline();
  expect(await axe(document.body)).toHaveNoViolations();
}

describe("route dead-end states name the page", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    window.location.hash = "";
  });

  it("claim: visitor with no seat in the room", async () => {
    renderApp("#/claim/some-room");
    expect(await screen.findByRole("alert")).toHaveTextContent(/need to join/i);
    await expectOneH1("Pick your character");
  });

  it("claim: the session has ended", async () => {
    ghostOwnership("player");
    renderApp("#/claim/ghost-room");
    expect(await screen.findByRole("alert")).toHaveTextContent(/session has ended/i);
    await expectOneH1("Pick your character");
  });

  it("gm: the session has ended", async () => {
    ghostOwnership("gm");
    renderApp("#/room/ghost-room/gm");
    expect(await screen.findByRole("alert")).toHaveTextContent(/session has ended/i);
    await expectOneH1("Director console");
  });

  it("gm: still loading names the page too", () => {
    ghostOwnership("gm");
    renderApp("#/room/ghost-room/gm");
    // First render precedes any projection and any not-found verdict.
    expect(screen.getByRole("heading", { level: 1, name: "Director console" })).toBeInTheDocument();
  });

  it("table: a display with no room", async () => {
    renderApp("#/room/some-room/table");
    expect(await screen.findByRole("alert")).toHaveTextContent(/isn.t connected to a room/i);
    await expectOneH1("Eat the Reich");
  });

  it("table: the session has ended", async () => {
    ghostOwnership("table");
    renderApp("#/room/ghost-room/table");
    expect(await screen.findByRole("alert")).toHaveTextContent(/session has ended/i);
    await expectOneH1("Eat the Reich");
  });

  it("table: still loading names the page too", () => {
    ghostOwnership("table");
    renderApp("#/room/ghost-room/table");
    expect(screen.getByRole("heading", { level: 1, name: "Eat the Reich" })).toBeInTheDocument();
  });
});
