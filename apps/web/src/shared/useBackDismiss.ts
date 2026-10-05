import { useEffect, useRef } from "react";

const STATE_KEY = "digitableSheet";

/** A pending release of the sheet's history entry, so a synchronous remount can adopt it. */
let release: { readonly timer: number; readonly id: string } | null = null;
let nextId = 0;
/** Sheets currently mounted (only they own a `digitableSheet` history entry). */
let mounted = 0;

/**
 * Makes the browser/OS Back control dismiss an open pop-out instead of leaving the screen.
 *
 * A sheet is a modal layer that is not part of the URL, so without this a single Back (Android
 * system Back, Safari's Back, a trackpad swipe) navigates the hash router away, destroying the
 * sheet and anything typed into it. While mounted this pushes one same-URL history entry; Back
 * pops it and `onClose` runs. When the sheet closes some other way (Cancel, Escape, Apply) the
 * unused entry is popped again so the history stays exactly as it was. The release is deferred one
 * tick so React StrictMode's mount/unmount/mount probe (and any quick remount) reuses the entry
 * instead of racing a `history.back()` against a fresh `pushState`.
 */
export function useBackDismiss(onClose: () => void): void {
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    let id: string;
    if (release) {
      window.clearTimeout(release.timer);
      id = release.id;
      release = null;
    } else {
      nextId += 1;
      id = `sheet-${nextId}`;
      const previous: unknown = window.history.state;
      const base = previous !== null && typeof previous === "object" ? previous : {};
      window.history.pushState({ ...base, [STATE_KEY]: id }, "");
    }
    let popped = false;
    mounted += 1;
    function onPopState(): void {
      popped = true;
      onCloseRef.current();
    }
    window.addEventListener("popstate", onPopState);
    return () => {
      window.removeEventListener("popstate", onPopState);
      mounted -= 1;
      if (popped) return;
      const timer = window.setTimeout(() => {
        release = null;
        const state: unknown = window.history.state;
        if (
          state !== null &&
          typeof state === "object" &&
          (state as Record<string, unknown>)[STATE_KEY] === id
        ) {
          window.history.back();
        }
      }, 0);
      release = { timer, id };
    };
  }, []);
}

/**
 * A history entry marked by a sheet that no longer exists (the page was reloaded, or the route
 * changed while the sheet was open and the person later came Back to it) would make Back a silent
 * no-op. The router calls this on every navigation and on start-up: with no sheet mounted it
 * strips the marker so that entry is an ordinary one again.
 */
export function dropStaleSheetEntry(): void {
  const state: unknown = window.history.state;
  if (mounted > 0 || release || state === null || typeof state !== "object") return;
  if (!(STATE_KEY in (state as Record<string, unknown>))) return;
  const { [STATE_KEY]: _marker, ...rest } = state as Record<string, unknown>;
  void _marker;
  window.history.replaceState(Object.keys(rest).length > 0 ? rest : null, "");
}
