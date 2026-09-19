import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "jest-axe";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SheetDialog } from "../../src/shared/SheetDialog.js";

/**
 * The single modal pattern for the reskin (docs: apps/web/src/shared/SheetDialog.tsx). jsdom cannot
 * lay anything out, so the geometry guarantees (fits the visual viewport at every phone/tablet/
 * desktop size, keyboard, safe areas) are proved in a real browser by
 * `scripts/playtest/ui-audit.mjs`; what is proved here is everything behavioural: keyboard,
 * focus, background isolation, scroll lock, and how the visual viewport is mirrored to CSS.
 */

function Harness({ onClose = () => {} }: { readonly onClose?: () => void }): JSX.Element {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button type="button" onClick={() => setOpen(true)}>
        Open sheet
      </button>
      {open && (
        <SheetDialog
          titleId="test-sheet-title"
          title="Correct Rook"
          onClose={() => {
            onClose();
            setOpen(false);
          }}
          footer={
            <div className="sheet-actions">
              <button type="button">Apply</button>
              <button type="button" onClick={() => setOpen(false)}>
                Cancel
              </button>
            </div>
          }
        >
          <label htmlFor="who">Who</label>
          <select id="who" defaultValue="rook">
            <option value="rook">Rook</option>
            <option value="vesper">Vesper</option>
          </select>
          <label htmlFor="reason">Reason (required)</label>
          <input id="reason" type="text" />
        </SheetDialog>
      )}
    </div>
  );
}

class FakeVisualViewport extends EventTarget {
  offsetTop = 0;
  offsetLeft = 0;
  width = 375;
  height = 812;
  scale = 1;
  set(
    next: Partial<
      Pick<FakeVisualViewport, "offsetTop" | "offsetLeft" | "width" | "height" | "scale">
    >,
  ): void {
    Object.assign(this, next);
    this.dispatchEvent(new Event("resize"));
  }
}

