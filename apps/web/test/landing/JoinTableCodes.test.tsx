import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { asMemberId } from "@digitable/contracts";
import type * as RoomClientModule from "../../src/session/roomClient.js";

// The fixture store upper-cases both codes itself, so only a stubbed client shows what the screen
// actually sends: the live server compares them exactly.
const joinRoom = vi.hoisted(() => vi.fn());
vi.mock("../../src/session/roomClient.js", async (importOriginal) => ({
  ...(await importOriginal<typeof RoomClientModule>()),
  joinRoom,
}));

import { JoinTableScreen } from "../../src/landing/JoinTableScreen.js";

describe("JoinTableScreen, what is sent", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.location.hash = "";
    joinRoom.mockReset();
    joinRoom.mockResolvedValue({
      ok: true,
      roomId: "room-1",
      roomCode: "ABCD-2345",
      memberId: asMemberId("member-1"),
      capability: "table",
      recoveryCode: null,
      roomRevision: 1,
    });
  });

  it("sends the room and table codes upper-cased with no whitespace", async () => {
    const user = userEvent.setup();
    render(<JoinTableScreen />);
    await user.type(screen.getByLabelText(/^room code$/i), "abcd-2345 ");
    await user.type(screen.getByLabelText(/^table code$/i), "abcde fghjkmnp");
    await user.click(screen.getByRole("button", { name: /connect display/i }));

    expect(await screen.findByRole("button", { name: /open the table display/i })).toBeVisible();
    expect(joinRoom).toHaveBeenCalledWith(
      expect.objectContaining({
        roomCode: "ABCD-2345",
        passphrase: "ABCDEFGHJKMNP",
        requestedCapability: "table",
      }),
    );
  });
});
