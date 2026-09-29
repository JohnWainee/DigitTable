import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SheetDialog } from "../../src/shared/SheetDialog.js";
import { isTightSheet } from "../../src/shared/useTightSheetFit.js";

/**
 * The fit decision is a pure function of four heights, so its thresholds are proved here exactly; the
 * numbers below are the measurements from a real Chrome (`scripts/playtest/ui-audit.mjs`) of the GM
 * correction sheet. jsdom does no layout, so the DOM wiring is proved with stubbed geometry, and the
 * stylesheet half (`.sheet[data-tight]`) by `test/styles/reskinContract.test.ts`.
 */
describe("isTightSheet", () => {
  it("is loose when the pinned parts leave the body at least half the sheet", () => {
    // 375x812 with the keyboard open at 100% text: header 40 + footer 85 of a 439px sheet.
    expect(isTightSheet({ sheet: 439, header: 40, footer: 85, bodyContent: 1322 })).toBe(false);
    // Landscape phone without the keyboard: 367px sheet, header 48 + footer 66.
    expect(isTightSheet({ sheet: 367, header: 48, footer: 66, bodyContent: 1298 })).toBe(false);
  });

  it("is tight when header + action row would take more than half of a short or large-text sheet", () => {
    // Landscape phone with the keyboard open: 198px sheet, header 48 + footer 66 left a 56px body.
    expect(isTightSheet({ sheet: 198, header: 48, footer: 66, bodyContent: 1298 })).toBe(true);
    // 320px phone, 200% text, keyboard open: header 124 + footer 125 of a 296px sheet.
    expect(isTightSheet({ sheet: 296, header: 124, footer: 125, bodyContent: 4182 })).toBe(true);
  });

  it("is exactly half the sheet at the boundary: loose at 50%, tight just below", () => {
    expect(isTightSheet({ sheet: 200, header: 50, footer: 50, bodyContent: 900 })).toBe(false);
    expect(isTightSheet({ sheet: 200, header: 51, footer: 50, bodyContent: 900 })).toBe(true);
  });

  it("never squeezes a sheet whose content fits, however large its chrome", () => {
    expect(isTightSheet({ sheet: 200, header: 90, footer: 90, bodyContent: 20 })).toBe(false);
  });
});

describe("useTightSheetFit wiring", () => {
  const sizes = { sheet: 200, header: 50, footer: 60, body: 900 };
  let measurements = 0;

  function define(target: object, prop: string, get: (el: HTMLElement) => number): void {
    Object.defineProperty(target, prop, {
      configurable: true,
      get(this: HTMLElement) {
        return get(this);
      },
    });
  }

  beforeEach(() => {
    measurements = 0;
    define(HTMLElement.prototype, "clientHeight", (el) => {
      if (!el.classList.contains("sheet")) return 0;
      measurements += 1;
      return sizes.sheet;
    });
    define(HTMLElement.prototype, "offsetHeight", (el) =>
      el.classList.contains("sheet-header")
        ? sizes.header
        : el.classList.contains("sheet-footer")
          ? sizes.footer
          : 0,
    );
    define(HTMLElement.prototype, "scrollHeight", (el) =>
      el.classList.contains("sheet-body") ? sizes.body : 0,
    );
  });

  afterEach(() => {
    for (const prop of ["clientHeight", "offsetHeight", "scrollHeight"]) {
      Reflect.deleteProperty(HTMLElement.prototype, prop);
    }
    vi.unstubAllGlobals();
    Reflect.deleteProperty(window, "visualViewport");
    document.documentElement.classList.remove("sheet-open");
  });

  function open(): HTMLElement {
    render(
      <SheetDialog titleId="fit-title" title="Fit" onClose={() => {}} footer={<button>Go</button>}>
        <p>body</p>
      </SheetDialog>,
    );
    return screen.getByRole("dialog");
  }

  it("marks a squeezed sheet tight and publishes the pinned row's height for scroll-padding", () => {
    sizes.sheet = 200; // 50 + 60 leaves 90 of 200 (< half)
    const dialog = open();
    expect(dialog).toHaveAttribute("data-tight");
    expect(dialog.style.getPropertyValue("--sheet-footer-h")).toBe("60px");
  });

  it("leaves a roomy sheet untouched", () => {
    sizes.sheet = 600;
    expect(open()).not.toHaveAttribute("data-tight");
  });

  it("re-measures on window resize (rotation, keyboard) and follows the result both ways", () => {
    sizes.sheet = 600;
    const dialog = open();
    expect(dialog).not.toHaveAttribute("data-tight");

    sizes.sheet = 200;
    act(() => {
      window.dispatchEvent(new Event("resize"));
    });
    expect(dialog).toHaveAttribute("data-tight");

    sizes.sheet = 600;
    act(() => {
      window.dispatchEvent(new Event("resize"));
    });
    expect(dialog).not.toHaveAttribute("data-tight");
  });

  it("observes the sheet, header and action row (never the body) and disconnects on close", () => {
    const observed: string[] = [];
    const disconnect = vi.fn();
    class FakeResizeObserver {
      observe(element: Element): void {
        observed.push(element.className);
      }
      disconnect = disconnect;
    }
    vi.stubGlobal("ResizeObserver", FakeResizeObserver);
    sizes.sheet = 600;
    const { unmount } = render(
      <SheetDialog titleId="ro-title" title="RO" onClose={() => {}} footer={null}>
        <p>x</p>
      </SheetDialog>,
    );
    expect(observed).toEqual(["sheet", "sheet-header", "sheet-footer"]);
    unmount();
    expect(disconnect).toHaveBeenCalled();
  });
  it("re-measures when the ResizeObserver reports a size change (text scale, late fonts)", () => {
    let notify: () => void = () => {};
    class CapturingResizeObserver {
      constructor(callback: () => void) {
        notify = callback;
      }
      observe(): void {}
      disconnect(): void {}
    }
    vi.stubGlobal("ResizeObserver", CapturingResizeObserver);
    sizes.sheet = 600;
    const dialog = open();
    expect(dialog).not.toHaveAttribute("data-tight");

    sizes.header = 250; // e.g. the title wrapped at a larger text size
    act(() => notify());
    expect(dialog).toHaveAttribute("data-tight");
    sizes.header = 50;
  });

  it("follows the visual viewport (iOS keyboard resizes it, not the layout viewport)", () => {
    const visual = new EventTarget();
    Object.defineProperty(window, "visualViewport", { configurable: true, value: visual });
    sizes.sheet = 600;
    const dialog = open();
    expect(dialog).not.toHaveAttribute("data-tight");

    sizes.sheet = 200;
    act(() => {
      visual.dispatchEvent(new Event("resize"));
    });
    expect(dialog).toHaveAttribute("data-tight");
  });

  it("stops listening when the sheet closes (no measurement after unmount)", () => {
    const visual = new EventTarget();
    Object.defineProperty(window, "visualViewport", { configurable: true, value: visual });
    sizes.sheet = 600;
    const { unmount } = render(
      <SheetDialog titleId="gone-title" title="Gone" onClose={() => {}} footer={null}>
        <p>x</p>
      </SheetDialog>,
    );
    unmount();
    const before = measurements;
    window.dispatchEvent(new Event("resize"));
    visual.dispatchEvent(new Event("resize"));
    expect(measurements).toBe(before);
  });
});
