import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LiveRegion } from "../../src/accessibility/LiveRegion.js";
import {
  ConnectionStatusStrip,
  type ConnectionState,
} from "../../src/shell/ConnectionStatusStrip.js";

describe("status and live-region semantics", () => {
  it.each(["polite", "assertive"] as const)(
    "LiveRegion announces its message as a %s status",
    (politeness) => {
      render(<LiveRegion politeness={politeness} message="Dice rolled." />);
      const region = screen.getByRole("status");
      expect(region).toHaveTextContent("Dice rolled.");
      expect(region).toHaveAttribute("aria-live", politeness);
    },
  );

  it.each(["connecting", "live", "reconnecting", "signed-out"] as ConnectionState[])(
    "ConnectionStatusStrip announces the %s state politely",
    (state) => {
      render(<ConnectionStatusStrip state={state} />);
      const strip = screen.getByRole("status");
      expect(strip).toHaveAttribute("aria-live", "polite");
      expect(strip.textContent?.trim().length ?? 0).toBeGreaterThan(0);
    },
  );
});
