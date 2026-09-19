# Independent staging playtest review

- **Date:** 2026-09-18
- **Target:** <https://powerglove-1cd23.web.app> (deployed from `d1294cc`), Firebase project `powerglove-1cd23`
- **Branch:** `factory/today-integration`
- **Reviewer:** Claude (Sonnet 5), fresh session; did not author the deployed code
- **Verdict:** **Pass.** The full GM, player, and table playthrough works on the deployed build. One responsive-overflow defect was found, fixed in source, and verified; the deployed build does not have that fix until it is redeployed. Six non-blocking findings (F2-F7) remain open for John.

## Method

All runs drove the real deployed app in headless Chrome over CDP, using isolated browser contexts (GM 1280x800, player 375x812 touch, table 1920x1080, plus extra contexts for a second player and a lost-identity visitor). Nothing was mocked. Each run created a fresh throwaway room on staging (about ten in total, throwaway passphrases, no real players); no cleanup tooling exists, so those rooms remain as test data.

1. `scripts/playtest/two-device-smoke.mjs --reload` against staging: full create, join, claim, table connect, declare, roll, allocate, resolve, pause/resume, end round, advance scene, five-width overflow sweep, player reload.
2. The same script with `--routes-only` (nine signed-out routes at four widths) and `--no-images` (all art requests blocked, to exercise fallbacks).
3. A supplementary scratch harness (not committed) covering what the script does not: wrong-passphrase and unknown-room errors, wrong table code and player-passphrase-as-table-code, GM and table reload, player reload while a declaration is pending and mid-allocation, GM reload while an action is pending, landing "Resume" for GM and player, a second player and seat contention, a lost-identity visitor, an accessibility probe (alt text, control labels, button names, title, lang), and a scan for secrets in storage, URLs, and visible text.
4. Screenshots were inspected for every surface and state (landing, create and join reveal cards, GM console before and after actions, player compose, allocation, resolved, paused, and post-reload, table idle, after-roll, next-scene, and two-player, the no-art variants, resume, and lost-identity). Not every one of the roughly 100 captured frames was opened individually; the automated overflow, image, and console checks covered all of them.

## Results on the deployed build

- Smoke: 14/14 steps passed. Every step of the phone-sized player flow, cross-device propagation (GM, player, table), pause propagation, scene advance, and player reload recovery worked.
- Console errors: none on any device in any run. Failed requests: none (the only failures in the `--no-images` run are the deliberately blocked art fetches).
- Horizontal overflow: none at 375, 768, 1024, 1280, 1920 for GM, player, and table in the smoke's own sweep (which runs after the scene advance, so it did not catch F1); none on any of the nine signed-out routes at four widths.
- Art: landing hero, both scene backgrounds, character portraits, and threat thumbnails all loaded (`naturalWidth > 0`, no broken images). With art blocked, the fallbacks (initials, gradient, icons) keep layout intact.
- Reload recovery: player (idle, declared, mid-allocation, post-resolution), GM (with an action pending), and table all restored their state with no re-entry of any code or passphrase. The claimed seat and dashboard survive reload.
- Negative paths: wrong passphrase and unknown room return distinct, plain errors with no secret leakage; the general passphrase cannot admit the table seat; a claimed character is shown as taken to a second player, who can claim another; the GM count and the table party update.
- Accessibility probe: no images without `alt`, no unlabeled controls, no unnamed buttons, `lang="en"`, viewport meta present, one `h1` on every screen except the player dashboard, which has none (F7).
- One-time secrets: room code, passphrase, table code, and recovery codes appear only on the reveal cards. None appears in any URL or (after "continue") in visible text, other than the room code the GM console displays deliberately. Passphrase and table code are not persisted (see F3 for what is).

## Findings

