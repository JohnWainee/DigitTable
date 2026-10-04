import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import {
  ORIGINAL_ROSTER,
  type CharacterFullSheet,
  type EatTheReichView,
} from "@digitable/template-eat-the-reich";
import type { ViewerProjection } from "@digitable/contracts";
import { ComposeStep2 } from "../../src/player2/ComposeStep2.js";

/**
 * The compose step is the richest set of check/radio rows (stat, items, abilities, bonus claims, engaged
 * threats). Each row's text sits in one `.option-text` span so the stylesheet can drop a label under its box
 * when its longest word cannot sit beside it (large text on a 320-375px phone). Wrapping must not change what
 * the control is called: the accessible name stays exactly the row's text, for every character in the roster
 * and for every kind of row, including the ones that only appear after a claim or with an active threat.
 */
function projectionFor(character: CharacterFullSheet): ViewerProjection<EatTheReichView> {
  return {
    view: { self: character, rolls: [], objectives: [], threats: [], scene: null },
  } as unknown as ViewerProjection<EatTheReichView>;
}

const THREATS = [
  { id: "threat-1", name: "Plated Squad", status: "active" },
  { id: "threat-2", name: "Marksman Nest (flanking)", status: "active" },
] as unknown as EatTheReichView["threats"];

describe("Compose option rows keep their accessible names", () => {
  it("every row, for every character, is one control plus one .option-text that names it", async () => {
    const legends = new Set<string>();
    let apostrophe = false;
    const user = userEvent.setup();

    for (const entry of ORIGINAL_ROSTER) {
      const character = entry as unknown as CharacterFullSheet;
      const { container, unmount } = render(
        <ComposeStep2
          projection={projectionFor(character)}
          character={character}
          threats={THREATS}
          onDeclare={vi.fn()}
          onUseUtilityItem={vi.fn()}
        />,
      );
      // Claim everything claimable, so the "Bonus claims" rows (which only exist after a claim) render too.
      for (const checkbox of screen.getAllByRole("checkbox")) {
        if (!(checkbox as HTMLInputElement).disabled) await user.click(checkbox);
      }

      const rows = [...container.querySelectorAll<HTMLElement>("label.gear-option")];
      expect(rows.length, character.name).toBeGreaterThan(5);
      for (const row of rows) {
        const where = `${character.name}: ${row.textContent}`;
        const spans = row.querySelectorAll(".option-text");
        expect(spans, where).toHaveLength(1);
        const text = spans[0]!.textContent.replace(/\s+/g, " ").trim();
        expect(text.length, where).toBeGreaterThan(0);
        // Nothing but the control, an optional icon and the one span: no stray text outside the span.
        expect(row.textContent.replace(/\s+/g, " ").trim(), where).toBe(text);
        const control = row.querySelector<HTMLInputElement>("input")!;
        expect(["checkbox", "radio"], where).toContain(control.type);
        // The control comes first; neither it nor a stat's icon is inside the text span, so the icon stays
        // beside the box when the text drops under it.
        expect(row.firstElementChild, where).toBe(control);
        expect(spans[0]!.querySelector("input"), where).toBeNull();
        expect(spans[0]!.querySelector("svg"), where).toBeNull();
        expect(control, where).toHaveAccessibleName(text);
        if (text.includes("\u2019")) apostrophe = true;
      }
      for (const legend of container.querySelectorAll("legend")) {
        if (legend.closest("fieldset")?.querySelector("label.gear-option")) {
          legends.add(legend.textContent);
        }
      }
      unmount();
    }

    // Not vacuous: stat, items, abilities, bonus claims and engaged threats were all rendered somewhere.
    for (const legend of ["Stat", "Items", "Abilities", "Bonus claims", "Engaged threats"]) {
      expect([...legends], legend).toContain(legend);
    }
    // The bonus-claim sentence carries typographic apostrophes (&rsquo;): they must survive the wrapping.
    expect(apostrophe).toBe(true);
  });

  it("puts a stat's icon beside its box, ahead of the text span", () => {
    const character = ORIGINAL_ROSTER[0] as unknown as CharacterFullSheet;
    const { container } = render(
      <ComposeStep2
        projection={projectionFor(character)}
        character={character}
        threats={[]}
        onDeclare={vi.fn()}
        onUseUtilityItem={vi.fn()}
      />,
    );
    const statRows = [
      ...container.querySelectorAll<HTMLElement>("fieldset:first-of-type label.gear-option"),
    ];
    const withIcon = statRows.filter((row) => row.querySelector(":scope > svg"));
    expect(withIcon.length).toBeGreaterThanOrEqual(6);
    for (const row of withIcon) {
      const children = [...row.children].map((child) => child.tagName.toLowerCase());
      expect(children).toEqual(["input", "svg", "span"]);
    }
  });
});
