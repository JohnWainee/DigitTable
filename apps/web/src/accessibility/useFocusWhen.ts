import { useEffect, useRef, type RefObject } from "react";

/**
 * Moves keyboard/screen-reader focus to `ref` when `when` changes from false to true. For content
 * that replaces the control the person just used (a submitted form unmounts, so its focused button
 * vanishes and focus falls to `<body>`): the target must be focusable (`tabIndex={-1}` on a
 * heading, or a button).
 *
 * Only for changes the person caused (a submit, a tap on a mode switch): a component that mounts
 * with `when` already true does not take focus (a page that has just loaded keeps its natural
 * starting point), and staying true across re-renders never pulls focus back from where the person
 * has since moved it. Presentation only: no game state, projection, or authorization is involved.
 */
export function useFocusWhen(ref: RefObject<HTMLElement | null>, when: boolean): void {
  const wasTrue = useRef(when);
  useEffect(() => {
    if (when && !wasTrue.current) ref.current?.focus();
    wasTrue.current = when;
  }, [ref, when]);
}
