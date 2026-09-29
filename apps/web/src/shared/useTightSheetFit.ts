import { useLayoutEffect, type RefObject } from "react";

/**
 * A pinned header and action row must leave the sheet's body at least this share of the sheet's
 * height; below it the sheet stops pinning its header (see `isTightSheet`).
 */
export const MIN_BODY_SHARE = 0.5;

export interface SheetMetrics {
  /** Height the sheet actually gets (clamped by the visual viewport), border box excluded. */
  readonly sheet: number;
  readonly header: number;
  readonly footer: number;
  /** Natural (unscrolled) height of the body's content. */
  readonly bodyContent: number;
}

/**
 * Whether pinning both the header and the action row would squeeze the body. That happens when the
 * visible height is small (a landscape phone with its keyboard open) or the text is large (150-200%
 * on a 320px phone): the pinned parts alone can take most of the sheet and leave the field being
 * typed in a sliver. Only a sheet whose content overflows can be squeezed, so a short dialog never
 * qualifies. Every input is independent of the mode it selects, so the answer cannot oscillate.
 */
export function isTightSheet({ sheet, header, footer, bodyContent }: SheetMetrics): boolean {
  const overflows = header + bodyContent + footer > sheet + 1;
  return overflows && sheet - header - footer < sheet * MIN_BODY_SHARE;
}

/**
 * Presentation only. Toggles `data-tight` on the sheet (and publishes `--sheet-footer-h`) so the
 * stylesheet can let the header scroll away with the body, keeping only the action row pinned.
 * Re-measured when the sheet, header, or action row change size (text scale, viewport, keyboard) and
 * on window/visual-viewport resize. The body is deliberately not observed: its size changes when
 * this attribute flips, which would re-enter the observer.
 */
export function useTightSheetFit(sheetRef: RefObject<HTMLElement | null>): void {
  useLayoutEffect(() => {
    const sheet = sheetRef.current;
    if (!sheet) return undefined;
    const root: HTMLElement = sheet;
    const header = root.querySelector<HTMLElement>(".sheet-header");
    const body = root.querySelector<HTMLElement>(".sheet-body");
    const footer = root.querySelector<HTMLElement>(".sheet-footer");
    if (!header || !body || !footer) return undefined;
    const parts = { header, body, footer };

    function fit(): void {
      const tight = isTightSheet({
        sheet: root.clientHeight,
        header: parts.header.offsetHeight,
        footer: parts.footer.offsetHeight,
        bodyContent: parts.body.scrollHeight,
      });
      root.toggleAttribute("data-tight", tight);
      root.style.setProperty("--sheet-footer-h", `${parts.footer.offsetHeight}px`);
    }

    fit();
    const observer = typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(fit);
    for (const element of [root, header, footer]) observer?.observe(element);
    window.addEventListener("resize", fit);
    window.visualViewport?.addEventListener("resize", fit);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", fit);
      window.visualViewport?.removeEventListener("resize", fit);
    };
  }, [sheetRef]);
}
