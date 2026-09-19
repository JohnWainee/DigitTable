import { act, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { asMemberId } from "@digitable/contracts";
import { readOwnershipRecord, writeOwnershipRecord } from "../../src/session/ownership.js";
import { navigate, replaceRoute } from "../../src/router.js";
import {
  claimRook,
  createSessionAsGm,
  goTo,
  joinAsPlayer,
  loadOpeningSceneAsGm,
  setViewport,
} from "../support/flows.js";

/**
 * Review F6 (docs/reviews/2026-09-18-staging-independent-playtest-review.md):
 * landing "Resume" for a player who already claimed a character opened the
 * character picker instead of the dashboard, costing an extra tap. Resume
 * now goes to the dashboard; the dashboard (server truth, via the
 * projection) sends a player with no claimed character on to the picker.
 */
describe("Landing Resume routing (F6)", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    setViewport(375, 812);
    window.location.hash = "";
  });

  it("resumes a player who already claimed a character straight into the dashboard", async () => {
    const user = userEvent.setup();
    const { roomId, roomCode, gmOwnership } = await createSessionAsGm(user);
    await loadOpeningSceneAsGm(roomId, asMemberId(gmOwnership.memberId));
    await joinAsPlayer(user, roomCode);
    await claimRook(user);

    goTo("#/");
    await user.click(await screen.findByRole("button", { name: /resume session/i }));

    expect(await screen.findByRole("heading", { name: /choose an action/i })).toBeInTheDocument();
    expect(window.location.hash).toBe(`#/room/${roomId}/player`);
    expect(screen.queryByRole("heading", { name: /pick your character/i })).not.toBeInTheDocument();
  });

  it("resumes a player who has not claimed yet at the picker", async () => {
    const user = userEvent.setup();
    const { roomCode, roomId } = await createSessionAsGm(user);
    await joinAsPlayer(user, roomCode); // on the picker, nothing claimed

    goTo("#/");
    await user.click(await screen.findByRole("button", { name: /resume session/i }));

    expect(
      await screen.findByRole("heading", { name: /pick your character/i }),
    ).toBeInTheDocument();
    expect(window.location.hash).toBe(`#/claim/${roomId}`);
    expect(screen.queryByText(/claim a character before opening/i)).not.toBeInTheDocument();
  });

  it("sends an unclaimed player who opens the dashboard route directly to the picker", async () => {
    const user = userEvent.setup();
    const { roomCode, roomId } = await createSessionAsGm(user);
    await joinAsPlayer(user, roomCode);

    goTo(`#/room/${roomId}/player`);

    expect(
      await screen.findByRole("heading", { name: /pick your character/i }),
    ).toBeInTheDocument();
    expect(window.location.hash).toBe(`#/claim/${roomId}`);
  });

  it("still resumes the GM at the console and the table seat at the display", async () => {
    const user = userEvent.setup();
    const { roomId, gmOwnership } = await createSessionAsGm(user);

    goTo("#/");
    await user.click(await screen.findByRole("button", { name: /resume session/i }));
    expect(await screen.findByRole("heading", { name: /director console/i })).toBeInTheDocument();
    expect(window.location.hash).toBe(`#/room/${roomId}/gm`);

    writeOwnershipRecord({ ...readOwnershipRecord()!, ...gmOwnership, capability: "table" });
    goTo("#/");
    await user.click(await screen.findByRole("button", { name: /resume session/i }));
    expect(window.location.hash).toBe(`#/room/${roomId}/table`);
  });
});

describe("replaceRoute", () => {
  it("swaps the current history entry and notifies route listeners", () => {
    navigate("/first");
    const lengthBefore = window.history.length;
    let notified = 0;
    const onHashChange = (): void => {
      notified += 1;
    };
    window.addEventListener("hashchange", onHashChange);
    act(() => {
      replaceRoute("/second");
    });
    window.removeEventListener("hashchange", onHashChange);

    expect(window.location.hash).toBe("#/second");
    expect(window.history.length).toBe(lengthBefore);
    expect(notified).toBeGreaterThan(0);
  });
});
