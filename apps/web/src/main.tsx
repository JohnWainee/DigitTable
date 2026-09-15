import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.js";
// C06: side-effect import only, so App Check/Firebase initializes exactly
// once at startup, before any Firebase service is touched, via the single
// shared instance `apps/web/src/session/roomClient.ts` also reads.
import "./session/firebaseBootstrap.js";

const container = document.getElementById("root");
if (!container) {
  throw new Error("Missing #root element.");
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
