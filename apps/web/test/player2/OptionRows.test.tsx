import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  ORIGINAL_ROSTER,
  type CharacterFullSheet,
  type EatTheReichView,
} from "@digitable/template-eat-the-reich";
import type { ViewerProjection } from "@digitable/contracts";
import { ComposeStep2 } from "../../src/player2/ComposeStep2.js";

/**
 * The compose step is the richest set of check/radio rows (stat, items, abilities, bonus claims, threats).
 * Each row's text sits in one `.option-text` span so the stylesheet can drop a label under its box when its
 * longest word cannot sit beside it (large text on a 320-375px phone). Wrapping must not change what the
 * control is called: the accessible name stays exactly the row's text, for every character in the roster.
 */
function projectionFor(character: CharacterFullSheet): ViewerProjection<EatTheReichView> {
  return {
    view: { self: character, rolls: [], objectives: [], threats: [], scene: null },
  } as unknown as ViewerProjection<EatTheReichView>;
}

describe("Compose option rows keep their accessible names", () => {
  for (const entry of ORIGINAL_ROSTER) {
    const character = entry as unknown as CharacterFullSheet;
    it(`${character.name}: every row is one control plus one .option-text that names it`, () => {
      const { container } = render(
        <ComposeStep2
          projection={projectionFor(character)}
          character={character}
          threats={[]}
          onDeclare={vi.fn()}
          onUseUtilityItem={vi.fn()}
        />,
      );
      const rows = [...container.querySelectorAll<HTMLElement>("label.gear-option")];
      expect(rows.length).toBeGreaterThan(5);
      for (const row of rows) {
        const spans = row.querySelectorAll(".option-text");
        expect(spans, row.textContent ?? "").toHaveLength(1);
        const text = spans[0]!.textContent.replace(/\s+/g, " ").trim();
        expect(text.length).toBeGreaterThan(0);
        // Nothing but the control, an optional icon and the one span: no stray text outside the span.
        expect(row.textContent.replace(/\s+/g, " ").trim()).toBe(text);
        const control = row.querySelector<HTMLInputElement>("input")!;
        expect(["checkbox", "radio"]).toContain(control.type);
        expect(control).toHaveAccessibleName(text);
      }
    });
  }
});
