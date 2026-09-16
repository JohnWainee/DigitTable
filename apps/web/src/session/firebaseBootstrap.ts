import {
  bootstrapFirebase,
  type FirebaseBootstrap,
  type FirebaseBootstrapEnvironment,
} from "../firebase/bootstrap.js";

/**
 * C06 (issue #14): the single place `bootstrapFirebase` is called, so it
 * runs exactly once regardless of how many modules need the result (Auth
 * throws if the same app name is initialized twice). `main.tsx` imports
 * this module for its side effect; `apps/web/src/session/roomClient.ts`
 * imports it to decide fixture vs. live mode and to get the `FirebaseApp`
 * live mode needs.
 */
export const firebaseBootstrap: FirebaseBootstrap | null = bootstrapFirebase(
  import.meta.env as FirebaseBootstrapEnvironment,
);
