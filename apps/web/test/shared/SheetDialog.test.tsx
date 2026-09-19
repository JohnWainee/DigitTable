import { act, render, screen, within } from "@testing-library/react";
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

    it("renders normally where the Visual Viewport API does not exist", async () => {
      Reflect.deleteProperty(window, "visualViewport");
      const backdrop = await openSheet();
      expect(backdrop.getAttribute("style") ?? "").not.toContain("--vv-");
    });
  });
});
