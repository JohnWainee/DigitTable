import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { toHaveNoViolations } from "jest-axe";
import { afterEach, expect } from "vitest";

expect.extend(toHaveNoViolations);

// This project does not enable vitest's `globals`, so @testing-library/react's
// own automatic-cleanup registration (which relies on globals) never runs.
afterEach(cleanup);

// jsdom does not implement matchMedia; the app reads it for the
// prefers-reduced-motion preference (docs/UX_RESOLUTION_THEATRE.md).
if (typeof window !== "undefined" && typeof window.matchMedia !== "function") {
  window.matchMedia = (query: string): MediaQueryList => {
    const listeners = new Set<(event: MediaQueryListEvent) => void>();
    return {
      matches: false,
      media: query,
      onchange: null,
      addEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void): void => {
        listeners.add(listener);
      },
      removeEventListener: (
        _type: string,
        listener: (event: MediaQueryListEvent) => void,
      ): void => {
        listeners.delete(listener);
      },
      addListener: (): void => {},
      removeListener: (): void => {},
      dispatchEvent: (): boolean => true,
    } as MediaQueryList;
  };
}
