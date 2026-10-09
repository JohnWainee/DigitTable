import { useEffect, useRef } from "react";

/**
 * Browser/Android Back should dismiss an open pop-out, not leave the screen behind it.
 *
 * The app routes by `location.hash`, so without this a Back press with the correction sheet open
 * navigates away from the console and silently discards the sheet and whatever was typed in it.
 * While a sheet is open this module keeps one extra same-URL history entry per open sheet:
 *
 * - pressing Back lands on the entry below, `popstate` fires, and the newest sheet closes;
 * - closing the sheet any other way (Cancel, Apply, Escape) pops the now-unused entry again, so
 *   the history the person sees is exactly what it was before the sheet opened.
 *
 * Entries are reference counted at module level rather than pushed and popped per effect run,
 * because React StrictMode mounts, unmounts and remounts an effect in one task: the unmount only
 * schedules a settle step (a microtask), and the remount, finding its entry still on the stack,
 * simply reuses it. The URL never changes, so `hashchange` never fires and the router is not
 * disturbed. Presentation/navigation only; no game state, projection or authorization is touched.
 */

const MARKER = "digitableSheetEntry";

/** Close callbacks of the mounted sheets, oldest first. */
const holders: Array<{ readonly close: () => void }> = [];
/** History entries pushed by this module that are still on the stack. */
let ownedEntries = 0;
/** `history.go(-n)` calls issued by `settle` whose `popstate` must not be mistaken for a Back press. */
let selfPops = 0;
let listening = false;

function isOurs(state: unknown): boolean {
  return typeof state === "object" && state !== null && MARKER in state;
}

function onPopState(): void {
  if (selfPops > 0) {
    selfPops -= 1;
    return;
  }
  if (ownedEntries === 0) return;
  // A real Back press: the entry that was on top is gone, and the newest sheet gives way.
  ownedEntries -= 1;
  holders[holders.length - 1]?.close();
}

function ensureListener(): void {
  if (listening) return;
  window.addEventListener("popstate", onPopState);
  listening = true;
}

/** Drop history entries no mounted sheet needs any more (runs after React finished a commit). */
function settle(): void {
  const surplus = ownedEntries - holders.length;
  if (surplus <= 0) return;
  ownedEntries -= surplus;
  // Only walk the history back if the entries are still on top (a route change since would have
  // pushed a foreign entry above ours, and going back then would leave the wrong screen).
  if (isOurs(window.history.state)) {
    selfPops += 1;
    window.history.go(-surplus);
  }
}

export function useBackDismiss(onClose: () => void): void {
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const holder = { close: () => closeRef.current() };
    holders.push(holder);
    ensureListener();
    if (ownedEntries < holders.length) {
      window.history.pushState({ [MARKER]: true }, "");
      ownedEntries += 1;
    }
    return () => {
      const index = holders.indexOf(holder);
      if (index >= 0) holders.splice(index, 1);
      queueMicrotask(settle);
    };
  }, []);
}
