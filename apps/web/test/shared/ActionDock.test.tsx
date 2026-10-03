import { render, screen } from "@testing-library/react";
import { axe } from "jest-axe";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ActionDock } from "../../src/shared/ActionDock.js";

/**
 * The sticky commit row (apps/web/src/shared/ActionDock.tsx). Sticking, safe-area padding, the height
 * cap and the short-viewport fallback are CSS, pinned by `test/styles/reskinContract.test.ts` and
 * measured in a real browser by `ui-audit.mjs`'s dock audit. Proved here: the accessibility contract
 * (a disabled button is explained by visible text) and the `--action-dock-height` publication that
 * keeps keyboard-focused controls clear of the bar.
 */

type ResizeCallback = () => void;

/** A controllable ResizeObserver: jsdom has none, and the dock reads a laid-out height. */
function installResizeObserver(heights: Map<Element, number>): {
  readonly fire: () => void;
  readonly restore: () => void;
} {
  const observers = new Set<{ callback: ResizeCallback; targets: Set<Element> }>();
  class FakeObserver {
    private readonly record = {
      callback: null as unknown as ResizeCallback,
      targets: new Set<Element>(),
    };
    constructor(callback: ResizeCallback) {
      this.record.callback = callback;
      observers.add(this.record);
    }
    observe(target: Element): void {
      this.record.targets.add(target);
      target.getBoundingClientRect = () => ({ height: heights.get(target) ?? 0 }) as DOMRect;
    }
    disconnect(): void {
      observers.delete(this.record);
    }
    unobserve(): void {}
  }
  const original = globalThis.ResizeObserver;
  vi.stubGlobal("ResizeObserver", FakeObserver);
  return {
    fire: () => {
      for (const { callback } of observers) callback();
    },
    restore: () => {
      vi.unstubAllGlobals();
      if (original) globalThis.ResizeObserver = original;
    },
  };
}

afterEach(() => {
  document.documentElement.style.removeProperty("--action-dock-height");
});

describe("ActionDock", () => {
  it("shows its status as visible text and as the primary button's description", () => {
    render(
      <ActionDock statusId="dock-status" status="2 of 3 dice still need a target.">
        <button type="button" className="primary-action" aria-describedby="dock-status" disabled>
          Confirm allocation
        </button>
      </ActionDock>,
    );
    expect(screen.getByText("2 of 3 dice still need a target.")).toBeVisible();
    const button = screen.getByRole("button", { name: "Confirm allocation" });
    expect(button).toBeDisabled();
    expect(button).toHaveAccessibleDescription("2 of 3 dice still need a target.");
  });

  it("has no axe violations with one action or two", async () => {
    const { container } = render(
      <ActionDock
        statusId="dock-status"
        status={
          <>
            Pool: <strong>4</strong> dice
          </>
        }
      >
        <button type="button" className="primary-action" aria-describedby="dock-status">
          Declare action
        </button>
        <button type="button" className="secondary-action">
          Destroy Cowboy hat to ignore this result
        </button>
      </ActionDock>,
    );
    expect(await axe(container)).toHaveNoViolations();
  });

  it("publishes its height for scroll-padding, follows the tallest of several docks, and cleans up", () => {
    const heights = new Map<Element, number>();
    const observer = installResizeObserver(heights);
    try {
      const { container, unmount } = render(
        <>
          <ActionDock statusId="a-status" status="A">
            <button type="button">A</button>
          </ActionDock>
          <ActionDock statusId="b-status" status="B">
            <button type="button">B</button>
          </ActionDock>
        </>,
      );
      const [a, b] = Array.from(container.querySelectorAll(".action-dock"));
      heights.set(a!, 96.2);
      heights.set(b!, 120.4);
      observer.fire();
      // Rounded up, and the tallest wins.
      expect(document.documentElement.style.getPropertyValue("--action-dock-height")).toBe("121px");
      heights.set(b!, 80);
      observer.fire();
      expect(document.documentElement.style.getPropertyValue("--action-dock-height")).toBe("97px");
      unmount();
      expect(document.documentElement.style.getPropertyValue("--action-dock-height")).toBe("");
    } finally {
      observer.restore();
    }
  });

  it("marks itself data-clipped only while its content overflows the height cap, and watches its content", () => {
    const heights = new Map<Element, number>();
    const observer = installResizeObserver(heights);
    try {
      const { container } = render(
        <ActionDock statusId="s" status="ok">
          <button type="button">Go</button>
        </ActionDock>,
      );
      const dock = container.querySelector<HTMLElement>(".action-dock")!;
      const measure = (scrollHeight: number, clientHeight: number): void => {
        Object.defineProperty(dock, "scrollHeight", { value: scrollHeight, configurable: true });
        Object.defineProperty(dock, "clientHeight", { value: clientHeight, configurable: true });
        observer.fire();
      };
      measure(120, 120);
      expect(dock).not.toHaveAttribute("data-clipped");
      measure(121, 120); // sub-pixel rounding is not overflow
      expect(dock).not.toHaveAttribute("data-clipped");
      measure(828, 256);
      expect(dock).toHaveAttribute("data-clipped");
      measure(200, 256);
      expect(dock).not.toHaveAttribute("data-clipped");
    } finally {
      observer.restore();
    }
  });

  it("renders without ResizeObserver (jsdom, very old engines) and sets nothing", () => {
    expect(typeof ResizeObserver).toBe("undefined");
    render(
      <ActionDock statusId="s" status="ok">
        <button type="button">Go</button>
      </ActionDock>,
    );
    expect(document.documentElement.style.getPropertyValue("--action-dock-height")).toBe("");
  });
});
