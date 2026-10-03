import { useLayoutEffect, useRef } from "react";

export interface CommandAlertProps {
  /** The message of a command this screen sent and the server rejected. */
  readonly error: string | null | undefined;
  /** A rejection reported by the room session (for example a queued command replayed after reconnecting). */
  readonly failure: { readonly message: string } | null | undefined;
}

/**
 * A rejected command's message on a long screen (the GM console, the character claim list, the player
 * dashboard). These pages are tall (the GM console is ~5000px on a phone and ~3000px on a laptop) and the
 * message is rendered near the top, while the control that was just activated sits far below it, so on its
 * own the rejection is out of sight and the tap looks ignored (measured: the alert ended up 270-730px above
 * the viewport at 320, 375, 768, 812x375 and 1280px). When the person's own command is rejected and the
 * message is not fully visible, it is scrolled into view.
 *
 * Only `error` scrolls: it is set by the screen that sent the command, right after the press. A `failure`
 * the session reports on its own account (a queued command replayed after reconnecting, a lost connection)
 * is still shown, but must not yank the page while someone is working lower down or typing with the keyboard up.
 * Nor does a message that arrives while a sheet is open (`SheetDialog` makes the rest of the page `inert`): the
 * sheet's scroll lock does not stop a programmatic scroll, and closing the sheet scrolls back to its trigger
 * anyway, so the jump would only disturb whoever is typing in it. The message is shown, just not scrolled to.
 *
 * `block: "nearest"` leaves the page alone if the message is already on screen; the scroll is instant, so
 * there is no motion to suppress for people who ask for less; focus never moves (the button the person
 * pressed keeps it, and `role="alert"` still announces the text). The layout effect runs before paint, so
 * the page does not show the shifted content for a frame first. The screens clear `error` before every send,
 * so an identical rejection repeated later is a new null -> message change and scrolls again.
 *
 * Presentation only. It reads no game state and changes nothing about what is sent or received.
 */
export function CommandAlert({ error, failure }: CommandAlertProps): JSX.Element | null {
  const ref = useRef<HTMLParagraphElement>(null);
  const message = error ?? failure?.message;

  useLayoutEffect(() => {
    const element = ref.current;
    if (
      error &&
      element &&
      typeof element.scrollIntoView === "function" && // absent in jsdom and very old engines
      !element.closest("[inert]") // a sheet is open
    ) {
      element.scrollIntoView({ block: "nearest", inline: "nearest" });
    }
  }, [error]);

  if (!message) return null;
  return (
    <p role="alert" className="error-message" ref={ref}>
      {message}
    </p>
  );
}
