import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ORIGINAL_ROSTER, type CharacterFullSheet } from "@digitable/template-eat-the-reich";
import { GmToolsPanel } from "../../src/gm2/GmToolsPanel.js";

const sheets = ORIGINAL_ROSTER as unknown as readonly CharacterFullSheet[];
const withAdvances = sheets.filter((c) => c.advances.length > 0);
const [first, second] = withAdvances as [CharacterFullSheet, CharacterFullSheet];

function renderPanel(onUnlockAdvance = vi.fn(), onReassignCharacter = vi.fn()): void {
  render(
    <GmToolsPanel
      gmSheets={sheets}
      rolls={[]}
      onVoidRoll={vi.fn()}
      onGrantItem={vi.fn()}
      onUnlockAdvance={onUnlockAdvance}
      onReassignCharacter={onReassignCharacter}
    />,
  );
}

function trigger(id: string): HTMLElement {
  return document.getElementById(id)!;
}

function choose(id: string, optionText: string): void {
  fireEvent.click(trigger(id));
  fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: optionText }));
}

describe("GmToolsPanel pickers", () => {
  it("defaults each character picker to the first character", () => {
    renderPanel();
    for (const id of ["grant-character", "advance-character", "reassign-character"]) {
      expect(trigger(id).dataset.value).toBe(sheets[0]!.id);
    }
  });

  it("re-points the advance picker at the new character's first advance when the character changes", () => {
    renderPanel();
    choose("advance-character", second.name);
    expect(trigger("advance-character").dataset.value).toBe(second.id);
    expect(trigger("advance-select").dataset.value).toBe(second.advances[0]!.id);
  });

  it("keeps the chosen advance when the same character is re-chosen", () => {
    renderPanel();
    const target = first.advances[1]!;
    expect(target).toBeDefined();
    choose("advance-select", target.label);
    expect(trigger("advance-select").dataset.value).toBe(target.id);
    choose("advance-character", first.name);
    expect(trigger("advance-select").dataset.value).toBe(target.id);
  });

  it("submits the picked character and advance", () => {
    const onUnlockAdvance = vi.fn();
    renderPanel(onUnlockAdvance);
    choose("advance-character", second.name);
    fireEvent.click(screen.getByRole("button", { name: "Unlock advance" }));
    expect(onUnlockAdvance).toHaveBeenCalledWith(second.id, second.advances[0]!.id, null);
  });

  it("submits the picked character when reassigning", () => {
    const onReassign = vi.fn();
    renderPanel(vi.fn(), onReassign);
    choose("reassign-character", second.name);
    fireEvent.click(screen.getByRole("button", { name: /^Reassign/ }));
    expect(onReassign).toHaveBeenCalledWith(second.id, null, null);
  });
});
