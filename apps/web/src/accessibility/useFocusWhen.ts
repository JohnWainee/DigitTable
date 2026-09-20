import { useEffect, type RefObject } from "react";

/**
 * Moves keyboard/screen-reader focus to `ref` when `when` becomes true. For content that replaces
 * the control the person just used (a submitted form unmounts, so its focused button vanishes and
 * focus falls to `<body>`): the target must be focusable (`tabIndex={-1}` on a heading).
 *
 * Only for changes the person caused (a submit, a tap on a mode switch), never on first render, so
 * it cannot pull focus away from a page that has just loaded. Presentation only: no game state,
 * projection, or authorization is read or written here.
 */
export function useFocusWhen(ref: RefObject<HTMLElement | null>, when: boolean): void {
  useEffect(() => {
    if (when) ref.current?.focus();
  }, [ref, when]);
}
