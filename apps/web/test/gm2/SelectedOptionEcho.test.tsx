import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "jest-axe";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ORIGINAL_MISSION, type SceneView } from "@digitable/template-eat-the-reich";
import { SceneDirector } from "../../src/gm2/SceneDirector.js";
import { SelectedOptionEcho } from "../../src/shared/SelectedOptionEcho.js";
import { createSessionAsGm, setViewport } from "../support/flows.js";

/**
 * A native `<select>` ellipsises its closed value to stay inside a phone column, which can cut off the
 * part of a label that distinguishes two options ("Threat: Station Pat…" for both Patrol A and B at
 * 320px). The option popup itself is owned by the browser/OS and cannot clip; what the page must do is
 * restore the context the closed control hides, by writing the chosen option out in full beside it.
 */

const noop = vi.fn();

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

function echoFor(selectId: string): HTMLElement | null {
  return document.querySelector<HTMLElement>(`[data-select-echo-for="${selectId}"]`);
}

describe("SelectedOptionEcho", () => {
  it("is decorative: the select already exposes its full value, so it is hidden from the accessibility tree", () => {
    render(<SelectedOptionEcho selectId="x">Threat: Station Patrol A</SelectedOptionEcho>);
    const echo = echoFor("x")!;
    expect(echo).toHaveAttribute("aria-hidden", "true");
    expect(echo).toHaveTextContent("Selected Threat: Station Patrol A");
  });
});

describe("scene director selects", () => {
  it("echoes the full title of the scene chosen in the scene select, and follows the selection", async () => {
    const user = userEvent.setup();
    render(
      <SceneDirector
        scene={sceneView(ORIGINAL_MISSION[0]!.sceneId)}
        objectives={[]}
        threats={[]}
        onLoadScene={noop}
        onNextScene={noop}
        onRevealThreat={noop}
        onEndRound={noop}
        onSetSceneRules={noop}
        onEditRating={noop}
      />,
    );
    // Defaults to the scene after the current one.
    expect(echoFor("scene-select")).toHaveTextContent(ORIGINAL_MISSION[1]!.title);
    await user.selectOptions(
      screen.getByRole("combobox", { name: "Scene" }),
      ORIGINAL_MISSION[2]!.sceneId,
    );
    expect(echoFor("scene-select")).toHaveTextContent(ORIGINAL_MISSION[2]!.title);
  });
});

describe("director console selects (live GM tools)", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    setViewport(320, 568);
    window.location.hash = "";
  });

  it("echoes the chosen edit target and the chosen advance in full, and has no axe violations", async () => {
    const user = userEvent.setup();
    await createSessionAsGm(user);
    await user.click(screen.getByRole("button", { name: /open the director console/i }));
    await screen.findByRole("heading", { name: /director console/i });
    await user.click(screen.getByRole("button", { name: /^load scene$/i }));
    await screen.findByRole("button", { name: /^end round 1$/i });

    // Nothing chosen yet: nothing to echo.
    expect(echoFor("edit-target")).toBeNull();
    const target = screen.getByRole<HTMLSelectElement>("combobox", { name: "Target" });
    const threat = [...target.options].find((o) => o.value.startsWith("threat:"))!;
    await user.selectOptions(target, threat.value);
    expect(echoFor("edit-target")).toHaveTextContent(threat.textContent);
    expect(echoFor("edit-target")!.textContent).toMatch(/Threat: /);

    // The kind prefix is what tells an Objective from a Threat of the same name.
    const objective = [...target.options].find((o) => o.value.startsWith("objective:"))!;
    await user.selectOptions(target, objective.value);
    expect(echoFor("edit-target")).toHaveTextContent(objective.textContent);
    expect(echoFor("edit-target")!.textContent).toMatch(/Objective: /);

    const advance = screen.getByRole<HTMLSelectElement>("combobox", { name: "Advance" });
    expect(echoFor("advance-select")).toHaveTextContent(advance.selectedOptions[0]!.textContent);
    expect(echoFor("advance-select")!.textContent).not.toMatch(/already unlocked/);

    // The status suffix is part of what the closed select hides, so the echo carries it too.
    await user.click(screen.getByRole("button", { name: /^unlock advance$/i }));
    expect(echoFor("advance-select")!.textContent).toMatch(/\(already unlocked\)/);
    expect(echoFor("advance-select")).toHaveTextContent(advance.selectedOptions[0]!.textContent);

    expect(await axe(document.body)).toHaveNoViolations();
  });
});
