import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { asMemberId, asRoomId, type ViewerProjection } from "@digitable/contracts";
import {
  eatTheReichTemplate,
  ORIGINAL_ROSTER,
  type CharacterFullSheet,
  type EatTheReichView,
} from "@digitable/template-eat-the-reich";
import { ComposeStep2 } from "../../src/player2/ComposeStep2.js";

/**
 * Red-team regression (2026-10-01): the marked-use item's "Mark and regain Blood" action used to be a
 * child of the item's checkbox `<label>`. That is invalid HTML (interactive content inside a label),
 * folded the button's text into the checkbox's accessible name, and, as a flex item squeezed beside the
 * label text, pushed the page 16px (375px) to 57px (320px) wider than the viewport at 200% text. The
 * action now sits beside the label; `.gear-item-action` (styles.css) lets it wrap and fit.
 */
const ROOM_ID = asRoomId("room-1");
const MEMBER_ID = asMemberId("member-1");

function renderCompose(onUseUtilityItem: (itemId: string) => void): CharacterFullSheet {
  const state = eatTheReichTemplate.initialState({
    roomId: ROOM_ID,
    gmMemberId: asMemberId("member-gm"),
    memberIds: [],
  });
  const view = eatTheReichTemplate.project(state, {
    roomId: ROOM_ID,
    viewerId: MEMBER_ID,
    capability: "player",
  });
  const projection = { view } as unknown as ViewerProjection<EatTheReichView>;
  const character = ORIGINAL_ROSTER.find((c) =>
    c.items.some((i) => i.useEffect?.kind === "gainBlood"),
  ) as unknown as CharacterFullSheet;
  render(
    <ComposeStep2
      projection={projection}
      character={character}
      threats={[]}
      onDeclare={vi.fn()}
      onUseUtilityItem={onUseUtilityItem}
    />,
  );
  return character;
}

describe("ComposeStep2 marked-use item action", () => {
  it("renders the action as a sibling of the item label, never inside it", async () => {
    const onUse = vi.fn();
    const character = renderCompose(onUse);
    const item = character.items.find((i) => i.useEffect?.kind === "gainBlood")!;
    const button = screen.getByRole("button", { name: "Mark and regain Blood" });

    expect(button.closest("label")).toBeNull();
    // The checkbox's accessible name is the item text only, not the action's text.
    const checkbox = screen.getByRole("checkbox", { name: new RegExp(item.name) });
    expect(checkbox).toHaveAccessibleName(expect.not.stringContaining("Mark and regain Blood"));
    // And it sits in the same item row as that label, so the layout can keep them together.
    expect(button.parentElement).toBe(checkbox.closest("label")?.parentElement);

    await userEvent.click(button);
    expect(onUse).toHaveBeenCalledWith(item.id);
  });
});
