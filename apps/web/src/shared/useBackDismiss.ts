import { useEffect, useRef } from "react";

const MARKER = "digitableSheetBackDismiss";

/** Sheets currently relying on the history entry; the entry is retired only when this reaches 0. */
let active = 0;

/** `history.back()` calls we issued ourselves whose popstate has not arrived yet. */
let selfPops = 0;

/** popstate events produced by our own retirement (so a sheet that mounted meanwhile can tell). */
const selfEvents = new WeakSet<Event>();
let listening = false;

/**
 * One permanent listener, registered before any sheet's, so it runs first and consumes the
 * retirement popstate even when no sheet is mounted to see it (otherwise the counter would stay
 * raised and swallow the next real Back).
 */
function ensureListener(): void {
  if (listening) return;
  listening = true;
  window.addEventListener("popstate", (event) => {
    if (selfPops > 0) {
      selfPops -= 1;
      selfEvents.add(event);
    }
  });
}

function hasMarker(state: unknown): boolean {
  return typeof state === "object" && state !== null && MARKER in state;
}

/**
 * Makes the browser/OS Back gesture dismiss a pop-out instead of leaving the screen behind it.
 *
 * The app is a hash router, so with a sheet open Back would otherwise navigate away (losing the
 * sheet, its typed text and the console under it). While the sheet is mounted one same-URL history
 * entry is pushed; Back pops it and calls `onClose`. When the sheet closes any other way (Cancel,
 * Escape, Apply) the entry is retired with `history.back()` so the person's history is unchanged.
 * The hash does not change, so the router never sees any of this.
 *
 * Re-mounts (React StrictMode) reuse the existing entry, and the retirement is deferred a tick so a
 * remount cannot have its fresh entry popped by the previous mount's cleanup.
 *
 * Presentation only: no game state, projection or authorization is read or written.
 */
export function useBackDismiss(onClose: () => void): void {
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    ensureListener();
    if (!hasMarker(window.history.state)) {
      const current: unknown = window.history.state;
      const base = typeof current === "object" && current !== null ? current : {};
      window.history.pushState({ ...base, [MARKER]: true }, "", window.location.href);
    }
    active += 1;

    function onPopState(event: PopStateEvent): void {
      if (selfEvents.has(event)) {
        // Our own retirement of a previous sheet's entry, delivered after this sheet mounted: not a
        // Back press. Put this sheet's entry back, since the retirement just removed the shared one.
        if (!hasMarker(window.history.state)) {
          window.history.pushState({ [MARKER]: true }, "", window.location.href);
        }
        return;
      }
      // The entry we pushed is gone: this is Back (not a forward move onto some other entry).
      if (!hasMarker(window.history.state)) closeRef.current();
    }
    window.addEventListener("popstate", onPopState);

    return () => {
      window.removeEventListener("popstate", onPopState);
      active -= 1;
      window.setTimeout(() => {
        if (active === 0 && hasMarker(window.history.state)) {
          selfPops += 1;
          window.history.back();
        }
      }, 0);
    };
  }, []);
}
