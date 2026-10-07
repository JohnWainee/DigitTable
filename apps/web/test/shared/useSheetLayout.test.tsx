import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SheetDialog } from "../../src/shared/SheetDialog.js";
import {
  chooseSheetLayout,
  FLIP_BACK_MARGIN_PX,
  MIN_BODY_REM,
  type SheetSpace,
} from "../../src/shared/useSheetLayout.js";

/**
 * The bottom sheet pins its header and action row only while they and a usable slice of body fit in
 * what is visible; otherwise the whole sheet scrolls as one page (`.sheet[data-layout]` in
 * `styles.css`). jsdom does no layout, so the measured sizes are injected through the size getters;
 * the real geometry at every phone size, text size and keyboard height is proved in a browser by
 * `scripts/playtest/ui-audit.mjs` (the `sheet-layout-*` scenarios).
 */

describe("chooseSheetLayout", () => {
  const space = (available: number): SheetSpace => ({ available, chrome: 200, minBody: 112 });

  it("pins exactly when the chrome and the minimum body fit", () => {
    expect(chooseSheetLayout(null, space(312))).toBe("pinned"); // 200 + 112 === 312
    expect(chooseSheetLayout(null, space(311))).toBe("page");
    expect(chooseSheetLayout(null, space(900))).toBe("pinned");
  });

  it("goes to page at once, but only returns to pinned once the room is clearly back (no flapping)", () => {
    expect(chooseSheetLayout("pinned", space(311))).toBe("page");
    // Fits again by a hair: stays a page until the margin is cleared.
    expect(chooseSheetLayout("page", space(312))).toBe("page");
    expect(chooseSheetLayout("page", space(312 + FLIP_BACK_MARGIN_PX - 1))).toBe("page");
    expect(chooseSheetLayout("page", space(312 + FLIP_BACK_MARGIN_PX))).toBe("pinned");
    // The margin never delays going to page.
    expect(chooseSheetLayout("pinned", space(312))).toBe("pinned");
  });

  it("asks for 7rem of body", () => {
    expect(MIN_BODY_REM).toBe(7);
  });
});

interface Sizes {
  /** Content-box height the sheet may use (the backdrop's clientHeight; its paddings read as 0 here). */
  backdrop: number;
  header: number;
  /** Natural height of the action row (scrollHeight). */
  footerNatural: number;
  /** Rendered height of the action row (offsetHeight); less than natural when it is capped. */
  footerBox: number;
  /** The action row's own border: offsetHeight minus clientHeight (default 0). */
  footerBorder?: number;
}

let sizes: Sizes;

function installSizes(next: Sizes): void {
  sizes = next;
  vi.spyOn(Element.prototype, "clientHeight", "get").mockImplementation(function (this: Element) {
    if (this.classList.contains("sheet-backdrop")) return sizes.backdrop;
    if (this.classList.contains("sheet-footer")) return sizes.footerBox - (sizes.footerBorder ?? 0);
    return 0;
  });
  vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockImplementation(function (
    this: HTMLElement,
  ) {
    if (this.classList.contains("sheet-header")) return sizes.header;
    if (this.classList.contains("sheet-footer")) return sizes.footerBox;
    return 0;
  });
  vi.spyOn(Element.prototype, "scrollHeight", "get").mockImplementation(function (this: Element) {
    if (this.classList.contains("sheet-footer")) return sizes.footerNatural;
    return 0;
  });
}

class FakeResizeObserver {
  static instances: FakeResizeObserver[] = [];
  observed: Element[] = [];
  disconnected = false;
  constructor(private readonly callback: ResizeObserverCallback) {
    FakeResizeObserver.instances.push(this);
  }
  observe(target: Element): void {
    this.observed.push(target);
  }
  unobserve(): void {}
  disconnect(): void {
    this.disconnected = true;
  }
  fire(): void {
    this.callback([], this);
  }
}

function fireResize(): void {
  act(() => {
    for (const observer of FakeResizeObserver.instances) observer.fire();
  });
}

