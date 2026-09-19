import { useEffect } from "react";
import { isLiveMode } from "../session/roomClient.js";

export const LIVE_DOCUMENT_TITLE = "Eat the Reich";
export const FIXTURE_DOCUMENT_TITLE = "Eat the Reich — Local fixture (not a live room)";

/**
 * docs/ETR_SESSION_FLOW.md section 11 has a fixture build label itself
 * "Local fixture"; a live build must not (review F4). The static `<title>`
 * in `index.html` is the plain live title, so a live tab is correct before
 * any script runs; fixture mode adds the label at startup, following the
 * same `isLiveMode` switch that hides the in-page `FixtureModeBanner`.
 */
export function documentTitleFor(live: boolean): string {
  return live ? LIVE_DOCUMENT_TITLE : FIXTURE_DOCUMENT_TITLE;
}

export function useDocumentTitle(): void {
  useEffect(() => {
    document.title = documentTitleFor(isLiveMode);
  }, []);
}
