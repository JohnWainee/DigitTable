import { useLayoutEffect, useRef, type RefObject } from "react";

export type SheetLayout = "pinned" | "page";

/**
 * The pinned layout is only worth having while the scrolling body keeps this much room (its own
 * padding, a label and one field: what a person needs to see while typing). Below that the whole
 * sheet scrolls as one page instead.
 */
export const MIN_BODY_REM = 7;

/**
 * Margin before the layout may flip back to "pinned". A keyboard animation fires a burst of resize
 * events and a measurement can land a sub-pixel either side of the threshold; without this margin
 * the layout would flap.
 */
export const FLIP_BACK_MARGIN_PX = 12;

export interface SheetSpace {
  /** Height the sheet may occupy: the backdrop's content box (what is VISIBLE, minus its padding). */
  readonly available: number;
  /** Natural height of everything that is pinned: header, full action row and the dialog's borders. */
  readonly chrome: number;
  /** Room the body must keep for the pinned layout to be used. */
  readonly minBody: number;
}

/**
 * Pure decision: "pinned" when the header, the whole action row and `minBody` of body fit in
 * `available`, otherwise "page". Once "page", it stays so until the room is clearly back.
 */
export function chooseSheetLayout(previous: SheetLayout | null, space: SheetSpace): SheetLayout {
  const needed = space.chrome + space.minBody;
  if (needed > space.available) return "page";
  if (previous === "page" && needed + FLIP_BACK_MARGIN_PX > space.available) return "page";
  return "pinned";
}

export interface SheetLayoutRefs {
  readonly backdrop: RefObject<HTMLElement | null>;
  readonly dialog: RefObject<HTMLElement | null>;
  readonly header: RefObject<HTMLElement | null>;
  readonly footer: RefObject<HTMLElement | null>;
}

function px(value: string): number {
  const parsed = parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Chooses how the bottom sheet lays itself out from MEASURED sizes and records the choice as
 * `data-layout` on the dialog (`pinned` or `page`, see `.sheet[data-layout]` in `styles.css`).
 *
 * Why measure: the pinned layout (header and action row fixed, body scrolling) needs the header and
 * the action row to leave the body some room. How tall they are depends on the text size, the
 * width (the two buttons stack below about 21rem) and the title, and how much is VISIBLE depends on
 * the on-screen keyboard, which on iOS shrinks only the visual viewport (so no media query sees
 * it). A fixed height threshold was wrong for the combinations that matter most: at 150% text on a
 * 320px phone with the keyboard up the pinned parts took all but 48px of a 262px sheet, clipped the
 * action row and left Cancel outside the sheet, while the action row's own 40% cap scrolled it
 * inside a second scroller. Measured, the sheet pins when it fits and scrolls as one page when it
 * does not.
 *
 * Recomputed whenever the backdrop (which `useVisualViewportBox` sizes to what is visible), the
 * header or the action row changes size, and on viewport resize. `onLayoutChange` runs after a flip
 * so the caller can bring the focused field back into view (a flip moves the scroller).
 *
 * Presentation only. No game state, projection or authorization is read or written here.
 */
export function useSheetLayout(
  refs: SheetLayoutRefs,
  onLayoutChange?: (layout: SheetLayout) => void,
): void {
  const notify = useRef(onLayoutChange);
  useLayoutEffect(() => {
    notify.current = onLayoutChange;
  }, [onLayoutChange]);

  const { backdrop: backdropRef, dialog: dialogRef, header: headerRef, footer: footerRef } = refs;
  useLayoutEffect(() => {
    const backdrop = backdropRef.current;
    const dialog = dialogRef.current;
    const header = headerRef.current;
    const footer = footerRef.current;
    if (!backdrop || !dialog || !header || !footer) return undefined;

    let previous: SheetLayout | null = null;

    function measure(): void {
      if (!backdrop || !dialog || !header || !footer) return;
      const backdropStyle = getComputedStyle(backdrop);
      const dialogStyle = getComputedStyle(dialog);
      const available =
        backdrop.clientHeight - px(backdropStyle.paddingTop) - px(backdropStyle.paddingBottom);
      // The footer's NATURAL height: `scrollHeight` is unaffected by the cap and scroller it may have.
      const footerNatural = footer.scrollHeight + (footer.offsetHeight - footer.clientHeight);
      const chrome =
        header.offsetHeight +
        footerNatural +
        px(dialogStyle.borderTopWidth) +
        px(dialogStyle.borderBottomWidth);
      const rem = px(getComputedStyle(document.documentElement).fontSize) || 16;
      const next = chooseSheetLayout(previous, { available, chrome, minBody: MIN_BODY_REM * rem });
      if (next === previous) return;
      previous = next;
      dialog.dataset.layout = next;
      notify.current?.(next);
    }

    measure();
    const observer = typeof ResizeObserver === "function" ? new ResizeObserver(measure) : null;
    observer?.observe(backdrop);
    observer?.observe(header);
    observer?.observe(footer);
    // Without ResizeObserver the viewport events still cover the keyboard and rotation.
    const viewport = window.visualViewport;
    viewport?.addEventListener("resize", measure);
    window.addEventListener("resize", measure);
    return () => {
      observer?.disconnect();
      viewport?.removeEventListener("resize", measure);
      window.removeEventListener("resize", measure);
      delete dialog.dataset.layout;
    };
  }, [backdropRef, dialogRef, headerRef, footerRef]);
}
