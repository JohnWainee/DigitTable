import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "jest-axe";
import { beforeEach, describe, expect, it } from "vitest";
import { asRoomId } from "@digitable/contracts";
import { writeOwnershipRecord, type LocalOwnershipRecord } from "../../src/session/ownership.js";
import { expectNavigableHeadingOutline } from "../accessibility/headingOutline.js";
import {
  claimRook,
  createSessionAsGm,
  goTo,
  joinAsPlayer,
  renderApp,
  setViewport,
} from "../support/flows.js";

/**
 * Review F6 (second half): a signed-out visitor to `/room/<id>/gm` saw only
 * "You can't do that from this seat." The guidance must say what the page is
 * and where to go, using only what the visitor's own browser already knows
 * (their own ownership record) — never anything read from the room, so an
 * unauthorized visitor learns nothing about whether the room exists.
 */
const OTHER_ROOM: LocalOwnershipRecord = {
  roomId: asRoomId("other-room"),
  roomCode: "OTHER1",
  memberId: "member-other",
  capability: "gm",
  recoveryCode: null,
  displayName: "Elsewhere GM",
  sessionName: "Another Session",
};

describe("GM console for a visitor without the GM seat (F6)", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    setViewport(375, 812);
    window.location.hash = "";
  });

  it("explains what the page is and offers ways forward to a visitor with no seat at all", async () => {
    const user = userEvent.setup();
    renderApp("#/room/secret-room-id/gm");

    expect(
      screen.getByRole("heading", { level: 1, name: /director console/i }),
    ).toBeInTheDocument();
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent(/only for the gm/i);
    expect(alert).toHaveTextContent(/browser where you created the session/i);
    expect(alert).not.toHaveTextContent(/secret-room-id/);
    expect(alert).not.toHaveTextContent(/can't do that from this seat/i);

    expect(screen.getByRole("button", { name: /join a session/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /back to start/i })).toBeInTheDocument();
    expectNavigableHeadingOutline();
    expect(await axe(document.body)).toHaveNoViolations();

    await user.click(screen.getByRole("button", { name: /join a session/i }));
    expect(window.location.hash).toBe("#/join");
  });

  it("treats a seat in a different room exactly like no seat", () => {
    writeOwnershipRecord(OTHER_ROOM);
    renderApp("#/room/secret-room-id/gm");

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent(/only for the gm/i);
    expect(alert).not.toHaveTextContent(/other-room|Another Session|Elsewhere GM/);
    expect(screen.queryByRole("button", { name: /your dashboard/i })).not.toBeInTheDocument();
  });

  it("tells a player of this room the console is GM-only and links to their own dashboard", async () => {
    const user = userEvent.setup();
    const { roomCode, roomId } = await createSessionAsGm(user);
    await joinAsPlayer(user, roomCode);
    await claimRook(user);

    goTo(`#/room/${roomId}/gm`);

    expect(screen.getByRole("alert")).toHaveTextContent(/you have a player seat/i);
    await user.click(screen.getByRole("button", { name: /go to your dashboard/i }));
    expect(window.location.hash).toBe(`#/room/${roomId}/player`);
  });

  it("points the table seat back to the table display", async () => {
    const user = userEvent.setup();
    const { roomId, gmOwnership } = await createSessionAsGm(user);
    writeOwnershipRecord({ ...gmOwnership, capability: "table" });

    goTo(`#/room/${roomId}/gm`);

    expect(screen.getByRole("alert")).toHaveTextContent(/table display/i);
    await user.click(screen.getByRole("button", { name: /open the table display/i }));
    expect(window.location.hash).toBe(`#/room/${roomId}/table`);
  });
});
