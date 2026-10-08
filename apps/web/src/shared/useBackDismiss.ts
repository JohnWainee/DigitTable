import { useEffect, useRef, useState } from "react";
import { newUuid } from "./uuid.js";

/** Key under which a sheet's marker lives in `history.state`; only ever read back by this module. */
const HISTORY_KEY = "digitableSheet";

function markedBy(id: string): boolean {
  const state: unknown = window.history.state;
  return typeof state === "object" && state !== null && HISTORY_KEY in state
    ? (state as Record<string, unknown>)[HISTORY_KEY] === id
    : false;
}

/**
 * Makes the browser's Back action (the Android system Back button or gesture, an iOS Safari edge swipe,
 * the desktop Back button) dismiss an open pop-out instead of leaving the page.
 *
 * The app is a single-page hash router and a sheet is not a route, so with no history entry of its own
 * Back navigated away from the whole screen: a GM with a half-written correction reason lost the sheet,
 * the reason and the director console in one gesture and landed on the create-session form (measured in
 * real Chrome before this hook). While mounted this pushes ONE entry with the same URL (`pushState`
 * without a URL does not fire `hashchange`, so the router never sees it). Back then pops that entry:
 * `popstate` fires, the marker is gone, and `onClose` runs. Every other way out (Cancel, Apply, Escape)
 * drops the entry again with `history.back()` so a later Back does not land on a dead duplicate.
 *
 * Details that matter:
 * - The entry is released on a deferred tick that a re-run of the effect cancels: React StrictMode
 *   (development) mounts, unmounts and re-mounts every effect, and an immediate `history.back()` there
 *   would race the second `pushState` and close the sheet the instant it opened.
 * - It only calls `history.back()` while `history.state` still carries THIS sheet's marker. When
 *   something else replaced the entry (`replaceRoute`, a route change) or Back already popped it, the
 *   history belongs to someone else and is left alone.
 * - Stacked sheets each own a marker; Back closes only the top one (the others still find theirs).
 * - Leftovers are possible and harmless, each costing one extra Back press that visibly does nothing: a
 *   reload with a sheet open leaves its same-URL entry behind (its marker belongs to a dead page life, so no
 *   new sheet mistakes it for its own), and so does a sheet that closes while NOT on top (stacked sheets
 *   closing out of order, or a hash navigation while a sheet is open). The app has one modal sheet, so
 *   none of these is reachable by a person today.
 *
 * Presentation only: it reads and writes no domain state.
 */
export function useBackDismiss(onClose: () => void): void {
  // Unique per mount AND per page life: a counter restarts at 1 on reload, so it could match a stale marker
  // that a previous page life left in `history.state` and wrongly skip the push.
  const [id] = useState(() => `sheet-${newUuid()}`);
  const onCloseRef = useRef(onClose);
  const release = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (release.current !== undefined) {
      clearTimeout(release.current);
      release.current = undefined;
    }
    if (!markedBy(id)) window.history.pushState({ [HISTORY_KEY]: id }, "");
    function onPopState(): void {
      if (!markedBy(id)) onCloseRef.current();
    }
    window.addEventListener("popstate", onPopState);
    return () => {
      window.removeEventListener("popstate", onPopState);
      release.current = setTimeout(() => {
        release.current = undefined;
        if (markedBy(id)) window.history.back();
      }, 0);
    };
  }, [id]);
}