| # | Severity | Finding | Disposition |
| --- | --- | --- | --- |
| F1 | Medium (responsive) | GM director console scrolls horizontally by **40px at 375px** as soon as the opening scene is loaded, in every later state. `<select id="edit-target">` (Edit an Objective or Threat) is as wide as its longest option ("Objective: Get clear of the wreckage and into the streets") and a `<fieldset>` defaults to `min-width: min-content`. The smoke missed it because its overflow sweep runs after the scene advances to one with shorter option text. | **Fixed in source, not yet deployed.** `apps/web/src/styles.css`: `fieldset { min-width: 0 }` and `select { max-width: 100% }`. `two-device-smoke.mjs` gains a step that measures the GM console at 375px right after the opening scene loads. |
| F2 | Medium (UX) | Lost-browser recovery is a dead end in the UI. The connection strip says "Your seat is on another identity. Enter your recovery code," but there is no field, and no client code calls `recoverSeat` (the callable and its tests exist). The message also appears for a visitor who never had a seat. | Open. Needs a product decision: build the entry UI, or change the copy until it exists. Not a narrow fix. |
| F3 | Low/Medium (security hygiene) | The GM's and each player's recovery code are stored in plaintext in `localStorage` (`digitable.etr.ownership.v2`) and no UI ever reads them back. That contradicts the on-screen "shown once / nobody else can see it," and on a shared device it exposes a credential that hands over a seat (a stolen GM code is a permanent takeover per `docs/ARCHITECTURE.md` R4). It gives no recovery benefit: recovery is needed exactly when this storage is gone. Recorded as a deferred judgment call in the A03 review. | Open. Recommended small follow-up: stop persisting `recoveryCode` in `ownershipFromAcceptedWithNames` (`apps/web/src/session/ownership.ts`) and scrub existing records on read. Deliberately not changed here because it alters release behavior after the verified candidate. |
| F4 | Low (polish) | The document title on the live build is "Eat the Reich — Local fixture (not a live room)" (static in `apps/web/index.html`); the in-page banner is correctly hidden in live mode. | Open. Set the title conditionally on `isLiveMode`. |
| F5 | Low (copy) | The GM console Invite card says "Neither is shown again after creation" while displaying the room code beside it (only the passphrase is not shown). | Open. |
| F6 | Low (UX) | Landing "Resume" for a player who already claimed a character opens the character picker ("Yours" marked, other cards disabled) instead of the dashboard, costing one extra tap. Signed-out `/room/<id>/gm` shows "You can't do that from this seat," which is terse for a visitor. | Open. |
| F7 | Low (accessibility) | The player dashboard (compose, roll, and resolved states) renders no `h1`; its only page-level text is the live-region status line, so screen-reader heading navigation has no top-level landmark there. Not measured beyond the probe; a full axe pass on the deployed build was not run. | Open. |

## Verification of the F1 fix

- Confirmed the new smoke step fails on the unfixed deployed staging build (`GM console overflows by 40px at 375px`).
- Without deploying anything, built the patched web app to a scratch directory with the public staging web configuration (taken from the deployed bundle, not committed or logged) and served it on localhost. It talks to the staging backend.
- Full smoke with `--reload` against that build: **15/15 passed**, including the new step. A per-state probe of the phone-width GM (eight states: reveal, empty console, scene loaded, one claimed, pending, after roll, resolved, paused): **0px overflow in every state, no offending elements**. The supplementary harness: 12/12 passed. Screenshots show the select fitting inside its fieldset and the two-player table rendering correctly.
- `npm run check`: format, lint, typecheck, and **589 tests passed, 11 todo** (62 files passed, 1 skipped); unchanged from the recorded baseline. `npm run build`: passed with the existing large-chunk warning. The emulator suites were not rerun: no Functions, rules, contracts, or engine file changed.

## Independent second pass on the fix

A separate reviewer (fresh context, code-reading only) approved with nits. It confirmed the root-cause analysis from `SceneDirector.tsx`, found no other `fieldset` or `select` in `apps/web` that can clip or change appearance (none use `overflow: hidden`; the other selects list short character names), and confirmed the smoke step's viewport restore and threshold match the existing final sweep. Adopted: a one-line comment on the CSS so the rules are not removed as redundant. Not adopted: a `try/finally` around the viewport restore (a failing step aborts the run, so it is unreachable in practice). It did not render 768/1280/1920 for the changed rules; those widths were covered by this review's own sweep on the patched build.

## Limits of this evidence

- Isolated Chrome contexts on one machine, not physical devices: no real Wi-Fi/cellular, mobile browser chrome, touch ergonomics, or sleep/wake. The physical two-device rehearsal in `docs/RUNBOOK.md` section 8 remains open.
- Staging still serves the pre-fix build. Redeploying Hosting (`docs/RUNBOOK.md` section 3, step 4) is needed before F1 is fixed for anyone using the deployed URL; that decision was not made here.
- Emulator-suite and `npm audit` results were not regenerated.
