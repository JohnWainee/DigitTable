import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { asMemberId } from "@digitable/contracts";
import type * as RoomClientModule from "../../src/session/roomClient.js";

// The fixture store always mints a fresh seat for a player, so the "this identity already holds the
// seat" reply (no recovery code to show) only exists on the live path. Stub the client at that seam.
vi.mock("../../src/session/roomClient.js", async (importOriginal) => ({
  ...(await importOriginal<typeof RoomClientModule>()),
  joinRoom: vi.fn(() =>
    Promise.resolve({
      ok: true,
      roomId: "room-1",
      roomCode: "ABCD-2345",
      memberId: asMemberId("member-1"),
      capability: "player",
      recoveryCode: null,
      roomRevision: 3,
    }),
  ),
}));

import { JoinScreen } from "../../src/landing/JoinScreen.js";

describe("JoinScreen, replayed join (no secret to show)", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.location.hash = "";
  });

  it("focuses Continue once the submitted form is replaced", async () => {
    const user = userEvent.setup();
    render(<JoinScreen />);
    await user.type(screen.getByLabelText(/room code/i), "ABCD-2345");
    await user.type(screen.getByLabelText(/^passphrase$/i), "wolfbane");
    await user.type(screen.getByLabelText(/your display name/i), "Ada");
    await user.click(screen.getByRole("button", { name: /^join session$/i }));

    expect(await screen.findByText(/welcome back/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^continue$/i })).toHaveFocus();
  });
});
