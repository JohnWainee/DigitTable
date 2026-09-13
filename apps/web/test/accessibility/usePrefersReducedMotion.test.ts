import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { usePrefersReducedMotion } from "../../src/accessibility/usePrefersReducedMotion.js";

type ChangeListener = (event: { matches: boolean }) => void;

const originalMatchMedia = window.matchMedia.bind(window);

/**
 * A controllable `matchMedia` stand-in, since jsdom implements none and the
 * global `test/setup.ts` mock always reports `matches: false` with no way to
 * flip it. Lets a test drive a runtime OS-level preference change, not just
 * the value at mount (Phase 1B independent review follow-up: "Consider
 * explicit coverage for runtime reduced-motion preference changes").
 */
function installControllableMatchMedia(initialMatches: boolean): {
  fireChange: (matches: boolean) => void;
} {
  let matches = initialMatches;
  const listeners = new Set<ChangeListener>();

  window.matchMedia = ((query: string) => ({
    get matches() {
      return matches;
    },
    media: query,
    onchange: null,
    addEventListener: (_type: string, listener: ChangeListener) => {
      listeners.add(listener);
    },
    removeEventListener: (_type: string, listener: ChangeListener) => {
      listeners.delete(listener);
    },
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => true,
  })) as unknown as typeof window.matchMedia;

  return {
    fireChange: (next: boolean) => {
      matches = next;
      for (const listener of listeners) listener({ matches: next });
    },
  };
}

describe("usePrefersReducedMotion", () => {
  afterEach(() => {
    window.matchMedia = originalMatchMedia;
  });

  it("reflects the OS preference at mount", () => {
    installControllableMatchMedia(true);
    const { result } = renderHook(() => usePrefersReducedMotion());
    expect(result.current).toBe(true);
  });

  it("updates when the OS preference changes at runtime, without remounting", () => {
    const { fireChange } = installControllableMatchMedia(false);
    const { result } = renderHook(() => usePrefersReducedMotion());
    expect(result.current).toBe(false);

    act(() => {
      fireChange(true);
    });
    expect(result.current).toBe(true);

    act(() => {
      fireChange(false);
    });
    expect(result.current).toBe(false);
  });
});
