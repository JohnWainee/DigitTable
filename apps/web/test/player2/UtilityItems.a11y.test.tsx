import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "jest-axe";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { asMemberId } from "@digitable/contracts";
import type { ViewerProjection } from "@digitable/contracts";
import {
  ORIGINAL_ROSTER,
  type CharacterFullSheet,
  type EatTheReichView,
} from "@digitable/template-eat-the-reich";
import { ComposeStep2 } from "../../src/player2/ComposeStep2.js";
import { ChooseInjuryPanel2 } from "../../src/player2/ChooseInjuryPanel2.js";
import {
  claimRook,
  createSessionAsGm,
  joinAsPlayer,
  loadOpeningSceneAsGm,
  setViewport,
} from "../support/flows.js";

/**
 * Utility equipment (a Cigarettes item that is marked for Blood, a Cowboy hat destroyed to ignore
 * an injury) is not a pool die. Its rows once rendered a permanently disabled checkbox with the
 * action button nested inside the `<label>`; the class-less button fell through every reskin rule
 * (browser-grey, 61x89 px and wrapped over four lines at 375 px). These tests pin the structure:
 * the browser-geometry side is gated by `scripts/playtest/ui-audit.mjs`.
 */
describe("utility equipment rows", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    setViewport(375, 812);
    window.location.hash = "";
  });

  it("puts the Cigarettes action in its own styled button, outside any label, with no dead checkbox", async () => {
    const user = userEvent.setup();
    const { roomId, roomCode, gmOwnership } = await createSessionAsGm(user);
    await loadOpeningSceneAsGm(roomId, asMemberId(gmOwnership.memberId));
    await joinAsPlayer(user, roomCode);
    await claimRook(user);
    await user.click(screen.getByRole("button", { name: /continue to your dashboard/i }));
    await screen.findByRole("heading", { name: /choose an action/i });

    const mark = screen.getByRole("button", { name: /^mark and regain blood$/i });
    expect(mark.closest("label")).toBeNull();
    expect(mark).toHaveClass("secondary-action");
    expect(mark).toHaveAccessibleDescription(/cigarettes.*3\/3 uses.*regain 2 blood/i);

    // Not a pool die: no checkbox at all, while a real pool item keeps its enabled one.
    expect(screen.queryByRole("checkbox", { name: /cigarettes/i })).toBeNull();
    expect(screen.getByRole("checkbox", { name: /exquisite hunting rifle/i })).toBeEnabled();

    expect(await axe(document.body)).toHaveNoViolations();

    // The restructure keeps the action working: one use is marked and 2 Blood is regained.
    await user.click(mark);
    expect(await screen.findByText(/\(2\/3 uses\)/i)).toBeInTheDocument();
    expect(await screen.findByText(/blood 2\/10/i)).toBeInTheDocument();
  });
});

describe("Cowboy hat action in the injury panel", () => {
  it("is a tap-sized styled button that hands the hat's id to the caller", async () => {
    const user = userEvent.setup();
    const chuck = ORIGINAL_ROSTER.find((c) => c.id === "orsolya");
    if (!chuck) throw new Error("expected Chuck in the roster");
    const onUseHat = vi.fn();
    render(
      <ChooseInjuryPanel2
        character={chuck as unknown as CharacterFullSheet}
        mode="single"
        preferredCategoryId={chuck.injuries[0]?.id}
        onChoose={() => undefined}
        onUseHat={onUseHat}
      />,
    );

    const hat = screen.getByRole("button", { name: /destroy cowboy hat/i });
    expect(hat).toHaveClass("secondary-action");
    expect(hat.closest("label")).toBeNull();
    expect(await axe(document.body)).toHaveNoViolations();

    await user.click(hat);
    expect(onUseHat).toHaveBeenCalledWith("orsolya-draft-horse");
  });
});

describe("compose item rows, rendered directly", () => {
  const sheetOf = (id: string): CharacterFullSheet => {
    const state = ORIGINAL_ROSTER.find((c) => c.id === id);
    if (!state) throw new Error(`expected ${id} in the roster`);
    return state as unknown as CharacterFullSheet;
  };
  // ComposeStep2 reads only `view.scene` directly; explainPool tolerates an empty room.
  const projection = {
    view: { scene: null },
  } as unknown as ViewerProjection<EatTheReichView>;
  const renderCompose = (character: CharacterFullSheet, onUse = vi.fn()): typeof onUse => {
    render(
      <ComposeStep2
        projection={projection}
        character={character}
        threats={[]}
        onDeclare={() => undefined}
        onUseUtilityItem={onUse}
      />,
    );
    return onUse;
  };

  it("shows the Cowboy hat as text with no checkbox and no action (it is used from the injury step)", () => {
    renderCompose(sheetOf("orsolya"));
    expect(
      screen.getByText(/cowboy hat \(1\/1 uses\).*ignore an injury or being downed/i),
    ).toBeVisible();
    expect(screen.queryByRole("checkbox", { name: /cowboy hat/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /mark and regain blood/i })).toBeNull();
    // Real pool items are unaffected.
    expect(screen.getByRole("checkbox", { name: /paired revolvers/i })).toBeEnabled();
  });

  it("offers no action once the Cigarettes are spent", () => {
    const iryna = sheetOf("rook");
    const spent = {
      ...iryna,
      items: iryna.items.map((item) =>
        item.useEffect?.kind === "gainBlood" ? { ...item, usesRemaining: 0 } : item,
      ),
    };
    renderCompose(spent);
    expect(screen.getByText(/cigarettes.*\(0\/3 uses\) — no uses left/i)).toBeVisible();
    expect(screen.queryByRole("button", { name: /mark and regain blood/i })).toBeNull();
  });

  it("keeps a pool die's checkbox when the item also has a mark-for-effect action", async () => {
    const user = userEvent.setup();
    const iryna = sheetOf("rook");
    const both = {
      ...iryna,
      items: iryna.items.map((item) =>
        item.useEffect?.kind === "gainBlood" ? { ...item, poolEligible: true } : item,
      ),
    };
    const onUse = renderCompose(both);
    const box = screen.getByRole("checkbox", { name: /cigarettes/i });
    expect(box).toBeEnabled();
    const mark = screen.getByRole("button", { name: /^mark and regain blood$/i });
    expect(mark.closest("label")).toBeNull();
    expect(mark).toHaveAccessibleDescription(/cigarettes.*regain 2 blood/i);
    await user.click(mark);
    expect(onUse).toHaveBeenCalledWith("rook-pocket-mirror");
    expect(box).not.toBeChecked();
  });
});
