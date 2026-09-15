import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SceneArt } from "../../src/shared/SceneArt.js";
import { PortraitImage } from "../../src/shared/PortraitImage.js";
import { ThreatToken } from "../../src/shared/ThreatToken.js";

/**
 * C04 (docs/ETR_ART_BRIEF.md section 5): every image slot's CSS fallback
 * is the default until the image loads, and every `<img>` carries real alt
 * text (or is decorative with a labelled parent). jsdom never fires a real
 * network load, so these components staying in their "loading" state here
 * is exactly the "default until load" behavior the brief asks for, not a
 * test limitation.
 */
describe("art fallbacks (C04)", () => {
  it("SceneArt shows its text fallback and gives the image real alt text", () => {
    const { container } = render(<SceneArt sceneId="drop-forecourt" title="Test Forecourt" />);
    expect(screen.getByText("Test Forecourt")).toBeInTheDocument();
    const img = container.querySelector("img")!;
    expect(img.alt.length).toBeGreaterThan(10);
    expect(img.getAttribute("src")).toBe("/etr/drop-forecourt-640.webp");
  });

  it("SceneArt falls back to the location name as alt text for an unknown scene id", () => {
    const { container } = render(<SceneArt sceneId="not-a-real-scene" title="Mystery Place" />);
    const img = container.querySelector("img")!;
    expect(img.alt).toBe("Mystery Place");
  });

  it("PortraitImage shows initials and stays decorative (parent aria-hidden, empty img alt)", () => {
    const { container } = render(<PortraitImage characterId="rook" name="Rook" />);
    expect(screen.getByText("R")).toBeInTheDocument();
    const wrapper = container.firstElementChild!;
    expect(wrapper.getAttribute("aria-hidden")).toBe("true");
    const img = container.querySelector("img")!;
    expect(img.alt).toBe("");
    expect(img.getAttribute("src")).toBe("/etr/rook-token-128.webp");
  });

  it("PortraitImage uses the larger card derivative when size='card'", () => {
    const { container } = render(
      <PortraitImage characterId="vesper" name="Vesper Caul" size="card" />,
    );
    const img = container.querySelector("img")!;
    expect(img.getAttribute("src")).toBe("/etr/vesper-512.webp");
  });

  it("ThreatToken renders the glyph fallback for a threat with no generated art yet", () => {
    const { container } = render(<ThreatToken threatId="threat-nonexistent" />);
    expect(container.querySelector("svg use")?.getAttribute("href")).toBe("#etr-icon-threat");
    expect(container.querySelector("img")).not.toBeInTheDocument();
  });

  it("ThreatToken attempts the real image for a manifest id and marks beaten threats", () => {
    const { container } = render(<ThreatToken threatId="threat-enforcer" beaten />);
    const img = container.querySelector("img")!;
    expect(img.getAttribute("src")).toBe("/etr/threat-enforcer-128.webp");
    expect(container.querySelector(".threat-token--beaten")).toBeInTheDocument();
  });
});
