import { render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  FIXTURE_DOCUMENT_TITLE,
  LIVE_DOCUMENT_TITLE,
  documentTitleFor,
} from "../../src/shell/documentTitle.js";

/**
 * Review F4: the static `index.html` title read "Eat the Reich — Local
 * fixture (not a live room)" on the live build too. The title now follows
 * `isLiveMode`, the same switch that already hides the in-page fixture banner.
 */
describe("document title (F4)", () => {
  afterEach(() => {
    vi.resetModules();
    vi.doUnmock("../../src/session/roomClient.js");
    document.title = "";
  });

  it("is plain in live mode and labelled in fixture mode", () => {
    expect(documentTitleFor(true)).toBe(LIVE_DOCUMENT_TITLE);
    expect(LIVE_DOCUMENT_TITLE).toBe("Eat the Reich");
    expect(documentTitleFor(false)).toBe(FIXTURE_DOCUMENT_TITLE);
    expect(FIXTURE_DOCUMENT_TITLE).toMatch(/local fixture/i);
    expect(LIVE_DOCUMENT_TITLE).not.toMatch(/fixture/i);
  });

  it("labels the tab as a fixture when the app boots without Firebase configuration", async () => {
    const { App } = await import("../../src/App.js");
    window.location.hash = "#/";
    render(<App />);
    expect(document.title).toBe(FIXTURE_DOCUMENT_TITLE);
  });

  it("leaves the tab title plain when the app boots in live mode", async () => {
    vi.resetModules();
    vi.doMock("../../src/session/roomClient.js", async (importOriginal) => ({
      ...(await importOriginal<Record<string, unknown>>()),
      isLiveMode: true,
    }));
    const { App } = await import("../../src/App.js");
    window.location.hash = "#/";
    render(<App />);
    expect(document.title).toBe("Eat the Reich");
  });
});
