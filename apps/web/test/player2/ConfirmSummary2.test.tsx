import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { CharacterFullSheet, EatTheReichEvent } from "@digitable/template-eat-the-reich";
import { ConfirmSummary2 } from "../../src/player2/ConfirmSummary2.js";

type ActionResolved = Extract<EatTheReichEvent, { type: "ActionResolved" }>;

// Only `items` and `injuries` are read, and only for deltas/marks these cases do not use.
const character = { items: [], injuries: [] } as unknown as CharacterFullSheet;

const resolved = (overrides: Partial<ActionResolved>): ActionResolved => ({
  type: "ActionResolved",
  rollId: "roll-1",
  characterId: "rook",
  allocations: [],
  objectiveDeltas: [],
  threatDeltas: [],
  bloodDelta: 0,
  itemRestoreDeltas: [],
  injuryClearedCount: 0,
  remainingAttackSuccessesAfterAllocation: 2,
  attackBumpThreatId: null,
  injuryMark: null,
  injuryChoicePendingMode: null,
  ...overrides,
});

const renderSummary = (event: ActionResolved): void => {
  render(
    <ConfirmSummary2
      resolved={event}
      character={character}
      objectives={[]}
      threats={[]}
      attackSuccessesRolled={2}
      onContinue={() => undefined}
    />,
  );
};

describe("ConfirmSummary2 unresolved opposition", () => {
  it("reports attack successes that got through when no injury choice is pending", () => {
    renderSummary(resolved({}));
    expect(screen.getByText(/2 attack success\(es\) got through/)).toBeTruthy();
  });

  it("does not call successes unresolved while the injury choice that resolves them is pending", () => {
    renderSummary(resolved({ injuryChoicePendingMode: "single" }));
    expect(screen.queryByText(/got through/)).toBeNull();
    expect(screen.queryByText("Unresolved opposition")).toBeNull();
  });
});
