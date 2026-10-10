import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "jest-axe";
import { describe, expect, it, vi } from "vitest";
import type { EatTheReichView } from "@digitable/template-eat-the-reich";
import { GmCommunications } from "../../src/gm2/GmCommunications.js";

const roster = [
  { id: "rook", name: "Rook", claimedByMemberId: "member-player-one" },
  { id: "vesper", name: "Vesper", claimedByMemberId: "member-player-two" },
  { id: "unclaimed", name: "Unclaimed", claimedByMemberId: null },
] as unknown as EatTheReichView["roster"];

describe("GM session communications", () => {
  it("uses the accessible mobile sheet recipient picker and sends only after an explicit player choice", async () => {
    const user = userEvent.setup();
    const onPrivateMessage = vi.fn().mockResolvedValue(true);
    const { container } = render(
      <GmCommunications
        roster={roster}
        onBroadcast={vi.fn().mockResolvedValue(true)}
        onPrivateMessage={onPrivateMessage}
      />,
    );
    expect(await axe(container)).toHaveNoViolations();
    await user.click(screen.getByRole("button", { name: /Private note recipient/ }));
    const dialog = screen.getByRole("dialog", { name: "Private note recipient" });
    expect(await axe(document.body)).toHaveNoViolations();
    expect(within(dialog).getByText(/Current:/)).toHaveTextContent("Choose a player");
    expect(within(dialog).queryByRole("button", { name: "Unclaimed" })).toBeNull();
    await user.click(within(dialog).getByRole("button", { name: "Vesper" }));
    await user.type(screen.getByLabelText("Private note"), "Only Vesper should see this");
    await user.click(screen.getByRole("button", { name: "Send private note" }));
    expect(onPrivateMessage).toHaveBeenCalledWith(
      "member-player-two",
      "Only Vesper should see this",
    );
    expect(screen.getByRole("status")).toHaveTextContent("Private note sent to that player.");
    expect(screen.getByLabelText("Private note")).toHaveValue("");
  });

  it("does not clear a draft when the command is rejected and enforces 500-character input bounds", async () => {
    const user = userEvent.setup();
    const onBroadcast = vi.fn().mockResolvedValue(false);
    render(
      <GmCommunications roster={roster} onBroadcast={onBroadcast} onPrivateMessage={vi.fn()} />,
    );
    const box = screen.getByLabelText("Broadcast to everyone");
    fireEvent.change(box, { target: { value: "Keep this draft" } });
    expect(box).toHaveAttribute("maxLength", "500");
    await user.click(screen.getByRole("button", { name: "Send broadcast" }));
    expect(onBroadcast).toHaveBeenCalledWith("Keep this draft");
    expect(box).toHaveValue("Keep this draft");
  });
});