function Sheet(): JSX.Element {
  return (
    <SheetDialog
      titleId="layout-title"
      title="Correct Rook"
      onClose={() => {}}
      footer={
        <div className="sheet-actions">
          <button type="button">Apply</button>
          <button type="button">Cancel</button>
        </div>
      }
    >
      <label htmlFor="layout-reason">Reason</label>
      <input id="layout-reason" type="text" />
    </SheetDialog>
  );
}

const layoutOf = (): string | undefined => screen.getByRole("dialog").dataset.layout;

describe("useSheetLayout (through SheetDialog)", () => {
  const scrollIntoView = vi.fn();

  beforeEach(() => {
    FakeResizeObserver.instances = [];
    vi.stubGlobal("ResizeObserver", FakeResizeObserver);
    scrollIntoView.mockReset();
    Object.defineProperty(Element.prototype, "scrollIntoView", {
      configurable: true,
      writable: true,
      value: scrollIntoView,
    });
    installSizes({ backdrop: 700, header: 80, footerNatural: 130, footerBox: 130 });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    Reflect.deleteProperty(Element.prototype, "scrollIntoView");
    Reflect.deleteProperty(window, "visualViewport");
    document.documentElement.style.removeProperty("font-size");
    document.documentElement.classList.remove("sheet-open");
  });

  it("pins the header and action row when they and the minimum body fit in what is visible", () => {
    render(<Sheet />);
    // 80 + 130 + 7 * 16 = 322 <= 700
    expect(layoutOf()).toBe("pinned");
  });

  it("becomes one scrolling page when they do not fit (large text, small phone, keyboard)", () => {
    installSizes({ backdrop: 300, header: 80, footerNatural: 130, footerBox: 130 });
    render(<Sheet />);
    expect(layoutOf()).toBe("page"); // 322 > 300
  });

  it("measures the action row's NATURAL height, not the capped box a scroller squeezed it into", () => {
    // Capped at 100px with 130px of buttons inside: a measurement of the box (80 + 100 + 112 = 292)
    // would call this pinned and clip the buttons; the natural height (322) correctly says page.
    installSizes({ backdrop: 310, header: 80, footerNatural: 130, footerBox: 100 });
    render(<Sheet />);
    expect(layoutOf()).toBe("page");
  });

  it("scales the body it insists on with the text size (7rem is more pixels at 200% text)", () => {
    installSizes({ backdrop: 400, header: 80, footerNatural: 130, footerBox: 130 });
    const { unmount } = render(<Sheet />);
    expect(layoutOf()).toBe("pinned"); // 322 <= 400 at a 16px root
    unmount();

    document.documentElement.style.fontSize = "32px";
    render(<Sheet />);
    expect(layoutOf()).toBe("page"); // 80 + 130 + 7 * 32 = 434 > 400
  });

  it("re-measures when the backdrop changes size (the keyboard opening and closing), with hysteresis", () => {
    render(<Sheet />);
    expect(layoutOf()).toBe("pinned");

    installSizes({ backdrop: 300, header: 80, footerNatural: 130, footerBox: 130 });
    fireResize();
    expect(layoutOf()).toBe("page");

    // Room is back by less than the margin: still a page (no flapping while the keyboard animates).
    installSizes({ backdrop: 330, header: 80, footerNatural: 130, footerBox: 130 });
    fireResize();
    expect(layoutOf()).toBe("page");

    installSizes({ backdrop: 340, header: 80, footerNatural: 130, footerBox: 130 });
    fireResize();
    expect(layoutOf()).toBe("pinned");
  });

  it("observes the backdrop, the header and the action row, and stops when the sheet closes", () => {
    const { unmount } = render(<Sheet />);
    const observer = FakeResizeObserver.instances.at(-1)!;
    const dialog = screen.getByRole("dialog");
    expect(observer.observed).toEqual([
      dialog.parentElement,
      dialog.querySelector(".sheet-header"),
      dialog.querySelector(".sheet-footer"),
    ]);
    unmount();
    expect(observer.disconnected).toBe(true);
  });

  it("brings the focused field back into view after the layout flips (the scroller changes)", async () => {
    const user = userEvent.setup();
    render(<Sheet />);
    await user.click(screen.getByLabelText("Reason"));
    scrollIntoView.mockClear();

    installSizes({ backdrop: 300, header: 80, footerNatural: 130, footerBox: 130 });
    fireResize();
    expect(layoutOf()).toBe("page");
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest", inline: "nearest" });

    // No flip, no extra scroll.
    scrollIntoView.mockClear();
    installSizes({ backdrop: 290, header: 80, footerNatural: 130, footerBox: 130 });
    fireResize();
    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it("still follows the visual viewport where ResizeObserver does not exist", () => {
    vi.stubGlobal("ResizeObserver", undefined);
    const viewport = new EventTarget();
    Object.defineProperty(window, "visualViewport", { configurable: true, value: viewport });
    render(<Sheet />);
    expect(layoutOf()).toBe("pinned");

    installSizes({ backdrop: 300, header: 80, footerNatural: 130, footerBox: 130 });
    act(() => {
      viewport.dispatchEvent(new Event("resize"));
    });
    expect(layoutOf()).toBe("page");
  });

  describe("what the room and the pinned parts are made of", () => {
    // header 80 + action row 127 + its 3px border + 7rem (112) = 322px needed.
    const base: Sizes = {
      backdrop: 700,
      header: 80,
      footerNatural: 127,
      footerBox: 130,
      footerBorder: 3,
    };
    const dialogOf = (): HTMLElement => screen.getByRole("dialog");

    it("subtracts the backdrop's top padding from the room", () => {
      installSizes({ ...base, backdrop: 400 });
      render(<Sheet />);
      expect(layoutOf()).toBe("pinned");
      dialogOf().parentElement!.style.paddingTop = "24px";
      installSizes({ ...base, backdrop: 340 }); // 340 - 24 = 316 < 322; without the subtraction 340 would still pin
      fireResize();
      expect(layoutOf()).toBe("page");
    });

    it("subtracts the backdrop's bottom padding from the room", () => {
      installSizes({ ...base, backdrop: 400 });
      render(<Sheet />);
      dialogOf().parentElement!.style.paddingBottom = "24px";
      installSizes({ ...base, backdrop: 340 });
      fireResize();
      expect(layoutOf()).toBe("page");
    });

    it("counts the action row's own border (offsetHeight - clientHeight) in its natural height", () => {
      installSizes({ ...base, backdrop: 320 }); // 80 + 127 + 3 + 112 = 322 > 320; without the border 319 <= 320 would pin
      render(<Sheet />);
      expect(layoutOf()).toBe("page");
    });

    it("counts the dialog's own top border in what is pinned", () => {
      installSizes({ ...base, backdrop: 400 });
      render(<Sheet />);
      dialogOf().style.borderTopWidth = "3px";
      installSizes({ ...base, backdrop: 323 }); // 210 + 3 + 112 = 325 > 323; without the top border 322 <= 323
      fireResize();
      expect(layoutOf()).toBe("page");
    });

    it("counts the dialog's bottom border too (the wide card has one)", () => {
      installSizes({ ...base, backdrop: 400 });
      render(<Sheet />);
      dialogOf().style.borderBottomWidth = "2px";
      installSizes({ ...base, backdrop: 323 }); // 210 + 2 + 112 = 324 > 323
      fireResize();
      expect(layoutOf()).toBe("page");
    });
  });

  it("also re-measures on a plain window resize, without any ResizeObserver delivery", () => {
    render(<Sheet />);
    expect(layoutOf()).toBe("pinned");
    installSizes({ backdrop: 300, header: 80, footerNatural: 130, footerBox: 130 });
    act(() => {
      window.dispatchEvent(new Event("resize"));
    });
    expect(layoutOf()).toBe("page");
  });

  it("removes every resize listener it added to window and visualViewport when the sheet closes", () => {
    const viewport = new EventTarget();
    Object.defineProperty(window, "visualViewport", { configurable: true, value: viewport });
    const viewportAdded = vi.spyOn(viewport, "addEventListener");
    const viewportRemoved = vi.spyOn(viewport, "removeEventListener");
    const windowAdded = vi.spyOn(window, "addEventListener");
    const windowRemoved = vi.spyOn(window, "removeEventListener");
    const { unmount } = render(<Sheet />);
    unmount();
    const count = (spy: { mock: { calls: unknown[][] } }, type: string): number =>
      spy.mock.calls.filter(([name]) => name === type).length;
    expect(count(viewportAdded, "resize")).toBeGreaterThan(0);
    expect(count(viewportRemoved, "resize")).toBe(count(viewportAdded, "resize"));
    expect(count(windowAdded, "resize")).toBeGreaterThan(0);
    expect(count(windowRemoved, "resize")).toBe(count(windowAdded, "resize"));
  });

  it("keeps one observer and its hysteresis state across a re-render of the parent", () => {
    installSizes({ backdrop: 300, header: 80, footerNatural: 130, footerBox: 130 });
    const { rerender } = render(<Sheet />);
    expect(layoutOf()).toBe("page");
    installSizes({ backdrop: 330, header: 80, footerNatural: 130, footerBox: 130 }); // inside the 12px band
    fireResize();
    rerender(<Sheet />);
    expect(FakeResizeObserver.instances).toHaveLength(1);
    expect(layoutOf()).toBe("page");
  });

  it("flips the layout BEFORE it asks for the focused field to be revealed (the reveal must scroll the new scroller)", async () => {
    const user = userEvent.setup();
    render(<Sheet />);
    await user.click(screen.getByLabelText("Reason"));
    let layoutWhenScrolled: string | undefined;
    scrollIntoView.mockImplementation(() => {
      layoutWhenScrolled = layoutOf();
    });
    installSizes({ backdrop: 300, header: 80, footerNatural: 130, footerBox: 130 });
    fireResize();
    expect(layoutWhenScrolled).toBe("page");
  });

  it("after a flip also reveals a focused non-text control, but focusing one never scrolls by itself", () => {
    render(<Sheet />);
    const apply = screen.getByRole("button", { name: "Apply" });
    scrollIntoView.mockClear();
    act(() => {
      apply.focus();
    });
    // A tap on a button or checkbox must not move the sheet under the finger.
    expect(scrollIntoView).not.toHaveBeenCalled();

    installSizes({ backdrop: 300, header: 80, footerNatural: 130, footerBox: 130 });
    fireResize();
    expect(layoutOf()).toBe("page");
    // The flip changes which element scrolls: a focused button would otherwise be stranded off screen.
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    expect(scrollIntoView.mock.contexts[0]).toBe(apply);
  });

  it("never reveals a focused element that is not inside the sheet", () => {
    render(
      <>
        <Sheet />
        <input aria-label="Elsewhere on the page" />
      </>,
    );
    const outside = screen.getByLabelText("Elsewhere on the page");
    act(() => {
      outside.focus();
    });
    scrollIntoView.mockClear();
    installSizes({ backdrop: 300, header: 80, footerNatural: 130, footerBox: 130 });
    fireResize();
    expect(layoutOf()).toBe("page");
    // A flip must not scroll for focus that sits outside the dialog (an inert page behind it).
    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it("a visual viewport resize (the keyboard opening) reveals a focused text field but never a focused button", async () => {
    const viewport = new EventTarget();
    Object.defineProperty(window, "visualViewport", { configurable: true, value: viewport });
    const user = userEvent.setup();
    render(<Sheet />);
    act(() => {
      screen.getByRole("button", { name: "Apply" }).focus();
    });
    scrollIntoView.mockClear();
    act(() => {
      viewport.dispatchEvent(new Event("resize"));
    });
    // Toolbars collapsing under a scrolling finger also resize the visual viewport: a button that merely
    // holds focus must not be dragged back into view each time.
    expect(scrollIntoView).not.toHaveBeenCalled();

    await user.click(screen.getByLabelText("Reason"));
    scrollIntoView.mockClear();
    act(() => {
      viewport.dispatchEvent(new Event("resize"));
    });
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    expect(scrollIntoView.mock.contexts[0]).toBe(screen.getByLabelText("Reason"));
  });

  it("leaves no data-layout behind and the page scroll lock released after closing", () => {
    const { unmount } = render(<Sheet />);
    const dialog = screen.getByRole("dialog");
    expect(dialog.dataset.layout).toBe("pinned");
    unmount();
    expect(dialog.dataset.layout).toBeUndefined();
    expect(document.documentElement).not.toHaveClass("sheet-open");
  });
});
