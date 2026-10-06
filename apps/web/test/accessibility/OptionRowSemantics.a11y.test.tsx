import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "jest-axe";
import { describe, expect, it, vi } from "vitest";
import type { ViewerProjection } from "@digitable/contracts";
import {
  ORIGINAL_ROSTER,
  type CharacterFullSheet,
  type EatTheReichView,
} from "@digitable/template-eat-the-reich";
import { ComposeStep2 } from "../../src/player2/ComposeStep2.js";

const here = dirname(fileURLToPath(import.meta.url));

/**
 * An option row that carries its own action ("Mark and regain Blood") used to render the button
 * inside the checkbox's `<label>`: a nested interactive control (axe `nested-interactive`), whose
 * text also leaked into the checkbox's accessible name. The button is now a sibling of the label.
 */
const BLOOD_ITEM_ID = "rook-pocket-mirror";
const BLOOD_ACTION_NAME = "Mark and regain Blood";

function characterWithUsableBloodItem(): CharacterFullSheet {
  const rook = ORIGINAL_ROSTER.find((c) => c.id === "rook")!;
  return {
    ...rook,
    items: rook.items.map((i) => (i.id === BLOOD_ITEM_ID ? { ...i, usesRemaining: 1 } : i)),
  } as unknown as CharacterFullSheet;
}

function renderCompose(onUse = vi.fn()): { onUse: ReturnType<typeof vi.fn> } {
  const character = characterWithUsableBloodItem();
  const projection = {
    view: { self: character, scene: null },
  } as unknown as ViewerProjection<EatTheReichView>;
  render(
    <ComposeStep2
      projection={projection}
      character={character}
      threats={[]}
      onDeclare={() => undefined}
      onUseUtilityItem={onUse}
    />,
  );
  return { onUse };
}

describe("option row with its own action", () => {
  it("renders the action as a sibling of the label, never inside it", () => {
    renderCompose();
    const button = screen.getByRole("button", { name: BLOOD_ACTION_NAME });
    expect(button.closest("label")).toBeNull();
    const row = button.parentElement!;
    expect(row.classList.contains("gear-option--row")).toBe(true);
    const label = row.querySelector(":scope > label")!;
    expect(label.querySelector("button, a[href], select, textarea, summary")).toBeNull();
  });

  it("keeps the checkbox's accessible name free of the action's text", () => {
    renderCompose();
    const box = screen.getByRole("checkbox", { name: /Cigarettes/ });
    expect(box.getAttribute("aria-label") ?? "").not.toMatch(/Mark and regain/);
    expect(screen.queryByRole("checkbox", { name: /Mark and regain Blood/ })).toBeNull();
  });

  it("has no axe violations (nested-interactive included)", async () => {
    renderCompose();
    expect(
      await axe(document.body, { rules: { "nested-interactive": { enabled: true } } }),
    ).toHaveNoViolations();
  });

  it("the action fires without toggling its unavailable checkbox", async () => {
    const user = userEvent.setup();
    const { onUse } = renderCompose();
    const row = screen.getByRole("button", { name: BLOOD_ACTION_NAME }).parentElement!;
    const box = within(row).getByRole("checkbox");
    // The real utility item is unavailable for pool selection, but its independent action still works.
    expect(box).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Mark and regain Blood" }));
    expect(onUse).toHaveBeenCalledTimes(1);
    expect(onUse).toHaveBeenCalledWith(BLOOD_ITEM_ID);
    expect(box).not.toBeChecked();
  });

  it("is reachable by keyboard: Tab lands on the button and Enter activates it", async () => {
    const user = userEvent.setup();
    const { onUse } = renderCompose();
    const button = screen.getByRole("button", { name: BLOOD_ACTION_NAME });
    for (let i = 0; i < 30 && document.activeElement !== button; i += 1) await user.tab();
    expect(button).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(onUse).toHaveBeenCalledTimes(1);
  });
});

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? sourceFiles(full) : /\.tsx$/.test(name) ? [full] : [];
  });
}

describe("no interactive control is written inside a <label>", () => {
  it("scans every component for a button/select/link/summary between <label> and </label>", () => {
    const offenders: string[] = [];
    for (const file of sourceFiles(join(here, "../../src"))) {
      // Comments may mention `<label>`; only markup counts.
      const source = readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
      for (const match of source.matchAll(/<label\b[^>]*>([\s\S]*?)<\/label>/g)) {
        if (/<(button|select|textarea|a|summary)\b/.test(match[1] ?? "")) offenders.push(file);
      }
    }
    expect(offenders).toEqual([]);
  });
});
