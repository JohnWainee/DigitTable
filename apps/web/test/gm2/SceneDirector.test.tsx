import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ORIGINAL_MISSION, type SceneView } from "@digitable/template-eat-the-reich";
import { SceneDirector } from "../../src/gm2/SceneDirector.js";

const noop = vi.fn();

function director(scene: SceneView | null): JSX.Element {
  return (
    <SceneDirector
      scene={scene}
      objectives={[]}
      threats={[]}
      onLoadScene={noop}
      onNextScene={noop}
      onRevealThreat={noop}
      onEndRound={noop}
      onSetSceneRules={noop}
      onEditRating={noop}
    />
  );
}

function selectedScene(): string {
  return screen.getByRole<HTMLSelectElement>("combobox", { name: "Scene" }).value;
}

function sceneView(id: string): SceneView {
  const definition = ORIGINAL_MISSION.find((s) => s.sceneId === id)!;
  return {
    id,
    title: definition.title,
    locationLabel: definition.locationLabel,
    round: 1,
    actedThisRound: [],
    reinforcementsMode: "book",
    status: "active",
  };
}

const ids = ORIGINAL_MISSION.map((s) => s.sceneId);

describe("SceneDirector default scene selection", () => {
  it("offers the opening scene when none is loaded", () => {
    render(director(null));
    expect(selectedScene()).toBe(ids[0]);
  });

  it("defaults 'Advance scene' to the scene after the current one, never the current scene", () => {
    render(director(sceneView(ids[0]!)));
    expect(selectedScene()).toBe(ids[1]);
  });

  it("wraps to another scene from the final scene instead of reloading it", () => {
    const last = ids[ids.length - 1]!;
    render(director(sceneView(last)));
    expect(selectedScene()).toBe(ids[0]);
    expect(selectedScene()).not.toBe(last);
  });

  it("re-defaults when the loaded scene changes, without remounting", () => {
    const { rerender } = render(director(null));
    expect(selectedScene()).toBe(ids[0]);
    const select = screen.getByRole("combobox", { name: "Scene" });
    rerender(director(sceneView(ids[0]!)));
    expect(screen.getByRole("combobox", { name: "Scene" })).toBe(select);
    expect(selectedScene()).toBe(ids[1]);
    rerender(director(sceneView(ids[1]!)));
    expect(selectedScene()).toBe(ids[2]);
  });

  it("keeps the GM's explicit pick while the scene is unchanged, and drops it once the scene changes", () => {
    const { rerender } = render(director(sceneView(ids[0]!)));
    fireEvent.change(screen.getByRole("combobox", { name: "Scene" }), {
      target: { value: ids[3] },
    });
    expect(selectedScene()).toBe(ids[3]);
    rerender(director(sceneView(ids[0]!)));
    expect(selectedScene()).toBe(ids[3]);
    rerender(director(sceneView(ids[1]!)));
    expect(selectedScene()).toBe(ids[2]);
  });
});

describe("SceneDirector scene picker context", () => {
  it("prints the full title of the picked scene beside the ellipsising select and follows the pick", () => {
    render(director(null));
    const echo = screen.getByTestId("select-echo");
    expect(echo).toHaveTextContent(ORIGINAL_MISSION[0]!.title);
    // The echo duplicates what the select announces, so it is hidden from assistive technology.
    expect(echo).toHaveAttribute("aria-hidden", "true");
    const picker = screen.getByRole<HTMLSelectElement>("combobox", { name: "Scene" });
    fireEvent.change(picker, { target: { value: ids[2]! } });
    expect(screen.getByTestId("select-echo")).toHaveTextContent(ORIGINAL_MISSION[2]!.title);
  });
});
