import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.js";
// C06: side-effect import only, so App Check/Firebase initializes exactly
// once at startup, before any Firebase service is touched, via the single
// shared instance `apps/web/src/session/roomClient.ts` also reads.
import "./session/firebaseBootstrap.js";
import { isLiveMode } from "./session/roomClient.js";

// c08 P2: `index.html`'s static <title> can't know the mode at build time
// (it's decided by `VITE_FIREBASE_*` env vars read at runtime); set the
// real one here, once, before the first render — a live session should
// never show "Local fixture" in the tab title.
document.title = `Eat the Reich — ${isLiveMode ? "Live session" : "Local fixture (not a live room)"}`;

const container = document.getElementById("root");
if (!container) {
  throw new Error("Missing #root element.");
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
