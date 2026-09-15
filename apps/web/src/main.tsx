import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.js";
import { bootstrapFirebase, type FirebaseBootstrapEnvironment } from "./firebase/bootstrap.js";

// Phase 2 PR 3: App Check monitoring (reCAPTCHA Enterprise) is initialized at
// startup, before any Firebase service is touched. A local-only build with no
// Firebase configuration returns null here and never loads a Firebase service.
// Vite types `import.meta.env` as an open string index; narrow it to the keys this seam reads.
bootstrapFirebase(import.meta.env as FirebaseBootstrapEnvironment);

const container = document.getElementById("root");
if (!container) {
  throw new Error("Missing #root element.");
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
