import { useLayoutEffect, type RefObject } from "react";

/**
 * Below this visible height (in rem, so it scales with the user's text size) a pinned title, body and
 * action row cannot all be shown: the sheet is "compact" and scrolls as one page instead.
 */
export const COMPACT_BELOW_REM = 15;

/**
 * Mirrors `window.visualViewport` onto CSS custom properties of `ref`'s
 * element (`--vv-top`, `--vv-left`, `--vv-width`, `--vv-height`) whenever the
 * visual viewport differs from the layout viewport: an on-screen keyboard on
 * iOS Safari (which shrinks the visual viewport without resizing the layout
 * one), pinch-zoom, or dynamic browser chrome. A `position: fixed` sheet
 * that sizes itself from these variables therefore stays inside what the
 * person can actually see instead of sliding under the keyboard or off the
 * bottom edge.
 *
 * When the two viewports agree (the common case: desktop, or Chrome
 * Android's `interactive-widget=resizes-content`), no variable is set, so the
 * stylesheet's plain `100dvh`/`100%` fallbacks apply and nothing here can
 * disturb ordinary layout (for example a desktop page scrollbar).
 *
 * It also sets `data-compact` on that element while the visible height is under
 * `COMPACT_BELOW_REM`. On a landscape phone with the on-screen keyboard up, real iOS
 * Safari leaves roughly 70-140px (measured in the iOS Simulator): a pinned header and
 * footer alone need more than that, which clipped the action row and pushed the title
 * out of view. The stylesheet makes the whole sheet scroll in that state.
 *
 * Presentation only. No game state, projection, or authorization is read or
 * written here.
 */
export function useVisualViewportBox(ref: RefObject<HTMLElement | null>): void {
  useLayoutEffect(() => {
    const element = ref.current;
    const viewport = typeof window === "undefined" ? undefined : window.visualViewport;
    if (!element || !viewport) return undefined;
    const target: HTMLElement = element;
    const visual: VisualViewport = viewport;

    function apply(): void {
      // The smaller of the two heights: iOS shrinks only the visual viewport for the keyboard, Chrome
      // Android (interactive-widget=resizes-content) shrinks both.
      const rootFontSize = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
      const visibleHeight = Math.min(visual.height, window.innerHeight);
      target.toggleAttribute("data-compact", visibleHeight < COMPACT_BELOW_REM * rootFontSize);
      const differs =
        visual.scale !== 1 ||
        Math.abs(visual.offsetTop) > 0.5 ||
        Math.abs(visual.offsetLeft) > 0.5 ||
        Math.abs(visual.height - window.innerHeight) > 1 ||
        Math.abs(visual.width - document.documentElement.clientWidth) > 1;
      if (!differs) {
        for (const name of ["top", "left", "width", "height"]) {
          target.style.removeProperty(`--vv-${name}`);
        }
        return;
      }
      target.style.setProperty("--vv-top", `${visual.offsetTop}px`);
      target.style.setProperty("--vv-left", `${visual.offsetLeft}px`);
      target.style.setProperty("--vv-width", `${visual.width}px`);
      target.style.setProperty("--vv-height", `${visual.height}px`);
    }

    apply();
    visual.addEventListener("resize", apply);
    visual.addEventListener("scroll", apply);
    return () => {
      visual.removeEventListener("resize", apply);
      visual.removeEventListener("scroll", apply);
    };
  }, [ref]);
}
