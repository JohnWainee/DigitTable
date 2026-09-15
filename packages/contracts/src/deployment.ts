/**
 * Board task A07 / `docs/PHASE_2_DECISION_BRIEF.md` Decision 1: the staging
 * Firebase project (`powerglove-1cd23`) runs Firestore in `us-west1`, and
 * `docs/ARCHITECTURE.md` section 12 calls for co-locating Functions with it.
 * 2nd-gen Cloud Functions default to `us-central1` when no region is named
 * on an individual callable, and the Functions client SDK defaults to the
 * same region when none is passed to `getFunctions` — either one drifting
 * from the other silently breaks every real callable invocation (the client
 * calls a region with nothing deployed to it) without failing any build or
 * test that only exercises the emulator, which ignores region entirely.
 *
 * Defined once, here, in the package both `apps/functions` (the deploy
 * target) and `apps/web` (the caller) already depend on, so the two can
 * never independently drift. RTDB presence (Phase 2 PR 5, not yet built)
 * stays in its existing `us-central1` location per the decision brief —
 * only Firestore and Functions co-locate.
 */
export const FUNCTIONS_REGION = "us-west1";
