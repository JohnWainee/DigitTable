import { useLayoutEffect, useRef, type ReactNode, type RefObject } from "react";

/** Height of every mounted dock, so the page-level scroll padding follows the tallest (several GM review cards can each carry one). */
const dockHeights = new Map<Element, number>();

function publishInset(): void {
  const tallest = Math.max(0, ...dockHeights.values());
  const root = document.documentElement;
  if (tallest > 0) root.style.setProperty("--action-dock-height", `${Math.ceil(tallest)}px`);
  else root.style.removeProperty("--action-dock-height");
}

/**
 * Publishes the dock's rendered height as `--action-dock-height` on `<html>` (read by
 * `html:has(.action-dock)` in `styles.css` as `scroll-padding-bottom`), so a control focused by
 * keyboard is scrolled clear of the pinned bar instead of landing behind it. The height changes with
 * the status text, large text sizes and the viewport width, hence an observer rather than a constant.
 * It also marks the dock `data-clipped` while its content overflows the height cap.
 * A no-op where `ResizeObserver` is absent (jsdom, very old engines): the stylesheet's fallback applies.
 */
function useActionDockInset(ref: RefObject<HTMLElement | null>): void {
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element || typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(() => {
      dockHeights.set(element, element.getBoundingClientRect().height);
      publishInset();
      // Large text on a small phone can make the content taller than the dock's height cap. The
      // dock then scrolls internally and, with the status first, the buttons are what falls below
      // the fold. `data-clipped` lets the stylesheet put the actions first in that state only.
      // Order does not change the content height, so this cannot flip back and forth.
      element.toggleAttribute("data-clipped", element.scrollHeight > element.clientHeight + 1);
    });
    observer.observe(element);
    // The cap stops the dock itself resizing when its content grows, so watch the content too.
    for (const child of Array.from(element.children)) observer.observe(child);
    return () => {
      observer.disconnect();
      dockHeights.delete(element);
      publishInset();
    };
  }, [ref]);
}

/**
 * Below this visible height (CSS px) a pinned bar leaves too little page: see `.action-dock[data-unpinned]`.
 * Deliberately NOT scaled by the root font size: it mirrors `@media (max-height: 20rem)`, where rem is the
 * browser's initial 16px. Scaling it would unpin the dock for every phone at 200% text, which is exactly
 * where the capped, internally scrolled dock (`data-clipped`) is meant to stay pinned.
 */
export const UNPIN_BELOW_PX = 320;
/** Pinch-zoom beyond this scale unpins the dock (1 plus the engines' rounding noise). */
export const UNPIN_ABOVE_SCALE = 1.05;

/**
 * Whether the dock must leave the pinned position for the viewport the person is actually looking at.
 * `position: sticky` follows the *layout* viewport, which is not what a pinch-zoomed or keyboard-covered
 * visual viewport shows: at 2x the pinned bar sits wholly below the visible area (the action is out of
 * reach until panned to), and at 3x it covers 44% of what is magnified. Pure, so it is unit-tested.
 */
export function shouldUnpinDock(input: {
  readonly scale: number;
  readonly visualHeight: number;
  readonly layoutHeight: number;
}): boolean {
  const visibleHeight = Math.min(input.visualHeight, input.layoutHeight);
  return input.scale > UNPIN_ABOVE_SCALE || visibleHeight < UNPIN_BELOW_PX;
}

/** Mirrors `shouldUnpinDock` onto `data-unpinned` while the visual viewport is zoomed or short. A no-op without `visualViewport`. */
function useDockPinning(ref: RefObject<HTMLElement | null>): void {
  useLayoutEffect(() => {
    const element = ref.current;
    const visual = window.visualViewport;
    if (!element || !visual) return undefined;
    const target: HTMLElement = element;
    const viewport: VisualViewport = visual;
    function apply(): void {
      target.toggleAttribute(
        "data-unpinned",
        shouldUnpinDock({
          scale: viewport.scale,
          visualHeight: viewport.height,
          layoutHeight: window.innerHeight,
        }),
      );
    }
    apply();
    viewport.addEventListener("resize", apply);
    return () => viewport.removeEventListener("resize", apply);
  }, [ref]);
}

export interface ActionDockProps {
  /** `id` of the status line; give the dock's primary button `aria-describedby` this so a disabled button explains itself. */
  readonly statusId: string;
  /** Visible, always-current state of the decision (a pool total, how many dice still need a target). */
  readonly status: ReactNode;
  /** The primary action, then any secondary action. */
  readonly children: ReactNode;
}

/**
 * The commit row of a long decision form. On a phone the compose and allocation forms run to several
 * screens (every stat, item, ability and threat is a 48px row), which left "Declare action" and
 * "Confirm allocation" far below the choices that decide them and gave a disabled button no visible
 * reason. The dock is the last child of its panel and sticks to the bottom of the visible viewport
 * while any of the panel is on screen (CSS only, see `.action-dock` in `styles.css`): the live status
 * and the primary action stay reachable, and the status says why the action is unavailable.
 *
 * Layout guarantees live in the stylesheet and are pinned by `test/styles/reskinContract.test.ts` and
 * the real-browser `scripts/playtest/ui-audit.mjs` dock audit: safe-area padding under the home
 * indicator, a height cap with internal scrolling for large text, `scroll-padding` so a focused
 * control is never hidden behind it (WCAG 2.2 SC 2.4.11), and a static, in-flow row when the viewport
 * is too short for a pinned bar.
 *
 * Presentation only: it owns no state and never changes what a viewer is sent.
 */
export function ActionDock({ statusId, status, children }: ActionDockProps): JSX.Element {
  const ref = useRef<HTMLDivElement>(null);
  useActionDockInset(ref);
  useDockPinning(ref);
  return (
    <div className="action-dock" ref={ref}>
      <p id={statusId} className="action-dock-status">
        {status}
      </p>
      <div className="action-dock-actions">{children}</div>
    </div>
  );
}
