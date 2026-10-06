import { useEffect, useRef } from "react";

/**
 * Makes the browser/OS Back action close an open pop-out instead of leaving the screen.
 *
 * The app routes by URL hash (`router.tsx`), so with a sheet open and no history entry of its own,
 * Android Back or Safari's Back navigated from `#/room/<id>/gm` to the previous route: the sheet,
 * what had been typed into it, and the whole console were lost. While a sheet is open this hook
 * keeps ONE extra history entry at the same URL on top of the stack:
 *
 * - Back pops that entry, fires `popstate`, and the sheet is dismissed (the page stays put);
 * - closing by Apply, Cancel or Escape removes the entry again (`history.back()`), so the stack is
 *   left exactly as it was found and the visitor does not have to press Back twice later;
 * - if something else navigated away meanwhile (the top entry is no longer ours), nothing is popped.
 *
 * Ownership is tested by a token inside `history.state`, never by object identity: real browsers
 * hand back a structured CLONE of the state object, so `history.state === myObject` is always false
 * outside jsdom (an earlier draft compared identity, passed every jsdom test, and never popped its
 * entry in Chrome; `scripts/playtest/ui-audit.mjs` "back-closes-only-the-sheet" caught it).
 *
 * The entry has the same URL, so the hash router never sees a `hashchange`. One shared entry serves
 * all concurrently open sheets, and its removal is deferred one tick so React StrictMode's
 * mount/cleanup/mount in development reuses it instead of pushing a second one and popping it.
 *
 * Presentation only. No game state, projection or authorization is read or written here.
 */

let token: number | null = null;
let nextToken = 1;
let holders = 0;

function topEntryIsOurs(): boolean {
  const state: unknown = window.history.state;
  return (
    token !== null &&
    typeof state === "object" &&
    state !== null &&
    (state as { digitableSheet?: unknown }).digitableSheet === token
  );
}

export function useBackDismiss(onDismiss: () => void): void {
  const latest = useRef(onDismiss);
  useEffect(() => {
    latest.current = onDismiss;
  }, [onDismiss]);

  useEffect(() => {
    holders += 1;
    if (!topEntryIsOurs()) {
      token = nextToken;
      nextToken += 1;
      window.history.pushState({ digitableSheet: token }, "", window.location.href);
    }

    function onPopState(): void {
      // We are no longer on our entry: Back (or a swipe) popped it. Dismiss; the entry is gone.
      if (token !== null && !topEntryIsOurs()) {
        token = null;
        latest.current();
      }
    }
    window.addEventListener("popstate", onPopState);

    return () => {
      window.removeEventListener("popstate", onPopState);
      holders -= 1;
      if (holders > 0) return;
      setTimeout(() => {
        if (holders !== 0 || token === null) return;
        // Only pop an entry that is still the top one; never undo someone else's navigation.
        const ours = topEntryIsOurs();
        token = null;
        if (ours) window.history.back();
      }, 0);
    };
  }, []);
}
