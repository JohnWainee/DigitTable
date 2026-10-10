import { render, screen } from "@testing-library/react";
import { axe } from "jest-axe";
import { describe, expect, it } from "vitest";
import { asCommandId, asMemberId, type EventTailRecord } from "@digitable/contracts";
import type { EatTheReichEvent } from "@digitable/template-eat-the-reich";
import { SessionTimeline } from "../../src/shared/SessionTimeline.js";

const privateRecord: EventTailRecord<EatTheReichEvent> = {
  eventId: "private-1",
  commandId: asCommandId("11111111-1111-4111-8111-111111111111"),
  sequence: 2,
  roomRevision: 2,
  partition: "member" as const,
  payload: {
    type: "PrivateMessageSent",
    recipientMemberId: asMemberId("player-2"),
    text: "secret detail",
  },
};

describe("SessionTimeline", () => {
  it("keeps a private note out of the shared table history and announces it for the recipient", async () => {
    const { container, rerender } = render(
      <SessionTimeline records={[privateRecord]} capability="table" />,
    );
    expect(screen.queryByText(/secret detail/)).toBeNull();
    expect(await axe(container)).toHaveNoViolations();
    rerender(<SessionTimeline records={[privateRecord]} capability="player" />);
    expect(screen.getByText("Private note from GM: secret detail")).toBeInTheDocument();
    expect(screen.getByRole("list", { name: "Recent session events" })).toHaveAttribute(
      "tabindex",
      "0",
    );
    expect(await axe(container)).toHaveNoViolations();
    rerender(<SessionTimeline records={[privateRecord]} capability="gm" />);
    expect(screen.getByText("Private note sent: secret detail")).toBeInTheDocument();
  });

  it("renders a broadcast as plain text and preserves event order", () => {
    const records: readonly EventTailRecord<EatTheReichEvent>[] = [
      {
        ...privateRecord,
        sequence: 1,
        partition: "shared" as const,
        payload: { type: "BroadcastPosted" as const, text: "<script>no markup</script>" },
      },
      {
        ...privateRecord,
        sequence: 3,
        payload: {
          type: "PrivateMessageSent" as const,
          recipientMemberId: asMemberId("player-2"),
          text: "later",
        },
      },
    ];
    render(<SessionTimeline records={records} capability="gm" />);
    expect(screen.getByText("GM broadcast: <script>no markup</script>")).toBeInTheDocument();
    expect(screen.queryByRole("script")).toBeNull();
    expect(screen.getAllByRole("listitem").map((item) => item.textContent)).toEqual([
      "1GM broadcast: <script>no markup</script>",
      "3Private note sent: later",
    ]);
  });
});
