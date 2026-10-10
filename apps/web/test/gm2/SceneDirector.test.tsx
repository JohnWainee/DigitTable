import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "jest-axe";
import { describe, expect, it, vi } from "vitest";
import type { SceneView } from "@digitable/template-eat-the-reich";
import { PUBLIC_SCENE_CATALOG } from "@digitable/template-eat-the-reich/public-scenes";
import { SceneDirector } from "../../src/gm2/SceneDirector.js";
import { fixtureEncounterCatalog } from "../../src/session/fixtureEncounterCatalog.js";

const noop = vi.fn();

function director(scene: SceneView | null): JSX.Element {
  return (
    <SceneDirector
      scene={scene}
      objectives={[]}
      threats={[]}
      catalog={fixtureEncounterCatalog()}
      catalogStatus="ready"
      onLoadScene={noop}
      onNextScene={noop}
      onRevealThreat={noop}
      onEndRound={noop}
      onSetSceneRules={noop}
      onEditRating={noop}
    />
  );
}

function chooseScene(id: string): void {
  const card = screen
    .getAllByRole("button", { name: /^Select scene/ })
    .find((button) => button.getAttribute("data-scene-id") === id);
  if (!card) throw new Error(`No scene card for ${id}`);
  fireEvent.click(card);
}

function selectedScene(): string {
  return (
    screen
      .getAllByRole("button", { name: /^Select scene/ })
      .find((button) => button.getAttribute("aria-pressed") === "true")
      ?.getAttribute("data-scene-id") ?? ""
  );
}

function sceneView(id: string): SceneView {
  const definition = PUBLIC_SCENE_CATALOG.find((s) => s.sceneId === id)!;
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

const ids = PUBLIC_SCENE_CATALOG.map((s) => s.sceneId);

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
    const cards = screen.getAllByRole("button", { name: /^Select scene/ });
    rerender(director(sceneView(ids[0]!)));
    expect(screen.getAllByRole("button", { name: /^Select scene/ })).toEqual(cards);
    expect(selectedScene()).toBe(ids[1]);
    rerender(director(sceneView(ids[1]!)));
    expect(selectedScene()).toBe(ids[2]);
  });

  it("keeps the GM's explicit pick while the scene is unchanged, and drops it once the scene changes", () => {
    const { rerender } = render(director(sceneView(ids[0]!)));
    chooseScene(ids[3]!);
    expect(selectedScene()).toBe(ids[3]);
    rerender(director(sceneView(ids[0]!)));
    expect(selectedScene()).toBe(ids[3]);
    rerender(director(sceneView(ids[1]!)));
    expect(selectedScene()).toBe(ids[2]);
  });

  it("renders the four factory scenes with their mapped original art and usable previews", () => {
    render(director(null));
    const cards = screen.getAllByRole("button", { name: /^Select scene/ });
    expect(cards).toHaveLength(4);
    for (const [index, definition] of PUBLIC_SCENE_CATALOG.entries()) {
      const card = cards[index]!;
      expect(card).toHaveAttribute("data-scene-id", definition.sceneId);
      expect(within(card).getByRole("img")).toHaveAttribute(
        "src",
        `/etr/${definition.sceneId}-640.webp`,
      );
      expect(within(card).getByText(definition.locationLabel)).toBeInTheDocument();
    }
    expect(screen.getByText(/GM briefing:/i).parentElement?.textContent).toContain(
      fixtureEncounterCatalog()[0]!.gmBriefing,
    );
    expect(screen.getByRole("heading", { name: "Objectives" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Threats" })).toBeInTheDocument();
  });

  it("keeps the active scene visibly selected and prevents loading it again", () => {
    const active = sceneView(ids[0]!);
    render(director(active));
    const current = screen.getByRole("button", {
      name: new RegExp(`Select scene 1: ${PUBLIC_SCENE_CATALOG[0]!.title}.*currently active`),
    });
    expect(current).toBeDisabled();
    expect(current).toHaveAttribute("aria-pressed", "false");
    expect(selectedScene()).toBe(ids[1]);
  });

  it("sends only a public scene ID through the command callback", () => {
    const onLoadScene = vi.fn();
    render(
      <SceneDirector
        scene={null}
        objectives={[]}
        threats={[]}
        catalog={fixtureEncounterCatalog()}
        catalogStatus="ready"
        onLoadScene={onLoadScene}
        onNextScene={noop}
        onRevealThreat={noop}
        onEndRound={noop}
        onSetSceneRules={noop}
        onEditRating={noop}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Load scene" }));
    expect(onLoadScene).toHaveBeenCalledExactlyOnceWith(PUBLIC_SCENE_CATALOG[0]!.sceneId);
    expect(JSON.stringify(onLoadScene.mock.calls)).not.toContain("gmBriefing");
    expect(JSON.stringify(onLoadScene.mock.calls)).not.toContain("Training opposition");
  });

  it("supports keyboard scene selection and has no axe violations in the library", async () => {
    const user = userEvent.setup();
    render(director(null));
    await user.tab();
    const firstCard = screen.getAllByRole("button", { name: /^Select scene/ })[0]!;
    expect(firstCard).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(firstCard).toHaveAttribute("aria-pressed", "true");
    expect(await axe(document.body)).toHaveNoViolations();
  });
});
