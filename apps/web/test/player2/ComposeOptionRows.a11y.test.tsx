import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "jest-axe";
import { describe, expect, it, vi } from "vitest";
import {
  ORIGINAL_ROSTER,
  type CharacterFullSheet,
  type EatTheReichView,
} from "@digitable/template-eat-the-reich";
import type { ViewerProjection } from "@digitable/contracts";
import { ComposeStep2 } from "../../src/player2/ComposeStep2.js";

/**
 * Option rows that carry their own action. The "Mark and regain Blood" button used to live INSIDE
 * the item's checkbox `<label>`: invalid markup (a labelable element in a label), the checkbox's
 * accessible name swallowed the button's text, and as a flex item of the label the button was
 * squeezed to a 48px sliver on a phone. jsdom does no layout (geometry is proved in a real browser
 * by `scripts/playtest/ui-audit.mjs`); this pins the structure that makes the geometry possible.
 */

const IRYNA = ORIGINAL_ROSTER.find((c) => c.id === "rook")!;
const UTILITY_ITEM = IRYNA.items.find((i) => i.id === "rook-pocket-mirror")!;
const PLAIN_ITEM = IRYNA.items.find((i) => i.id === "rook-forged-papers")!;

function renderCompose(
  character: CharacterFullSheet = IRYNA as unknown as CharacterFullSheet,
  onUseUtilityItem: (itemId: string) => void = () => undefined,
): { readonly container: HTMLElement } {
  const projection = {
    view: { self: character, scene: null },
  } as unknown as ViewerProjection<EatTheReichView>;
  return render(
    <ComposeStep2
      projection={projection}
      character={character}
      threats={[]}
      onDeclare={() => undefined}
      onUseUtilityItem={onUseUtilityItem}
    />,
  );
}

const cigarettesRow = (): HTMLElement =>
  screen.getByRole("checkbox", { name: /^Cigarettes/ }).closest<HTMLElement>(".gear-option--row")!;

describe("ComposeStep2 option rows with an action", () => {
  it("keeps the action out of the checkbox's accessible name", () => {
    renderCompose();
    const checkbox = screen.getByRole<HTMLInputElement>("checkbox", { name: /^Cigarettes/ });
    const name = checkbox.labels?.[0]?.textContent ?? "";
    expect(name).toContain(UTILITY_ITEM.name);
    expect(name).toContain("mark to regain 2 Blood");
    expect(name).not.toContain("Mark and regain Blood");
  });

  it("makes the action a sibling of the checkbox label, never a descendant of any label", () => {
    renderCompose();
    const button = screen.getByRole("button", { name: "Mark and regain Blood" });
    expect(button.closest("label")).toBeNull();
    const row = cigarettesRow();
    expect(row.contains(button)).toBe(true);
    expect(button.parentElement).toBe(row);
    expect(within(row).getByRole("checkbox", { name: /^Cigarettes/ })).toBeTruthy();
  });

  it("runs the action on a click without touching the (not pool-eligible) checkbox", async () => {
    const onUse = vi.fn();
    renderCompose(undefined, onUse);
    // The point of the sibling layout: the action works although the item itself is not selectable.
    expect(UTILITY_ITEM.poolEligible).toBe(false);
    expect(screen.getByRole<HTMLInputElement>("checkbox", { name: /^Cigarettes/ }).disabled).toBe(
      true,
    );
    await userEvent.click(screen.getByRole("button", { name: "Mark and regain Blood" }));
    expect(onUse).toHaveBeenCalledExactlyOnceWith(UTILITY_ITEM.id);
    expect(screen.getByRole<HTMLInputElement>("checkbox", { name: /^Cigarettes/ }).checked).toBe(
      false,
    );
  });

  it("still toggles an ordinary item by clicking its label text", async () => {
    renderCompose();
    const checkbox = screen.getByRole<HTMLInputElement>("checkbox", {
      name: new RegExp(`^${PLAIN_ITEM.name}`),
    });
    expect(checkbox.checked).toBe(false);
    await userEvent.click(screen.getByText(new RegExp(`^${PLAIN_ITEM.name}`)));
    expect(checkbox.checked).toBe(true);
  });

  it("offers no action on a spent utility item, and the row stays a valid label + checkbox", () => {
    const spent = {
      ...IRYNA,
      items: IRYNA.items.map((i) => (i.id === UTILITY_ITEM.id ? { ...i, usesRemaining: 0 } : i)),
    } as unknown as CharacterFullSheet;
    renderCompose(spent);
    expect(screen.queryByRole("button", { name: "Mark and regain Blood" })).toBeNull();
    expect(screen.getByRole<HTMLInputElement>("checkbox", { name: /^Cigarettes/ }).disabled).toBe(
      true,
    );
  });

  it("has no axe violations", async () => {
    const { container } = renderCompose();
    expect(await axe(container)).toHaveNoViolations();
  });
});
