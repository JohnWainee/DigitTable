import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SceneArt } from "../../src/shared/SceneArt.js";
import { PortraitImage } from "../../src/shared/PortraitImage.js";
import { ThreatToken } from "../../src/shared/ThreatToken.js";
import { HeroArt } from "../../src/shared/HeroArt.js";
import { SceneCard } from "../../src/player2/SceneCard.js";
import { LandingScreen } from "../../src/landing/LandingScreen.js";

/**
 * C04 (docs/ETR_ART_BRIEF.md section 5): every image slot's CSS fallback
 * is the default until the image loads, and every `<img>` carries real alt
 * text (or is decorative with a labelled parent). jsdom never fires a real
 * network load, so these components staying in their "loading" state here
 * is exactly the "default until load" behavior the brief asks for, not a
 * test limitation.
 */
describe("art fallbacks (C04)", () => {
  it("SceneArt shows a decorative fallback (no title text — SceneCard's own <h2> carries that) and gives the image real alt text", () => {
    const { container } = render(<SceneArt sceneId="drop-forecourt" title="Test Forecourt" />);
    const fallback = container.querySelector(".scene-card-art-fallback")!;
    expect(fallback).toBeInTheDocument();
    expect(fallback.textContent).toBe("");
    expect(screen.queryByText("Test Forecourt")).not.toBeInTheDocument();
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

describe("large-display and hero art fallbacks", () => {
  it("the banner variant tries the large derivative, then the 640 card image, then the CSS fallback", () => {
    const { container } = render(
      <SceneArt sceneId="metro-platform" title="Metro" variant="banner" />,
    );
    let img = container.querySelector("img")!;
    expect(img.getAttribute("src")).toBe("/etr/scene-metro-platform-1024.webp");
    expect(img.getAttribute("srcset")).toContain("scene-metro-platform-1536.webp 1536w");

    fireEvent.error(img);
    img = container.querySelector("img")!;
    expect(img.getAttribute("src")).toBe("/etr/metro-platform-640.webp");

    fireEvent.error(img);
    expect(container.querySelector("img")).not.toBeInTheDocument();
    expect(container.querySelector(".scene-card-art-fallback")).toBeInTheDocument();
  });

  it("the hero shows real alt text with responsive candidates and keeps the fallback if it never loads", () => {
    const { container } = render(<HeroArt />);
    const img = container.querySelector("img")!;
    expect(img.alt.length).toBeGreaterThan(10);
    expect(img.getAttribute("srcset")).toContain("hero-1600.webp 1600w");
    expect(container.querySelector(".hero-art-fallback")).toBeInTheDocument();
    fireEvent.error(img);
    expect(container.querySelector("img")).not.toBeInTheDocument();
    expect(container.querySelector(".hero-art-fallback")).toBeInTheDocument();
  });

  it("SceneArt starts over when the same instance is reused for another scene", () => {
    const { container, rerender } = render(<SceneArt sceneId="printworks" title="A" />);
    fireEvent.error(container.querySelector("img")!);
    expect(container.querySelector("img")).not.toBeInTheDocument();
    rerender(<SceneArt sceneId="signal-mast" title="B" />);
    expect(container.querySelector("img")!.getAttribute("src")).toBe("/etr/signal-mast-640.webp");
  });

  it("SceneCard passes the banner variant through to its art (shared table display)", () => {
    const scene = {
      id: "printworks",
      title: "Printworks",
      locationLabel: "Print hall",
      round: 1,
      actedThisRound: [],
      reinforcementsMode: "book" as const,
      status: "active" as const,
    };
    const { container } = render(
      <SceneCard scene={scene} objectives={[]} threats={[]} artVariant="banner" />,
    );
    expect(container.querySelector(".scene-card-art--banner img")!.getAttribute("src")).toBe(
      "/etr/scene-printworks-1024.webp",
    );
  });

  it("the landing screen renders the hero art", () => {
    const { container } = render(<LandingScreen />);
    expect(container.querySelector(".landing-hero .hero-art img")).toBeInTheDocument();
  });
});
