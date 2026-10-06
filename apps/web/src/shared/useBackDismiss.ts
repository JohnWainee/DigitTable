import { useEffect, useRef, useState } from "react";
import { newUuid } from "./uuid.js";

/** Key under which a sheet's marker lives in `history.state`; only read back by this module. */
const HISTORY_KEY = "digitableSheet";

function markedBy(id: string): boolean {
  const state: unknown = window.history.state;
  return typeof state === "object" && state !== null
    ? (state as Record<string, unknown>)[HISTORY_KEY] === id
    : false;
}

/**
 * Makes the browser Back action (Android system Back, iOS edge swipe, desktop Back) dismiss an open
 * pop-out instead of navigating the hash router away from the whole screen.
 *
 * A sheet is not a route, so without a history entry of its own Back used to destroy the sheet, any
 * half-typed reason and the console behind it at once. While mounted this pushes ONE entry with the
 * same URL (`pushState` without a URL fires no `hashchange`, so the router never sees it). Back pops
 * it: `popstate` fires, the marker is gone, and `onClose` runs. Every other exit (Cancel, Apply,
 * Escape) drops the entry again with `history.back()` so a later Back is not a dead duplicate.
 *
 * - The release is deferred a tick and cancelled by an effect re-run: StrictMode mounts, unmounts and
 *   re-mounts effects, and an immediate `history.back()` would race the second `pushState`.
 * - `history.back()` runs only while `history.state` still carries THIS sheet's marker; if something
 *   else replaced the entry (route change, `replaceRoute`) or Back already popped it, history is left alone.
 * - The marker is a per-mount uuid, so a stale marker from a previous page life never matches.
 * - Stacked sheets each own a marker, so Back closes only the top one.
 *
 * - Browsers may skip a `pushState` made without user activation (Chrome Android), so a sheet must be
 *   opened from a tap; a future sheet opened by a timer or realtime event would lose Back-dismiss.
 *
 * Presentation only: it reads and writes no domain state.
 */
export function useBackDismiss(onClose: () => void): void {
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