describe("SheetDialog", () => {
  // jsdom implements no scrollIntoView, so a spy is installed and removed (nothing to restore).
  const scrollIntoView = vi.fn();

  beforeEach(() => {
    scrollIntoView.mockReset();
    Object.defineProperty(Element.prototype, "scrollIntoView", {
      configurable: true,
      writable: true,
      value: scrollIntoView,
    });
  });

  afterEach(() => {
    Reflect.deleteProperty(Element.prototype, "scrollIntoView");
    Reflect.deleteProperty(window, "visualViewport");
    document.documentElement.classList.remove("sheet-open");
  });

  it("is a labelled modal dialog rendered into <body>, with focus on its heading", async () => {
    const user = userEvent.setup();
    const { container } = render(<Harness />);
    await user.click(screen.getByRole("button", { name: /open sheet/i }));

    const dialog = screen.getByRole("dialog", { name: /correct rook/i });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(container.contains(dialog)).toBe(false); // portaled out of the app tree
    expect(document.body.contains(dialog)).toBe(true);
    expect(within(dialog).getByRole("heading", { name: /correct rook/i })).toHaveFocus();
  });

  it("keeps the header and the action row outside the scrolling body", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole("button", { name: /open sheet/i }));
    const dialog = screen.getByRole("dialog");
    const body = dialog.querySelector(".sheet-body")!;
    const footer = dialog.querySelector(".sheet-footer")!;
    const header = dialog.querySelector(".sheet-header")!;

    expect(header.contains(within(dialog).getByRole("heading"))).toBe(true);
    expect(body.contains(within(dialog).getByLabelText(/reason/i))).toBe(true);
    expect(footer.contains(within(dialog).getByRole("button", { name: /apply/i }))).toBe(true);
    expect(body.contains(footer)).toBe(false);
  });

  it("makes everything behind it inert and locks root scrolling, then restores both on close", async () => {
    const user = userEvent.setup();
    const { container } = render(<Harness />);
    const trigger = screen.getByRole("button", { name: /open sheet/i });
    await user.click(trigger);

    expect(container).toHaveAttribute("inert");
    expect(document.documentElement).toHaveClass("sheet-open");

    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: /cancel/i }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(container).not.toHaveAttribute("inert");
    expect(document.documentElement).not.toHaveClass("sheet-open");
    // Focus goes back to whatever opened it (an inert node could not have taken it).
    expect(trigger).toHaveFocus();
  });

  it("closes on Escape and returns focus to the trigger", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<Harness onClose={onClose} />);
    const trigger = screen.getByRole("button", { name: /open sheet/i });
    await user.click(trigger);
    await user.keyboard("{Escape}");

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("traps Tab and Shift+Tab inside the dialog, including select controls", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole("button", { name: /open sheet/i }));
    const dialog = screen.getByRole("dialog");
    const select = within(dialog).getByRole("combobox", { name: /who/i });
    const cancel = within(dialog).getByRole("button", { name: /cancel/i });

    await user.tab(); // heading -> first focusable (the select)
    expect(select).toHaveFocus();

    // Shift+Tab from the first control wraps to the last, never out into the page.
    await user.tab({ shift: true });
    expect(cancel).toHaveFocus();
    // Tab from the last control wraps to the first.
    await user.tab();
    expect(select).toHaveFocus();
  });

  it("scrolls a focused text field back into view (on-screen keyboard), instantly and only inside the sheet", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole("button", { name: /open sheet/i }));
    scrollIntoView.mockClear();

    await user.click(within(screen.getByRole("dialog")).getByLabelText(/reason/i));
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest", inline: "nearest" });
    // Never smooth-scrolls: no motion to suppress for reduced-motion visitors.
    expect(
      scrollIntoView.mock.calls.every(
        ([options]) => (options as ScrollIntoViewOptions).behavior === undefined,
      ),
    ).toBe(true);
  });

  it("removes inert from the app BEFORE returning focus to the trigger (an inert node cannot take focus)", async () => {
    const user = userEvent.setup();
    const { container } = render(<Harness />);
    const trigger = screen.getByRole("button", { name: /open sheet/i });
    await user.click(trigger);

    let appWasInertWhenFocusReturned: boolean | null = null;
    const focusSpy = vi.spyOn(trigger, "focus").mockImplementation(() => {
      appWasInertWhenFocusReturned = container.hasAttribute("inert");
    });
    await user.keyboard("{Escape}");

    expect(focusSpy).toHaveBeenCalled();
    expect(appWasInertWhenFocusReturned).toBe(false);
  });

  it("keeps root scroll locked until the LAST of several open sheets closes", () => {
    function Two(): JSX.Element {
      const [a, setA] = useState(true);
      const [b, setB] = useState(true);
      return (
        <div>
          {a && (
            <SheetDialog titleId="a-title" title="First" onClose={() => setA(false)} footer={null}>
              <p>a</p>
            </SheetDialog>
          )}
          {b && (
            <SheetDialog titleId="b-title" title="Second" onClose={() => setB(false)} footer={null}>
              <p>b</p>
            </SheetDialog>
          )}
          <button type="button" onClick={() => setA(false)}>
            close first
          </button>
          <button type="button" onClick={() => setB(false)}>
            close second
          </button>
        </div>
      );
    }
    render(<Two />);
    expect(document.documentElement).toHaveClass("sheet-open");

    act(() => screen.getByRole("button", { name: /close first/i }).click());
    expect(document.documentElement).toHaveClass("sheet-open"); // the second is still open

    act(() => screen.getByRole("button", { name: /close second/i }).click());
    expect(document.documentElement).not.toHaveClass("sheet-open");
  });

  it("wraps Tab around REACHABLE controls only: a collapsed control at the end never swallows Tab, and a trailing link is part of the cycle", async () => {
    const user = userEvent.setup();
    render(
      <SheetDialog
        titleId="c-title"
        title="Details"
        onClose={() => {}}
        footer={
          <details>
            <summary>More</summary>
            <button type="button">Inside collapsed</button>
          </details>
        }
      >
        <button type="button">First</button>
        <a href="#somewhere">A link</a>
      </SheetDialog>,
    );
    const dialog = screen.getByRole("dialog");
    const first = within(dialog).getByRole("button", { name: "First" });
    const link = within(dialog).getByRole("link", { name: /a link/i });
    const summary = within(dialog).getByText("More");

    // The trailing link used to be outside the cycle (it was not in the focusable selector).
    link.focus();
    await user.tab();
    expect(summary).toHaveFocus();

    // The last REACHABLE control is the summary. The trap itself (not the browser's natural order,
    // which jsdom does not model) must take Tab from it: cancel the default and wrap to the first
    // control instead of stepping into the collapsed, unrendered button.
    summary.focus();
    const notCancelled = fireEvent.keyDown(summary, { key: "Tab" });
    expect(notCancelled).toBe(false);
    expect(first).toHaveFocus();

    // And Shift+Tab from the first control wraps to that same last reachable control.
    const shiftNotCancelled = fireEvent.keyDown(first, { key: "Tab", shiftKey: true });
    expect(shiftNotCancelled).toBe(false);
    expect(summary).toHaveFocus();
  });

  it("includes links and contenteditable regions in the cycle: Tab from a trailing one wraps to the first control", () => {
    render(
      <SheetDialog titleId="d-title" title="Cycle" onClose={() => {}} footer={null}>
        <button type="button">First</button>
        <a href="#end">Trailing link</a>
      </SheetDialog>,
    );
    const dialog = screen.getByRole("dialog");
    const link = within(dialog).getByRole("link", { name: /trailing link/i });
    link.focus();
    // The link is the LAST focusable: the trap itself (not the browser's natural order) must cancel
    // Tab and wrap. Without a[href] in the selector the trap would not act at all.
    expect(fireEvent.keyDown(link, { key: "Tab" })).toBe(false);
    expect(within(dialog).getByRole("button", { name: "First" })).toHaveFocus();
  });

  it("treats a contenteditable region as focusable for the trap", () => {
    render(
      <SheetDialog titleId="e-title" title="Edit" onClose={() => {}} footer={null}>
        <button type="button">First</button>
        <div contentEditable suppressContentEditableWarning role="textbox" aria-label="Notes">
          notes
        </div>
      </SheetDialog>,
    );
    const dialog = screen.getByRole("dialog");
    const editor = within(dialog).getByRole("textbox", { name: /notes/i });
    const first = within(dialog).getByRole("button", { name: "First" });
    const focusFirst = vi.spyOn(first, "focus");
    // jsdom cannot focus a contenteditable that has no tabindex, so present it as the active element.
    Object.defineProperty(document, "activeElement", { configurable: true, get: () => editor });
    try {
      // The editor is the last focusable (no tabindex: only the contenteditable selector finds it),
      // so the trap itself must cancel Tab and wrap to the first control.
      expect(fireEvent.keyDown(editor, { key: "Tab" })).toBe(false);
      expect(focusFirst).toHaveBeenCalled();
    } finally {
      Reflect.deleteProperty(document, "activeElement");
    }
  });

  it("skips controls the engine reports as not visible when choosing where Tab wraps", () => {
    // jsdom has no checkVisibility, so model one: anything with the `hidden` attribute is invisible.
    Object.defineProperty(Element.prototype, "checkVisibility", {
      configurable: true,
      writable: true,
      value(this: Element) {
        return !this.hasAttribute("hidden");
      },
    });
    try {
      render(
        <SheetDialog
          titleId="v-title"
          title="Hidden"
          onClose={() => {}}
          footer={
            <>
              <button type="button">Last visible</button>
              <button type="button" hidden>
                Ghost
              </button>
            </>
          }
        >
          <button type="button">First</button>
        </SheetDialog>,
      );
      const dialog = screen.getByRole("dialog");
      const lastVisible = within(dialog).getByRole("button", { name: "Last visible" });
      lastVisible.focus();
      // "Ghost" is last in the DOM but not visible: "Last visible" is the real last stop.
      expect(fireEvent.keyDown(lastVisible, { key: "Tab" })).toBe(false);
      expect(within(dialog).getByRole("button", { name: "First" })).toHaveFocus();
    } finally {
      Reflect.deleteProperty(Element.prototype, "checkVisibility");
    }
  });

  it("does not count an unchecked radio (group has a checked one), a disabled-fieldset control, or an inert subtree as tab stops", () => {
    render(
      <SheetDialog
        titleId="r-title"
        title="Radios"
        onClose={() => {}}
        footer={
          <>
            <label>
              <input type="radio" name="g" defaultChecked /> Checked
            </label>
            <label>
              <input type="radio" name="g" /> Unchecked sibling
            </label>
            <fieldset disabled>
              <button type="button">Disabled group button</button>
            </fieldset>
            <div ref={(node) => node?.setAttribute("inert", "")}>
              <button type="button">Inert subtree button</button>
            </div>
          </>
        }
      >
        <button type="button">First</button>
      </SheetDialog>,
    );
    const dialog = screen.getByRole("dialog");
    const checked = within(dialog).getByRole("radio", { name: "Checked" });
    checked.focus();
    // Everything after the checked radio is unreachable, so it is the real last stop: the trap itself
    // must cancel Tab and wrap. Each filter is needed for that (removing any one leaves a phantom last).
    expect(fireEvent.keyDown(checked, { key: "Tab" })).toBe(false);
    expect(within(dialog).getByRole("button", { name: "First" })).toHaveFocus();
  });

  it("with no radio checked, only the FIRST radio of the group is a tab stop", () => {
    render(
      <SheetDialog
        titleId="n-title"
        title="Unchecked group"
        onClose={() => {}}
        footer={
          <>
            <label>
              <input type="radio" name="none" /> One
            </label>
            <label>
              <input type="radio" name="none" /> Two
            </label>
            <label>
              <input type="radio" name="none" /> Three
            </label>
          </>
        }
      >
        <button type="button">First</button>
      </SheetDialog>,
    );
    const dialog = screen.getByRole("dialog");
    const one = within(dialog).getByRole("radio", { name: "One" });
    one.focus();
    // "One" is the group's only tab stop and the last reachable control: Tab must wrap from it.
    expect(fireEvent.keyDown(one, { key: "Tab" })).toBe(false);
    expect(within(dialog).getByRole("button", { name: "First" })).toHaveFocus();
  });

  it("does not treat the first legend of a disabled fieldset as disabled", () => {
    render(
      <SheetDialog
        titleId="l-title"
        title="Legend"
        onClose={() => {}}
        footer={
          <fieldset disabled>
            <legend>
              <button type="button">Enabled in legend</button>
            </legend>
            <button type="button">Disabled body</button>
          </fieldset>
        }
      >
        <button type="button">First</button>
      </SheetDialog>,
    );
    const dialog = screen.getByRole("dialog");
    const inLegend = within(dialog).getByRole("button", { name: "Enabled in legend" });
    inLegend.focus();
    // The legend's button is enabled (last reachable); the fieldset's other button is not.
    expect(fireEvent.keyDown(inLegend, { key: "Tab" })).toBe(false);
    expect(within(dialog).getByRole("button", { name: "First" })).toHaveFocus();
  });

  it("has no axe violations open", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole("button", { name: /open sheet/i }));
    expect(await axe(screen.getByRole("dialog"))).toHaveNoViolations();
  });

  describe("visual viewport", () => {
    function installViewport(): FakeVisualViewport {
      const viewport = new FakeVisualViewport();
      Object.defineProperty(window, "visualViewport", { configurable: true, value: viewport });
      Object.defineProperty(window, "innerHeight", { configurable: true, value: 812 });
      Object.defineProperty(document.documentElement, "clientWidth", {
        configurable: true,
        value: 375,
      });
      return viewport;
    }

    async function openSheet(): Promise<HTMLElement> {
      const user = userEvent.setup();
      render(<Harness />);
      await user.click(screen.getByRole("button", { name: /open sheet/i }));
      return screen.getByRole("dialog").parentElement!;
    }

    it("sets no override while the visual and layout viewports agree", async () => {
      installViewport();
      const backdrop = await openSheet();
      expect(backdrop.style.getPropertyValue("--vv-height")).toBe("");
      expect(backdrop.style.getPropertyValue("--vv-top")).toBe("");
    });

    it("mirrors an on-screen keyboard (shorter, offset visual viewport) onto the backdrop, and clears it again", async () => {
      const viewport = installViewport();
      const backdrop = await openSheet();

      act(() => viewport.set({ height: 470, offsetTop: 0 }));
      expect(backdrop.style.getPropertyValue("--vv-height")).toBe("470px");
      expect(backdrop.style.getPropertyValue("--vv-width")).toBe("375px");
      expect(backdrop.style.getPropertyValue("--vv-top")).toBe("0px");

      // iOS Safari scrolls the layout viewport under the keyboard: the offset follows.
      act(() => viewport.set({ height: 470, offsetTop: 120 }));
      expect(backdrop.style.getPropertyValue("--vv-top")).toBe("120px");

      act(() => viewport.set({ height: 812, offsetTop: 0 }));
      expect(backdrop.style.getPropertyValue("--vv-height")).toBe("");
      expect(backdrop.style.getPropertyValue("--vv-top")).toBe("");
    });

    it("follows pinch-zoom (scale != 1) and stops listening once closed", async () => {
      const viewport = installViewport();
      const removeSpy = vi.spyOn(viewport, "removeEventListener");
      const backdrop = await openSheet();

      act(() =>
        viewport.set({ scale: 1.6, width: 234, height: 507, offsetLeft: 40, offsetTop: 90 }),
      );
      expect(backdrop.style.getPropertyValue("--vv-width")).toBe("234px");
      expect(backdrop.style.getPropertyValue("--vv-left")).toBe("40px");

      const user = userEvent.setup();
      await user.keyboard("{Escape}");
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      const removed = removeSpy.mock.calls.map(([type]) => type);
      expect(removed).toContain("resize");
      expect(removed).toContain("scroll");
    });

    it("follows an offset-only change (iOS scrolling the layout viewport under the keyboard)", async () => {
      const viewport = installViewport();
      const backdrop = await openSheet();
      // Same size and scale; only the offset moves.
      act(() => viewport.set({ offsetTop: 96 }));
      expect(backdrop.style.getPropertyValue("--vv-top")).toBe("96px");
      act(() => viewport.set({ offsetTop: 0, offsetLeft: 32 }));
      expect(backdrop.style.getPropertyValue("--vv-left")).toBe("32px");
      act(() => viewport.set({ offsetLeft: 0 }));
      expect(backdrop.style.getPropertyValue("--vv-left")).toBe("");
    });

    it("re-reveals the focused text field when the keyboard finishes opening (viewport resize after focus)", async () => {
      const viewport = installViewport();
      const user = userEvent.setup();
      render(<Harness />);
      await user.click(screen.getByRole("button", { name: /open sheet/i }));
      await user.click(within(screen.getByRole("dialog")).getByLabelText(/reason/i));
      scrollIntoView.mockClear();

      act(() => viewport.set({ height: 470 }));
      expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest", inline: "nearest" });
    });

    it("renders normally where the Visual Viewport API does not exist", async () => {
      Reflect.deleteProperty(window, "visualViewport");
      const backdrop = await openSheet();
      expect(backdrop.getAttribute("style") ?? "").not.toContain("--vv-");
    });
  });
});
