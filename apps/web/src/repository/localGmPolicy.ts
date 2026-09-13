/**
 * Phase 1B ships no GM console (docs/IMPLEMENTATION_ROADMAP.md, Phase 1C is
 * where GM opposition controls arrive). To let the player flow reach a real
 * `ActionResolved` event end to end, `InMemoryRoomRepository` submits
 * `SubmitOpposition` on the GM's behalf using this fixed value instead of
 * exposing any opposition UI. This is a local-only stand-in for the judgment
 * call a human GM will make in Phase 1C, not game content, and it goes
 * through the same `authorizeGameAction`/`decide` pipeline a real GM command
 * would.
 */
export const LOCAL_GM_PUSH_DICE = 1;
