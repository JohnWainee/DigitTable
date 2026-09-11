# Claude implementation handoff

## Mission

Build DigiTable as a reusable narrative-RPG platform, with *Eat the Reich* as the first game template and Signal Bleed as a behavioral reference.

Do not port Signal Bleed wholesale. Its no-build, self-contained HTML architecture is a repository-specific constraint. Preserve the valuable product patterns—room codes, GM lock, public/shared state, private player state, GM-only state, lore outside sessions, local fallback, broadcasts, and explicit deploy/security checks—inside a typed, modular application.

## Read first

1. `docs/EAT_THE_REICH_BUILD_GUIDE.md`
2. `docs/TEMPLATE_ARCHITECTURE.md`
3. `docs/DATA_AND_SYNC_MODEL.md`
4. `docs/UX_RESOLUTION_THEATRE.md`
5. `docs/IMPLEMENTATION_ROADMAP.md`

Reference repository: `JohnWainee/signal-bleed`. Read its `AGENTS.md`, `README.md`, and `HANDOFF.md` before borrowing behavior.

## First implementation slice

1. Scaffold React + TypeScript + Vite with routing, tests, linting, formatting, and a PWA shell.
2. Define platform/template interfaces and runtime validation.
3. Implement local-only session state behind a repository abstraction.
4. Add one sample character, location, objective, and threat using original placeholder text/art.
5. Complete one action: choose action → derive pool → player roll → GM opposition → allocate dice → update state → append event.
6. Render it in player mobile view, GM console, and shared Resolution Theatre.
7. Add reduced-motion and quiet presentation modes immediately.
8. Only then add Firebase transport and reconnect handling.

## Required gates

- Unit tests for pure rules functions and allocation invariants.
- Integration tests for permissions and reconnect/idempotency.
- Browser tests at phone, tablet, and desktop widths.
- Keyboard and screen-reader access to every decision.
- Firebase rules tested in the emulator before deployment.
- Independent review before merging non-trivial changes.

## Sponsor decisions

- Distribution rights for game rules text, names, artwork, maps, and audio.
- Production Firebase and deployment credentials.
- Whether physical 3D dice belong in the first public milestone.
- Any public template marketplace or user-generated content sharing.

## First playable

Two players and one GM can join a room, load the sample encounter, resolve an opposed action, see synchronized state and presentation, reconnect without duplication, use safety controls, and review the session timeline.
