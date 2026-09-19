import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useVisualViewportBox } from "./useVisualViewportBox.js";

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])';

/** Text-entry controls: the ones that summon an on-screen keyboard and so must be kept in view. */
const TEXT_ENTRY_SELECTOR = 'input:not([type="checkbox"]):not([type="radio"]), textarea, select';

export interface SheetDialogProps {
  /** `id` given to the heading, referenced by `aria-labelledby`. */
  readonly titleId: string;
  readonly title: ReactNode;
  readonly onClose: () => void;
  /** Sticky action row (primary and cancel buttons); always reachable without scrolling the body. */
  readonly footer: ReactNode;
  readonly children: ReactNode;
}

/**
 * The single modal pattern for the app: a bottom sheet on a narrow viewport
 * and a centred card on a wide one (the switch is CSS only, see `.sheet` in
 * `styles.css`). It replaces the earlier ad hoc `.modal` markup so that every
 * pop-out shares one set of guarantees, all covered by
 * `test/shared/SheetDialog.test.tsx`:
 *
 * - Rendered through a portal into `<body>` and every other body child is made
 *   `inert` while it is open, so neither a mouse, a keyboard, nor a screen
 *   reader can reach the page behind it (`aria-modal` alone is only a hint).
 * - Sized from the *visual* viewport (`useVisualViewportBox`) so it never
 *   slides under an on-screen keyboard or off screen with dynamic browser
 *   chrome; the header and footer stay pinned while only the body scrolls.
 * - Root scrolling is locked while it is open, and a focused text field is
 *   scrolled back into view when the keyboard appears.
 * - Focus moves to the heading on open and returns to the trigger on close;
 *   Escape closes; Tab and Shift+Tab cycle inside the dialog.
 *
 * Presentation only: it holds no domain state and never changes what data a
 * viewer is sent.
 */
export function SheetDialog({
  titleId,
  title,
  onClose,
  footer,
  children,
}: SheetDialogProps): JSX.Element {
  const backdropRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  useVisualViewportBox(backdropRef);

  // Focus, inert background, and root scroll lock share one lifecycle so the
  // restore order is deterministic: un-inert first, then return focus (an
  // inert element cannot receive focus).
  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const backdrop = backdropRef.current;
    const madeInert: Element[] = [];
    for (const child of Array.from(document.body.children)) {
      if (child === backdrop || child.tagName === "SCRIPT" || child.hasAttribute("inert")) continue;
      child.setAttribute("inert", "");
      madeInert.push(child);
    }
    document.documentElement.classList.add("sheet-open");
    headingRef.current?.focus();
    return () => {
      for (const child of madeInert) child.removeAttribute("inert");
      document.documentElement.classList.remove("sheet-open");
      previouslyFocused?.focus();
    };
  }, []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === "Escape") {
        onClose();
        return;
      }
      const dialog = dialogRef.current;
      if (event.key !== "Tab" || !dialog) return;
      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
      if (focusable.length === 0) return;
      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      const active = document.activeElement;
      const atStart = active === first || active === headingRef.current;
      if (event.shiftKey && atStart) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      } else if (!dialog.contains(active)) {
        event.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  // Keep the field being typed in above the on-screen keyboard: on focus, and
  // again when the visual viewport changes size (the keyboard finishes opening
  // after the focus event). `block: "nearest"` scrolls only the sheet body,
  // never the page, and is instant, so it needs no reduced-motion branch.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return undefined;
    const root: HTMLElement = dialog;
    function reveal(): void {
      const active = document.activeElement;
      if (
        active instanceof HTMLElement &&
        root.contains(active) &&
        active.matches(TEXT_ENTRY_SELECTOR) &&
        typeof active.scrollIntoView === "function" // absent in jsdom and very old engines
      ) {
        active.scrollIntoView({ block: "nearest", inline: "nearest" });
      }
    }
    root.addEventListener("focusin", reveal);
    const viewport = window.visualViewport;
    viewport?.addEventListener("resize", reveal);
    return () => {
      root.removeEventListener("focusin", reveal);
      viewport?.removeEventListener("resize", reveal);
    };
  }, []);

  return createPortal(
    <div className="sheet-backdrop" role="presentation" ref={backdropRef}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="sheet"
        ref={dialogRef}
      >
        <div className="sheet-header">
          <span className="sheet-grip" aria-hidden="true" />
          <h2 id={titleId} tabIndex={-1} ref={headingRef}>
            {title}
          </h2>
        </div>
        <div className="sheet-body">{children}</div>
        <div className="sheet-footer">{footer}</div>
      </div>
    </div>,
    document.body,
  );
}
