import { render, screen } from "@testing-library/react";
import { axe } from "jest-axe";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ActionDock,
  UNPIN_ABOVE_SCALE,
  UNPIN_BELOW_PX,
  shouldUnpinDock,
} from "../../src/shared/ActionDock.js";

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
  readonly observed: () => Element[];
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
    observed: () => Array.from(observers).flatMap(({ targets }) => Array.from(targets)),
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
      // Content growth does not resize a capped dock, so the status and the actions are watched too.
      expect(observer.observed()).toEqual(
        expect.arrayContaining([
          dock,
          dock.querySelector(".action-dock-status"),
          dock.querySelector(".action-dock-actions"),
        ]),
      );
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

describe("shouldUnpinDock", () => {
  const base = { scale: 1, visualHeight: 800, layoutHeight: 800 };

  it("keeps the dock pinned at normal zoom with a tall visible area", () => {
    expect(shouldUnpinDock(base)).toBe(false);
  });

  it("unpins once pinch-zoomed past rounding noise, not before", () => {
    expect(shouldUnpinDock({ ...base, scale: UNPIN_ABOVE_SCALE })).toBe(false);
    expect(shouldUnpinDock({ ...base, scale: 1.06 })).toBe(true);
    expect(shouldUnpinDock({ ...base, scale: 3 })).toBe(true);
  });

  it("unpins when the visible height (the smaller of visual and layout) is at or under 240px (the 15rem media query's basis, inclusive like it)", () => {
    const limit = UNPIN_BELOW_PX;
    expect(limit).toBe(240);
    expect(shouldUnpinDock({ ...base, visualHeight: limit + 1 })).toBe(false);
    expect(shouldUnpinDock({ ...base, visualHeight: limit })).toBe(true);
    expect(shouldUnpinDock({ ...base, layoutHeight: limit })).toBe(true);
    expect(shouldUnpinDock({ ...base, visualHeight: limit - 1 })).toBe(true);
    // iOS keyboard: only the visual viewport shrinks. Chrome Android: both do.
    expect(shouldUnpinDock({ ...base, visualHeight: 200 })).toBe(true);
    expect(shouldUnpinDock({ ...base, layoutHeight: 200 })).toBe(true);
  });

  it("stays pinned in a landscape phone with the browser bars showing (iPhone 17 Pro in Mobile Safari: 292px visible)", () => {
    // Measured in the iOS Simulator: a tab bar plus address bar leave 292px (innerHeight reads 402 once scrolling
    // collapses them, but clientHeight and the media query stay 292). At the old 320px line the dock was released
    // and Declare sat at the end of a 2,400px form.
    expect(shouldUnpinDock({ ...base, visualHeight: 292, layoutHeight: 292 })).toBe(false);
    expect(shouldUnpinDock({ ...base, visualHeight: 250, layoutHeight: 250 })).toBe(false);
  });

  it("does not depend on text size: a 568px phone at 200% text stays pinned (the capped, scrolling dock)", () => {
    expect(shouldUnpinDock({ ...base, visualHeight: 568, layoutHeight: 568 })).toBe(false);
  });
});

describe("ActionDock pinning follows the visual viewport", () => {
  type Listener = () => void;
  function installVisualViewport(initial: { scale: number; height: number }): {
    readonly set: (next: { scale?: number; height?: number }) => void;
    readonly listeners: () => number;
    readonly types: () => string[];
    readonly restore: () => void;
  } {
    const listeners = new Set<Listener>();
    const registered: string[] = [];
    const viewport = {
      scale: initial.scale,
      height: initial.height,
      addEventListener: (type: string, listener: Listener) => {
        registered.push(type);
        listeners.add(listener);
      },
      removeEventListener: (_type: string, listener: Listener) => listeners.delete(listener),
    };
    Object.defineProperty(window, "visualViewport", { value: viewport, configurable: true });
    const innerHeight = Object.getOwnPropertyDescriptor(window, "innerHeight");
    Object.defineProperty(window, "innerHeight", { value: 800, configurable: true });
    return {
      types: () => registered,
      set: (next) => {
        Object.assign(viewport, next);
        for (const listener of listeners) listener();
      },
      listeners: () => listeners.size,
      restore: () => {
        Reflect.deleteProperty(window, "visualViewport");
        if (innerHeight) Object.defineProperty(window, "innerHeight", innerHeight);
      },
    };
  }

  it("toggles data-unpinned on zoom and on a short visible area, and detaches on unmount", () => {
    const vv = installVisualViewport({ scale: 1, height: 800 });
    try {
      const { container, unmount } = render(
        <ActionDock statusId="s" status="ok">
          <button type="button">Go</button>
        </ActionDock>,
      );
      const dock = container.querySelector<HTMLElement>(".action-dock")!;
      expect(dock).not.toHaveAttribute("data-unpinned");
      vv.set({ scale: 2 });
      expect(dock).toHaveAttribute("data-unpinned");
      vv.set({ scale: 1 });
      expect(dock).not.toHaveAttribute("data-unpinned");
      vv.set({ height: 200 }); // keyboard took the rest (landscape: ios-simulator/README.md measured 70-140px)
      expect(dock).toHaveAttribute("data-unpinned");
      vv.set({ height: 800 });
      expect(dock).not.toHaveAttribute("data-unpinned");
      expect(vv.listeners()).toBe(1);
      // Zoom (pinch) and keyboard both fire `resize`; `scroll` is only panning and must not matter.
      expect(vv.types()).toEqual(["resize"]);
      unmount();
      expect(vv.listeners()).toBe(0);
    } finally {
      vv.restore();
    }
  });

  it("starts unpinned when mounted already zoomed", () => {
    const vv = installVisualViewport({ scale: 2.5, height: 800 });
    try {
      const { container } = render(
        <ActionDock statusId="s" status="ok">
          <button type="button">Go</button>
        </ActionDock>,
      );
      expect(container.querySelector(".action-dock")).toHaveAttribute("data-unpinned");
    } finally {
      vv.restore();
    }
  });
});
