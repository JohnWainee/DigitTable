# Claude implementation handoff

- **Status:** The six playable character sheets now match the owner-supplied sourcebook roster (Iryna, Nicole, Cosgrave, Chuck, Astrid, and Flint), including equipment, abilities, advances, injuries, Last Stands, ability bonuses, and typed utility-item behavior. Commit `5e8907b` is deployed to Firebase Hosting and all five callable Functions at <https://digitable.signal-bleed.com>. A fresh-room deployed-staging smoke passed all 17 GM/player/table steps on 2026-09-21. A separate, independently reviewed UI/UX reskin hardening candidate is verified locally on `codex/uiux-reskin-20260920`; it is not deployed. Physical-device evidence remains open for John.
- **Branch:** `codex/uiux-reskin-20260920` (isolated worktree `/private/tmp/digitable-uiux-reskin-20260920`, based on `factory/today-integration` at `a350b2d`).
- **PRs:** [#13](https://github.com/JohnWainee/DigitTable/pull/13) (admission boundary), [#15](https://github.com/JohnWainee/DigitTable/pull/15) (A02 contracts), [#18](https://github.com/JohnWainee/DigitTable/pull/18) (A03 createRoom), [#23](https://github.com/JohnWainee/DigitTable/pull/23) (A04 game commands), [#27](https://github.com/JohnWainee/DigitTable/pull/27) (A05 client repository), [#30](https://github.com/JohnWainee/DigitTable/pull/30) (A06 partial: seat recovery), [#32](https://github.com/JohnWainee/DigitTable/pull/32) (A07 partial: region fix + operations runbook, stacked on the other six — see that PR's description for the stacking note). All open, none merged; merge authority is John's.
- **Last updated:** 2026-09-22 by Codex after fresh deployed-staging verification

## Mission

Build DigiTable as a reusable narrative-RPG play surface, with *Eat the Reich* as the first template and Signal Bleed as a behavioral reference.

Signal Bleed's useful patterns are room codes, GM-seat ownership, shared/GM/private state separation, lore outside sessions, local resilience, broadcasts, safety-minded play, and deliberate deploy controls. Do not port its self-contained HTML/no-build architecture.

## Current state

- **UI/UX reskin hardening candidate is ready for merge/redeploy decision, not deployed:** commits `40d83ab`, `fa939d7`, and `54dea79` add narrow mobile regression fixes after the reskin (typed-secret keyboard hints and normalization; create/join/recovery/table focus handoff; all-roster correction-sheet audit; styled utility actions; table-code whitespace normalization; and spent-item dimming). A final local browser audit at `docs/evidence/uiux-reskin-20260920/` recorded 189 states across seven viewports, 1,722 controls, zero gating control or overflow issues, and zero axe hard violations. See `docs/reviews/2026-09-20-uiux-reskin-hardening-review.md` for the fresh independent second pass.
- **Final local verification (rerun 2026-09-21):** `npm run check` exit 0 (708 passed, 11 todo; 75 passed files, 1 skipped), `npm run build` exit 0 (existing Vite chunk-size warning only), and `PATH=/opt/homebrew/opt/openjdk/bin:$PATH npm run test:emulator` exit 0 (18 testing-package, 86 Functions, 4 web emulator tests). The Functions workers emit non-fatal Admin-SDK metadata `ETIMEDOUT`/`ENOTFOUND` warnings in the sandbox; the suite still completes successfully.

- **Playable staging candidate is online:** Firebase Hosting, Firestore/RTDB rules, and the five `us-west1` callable Functions (`createRoom`, `admitMember`, `claimSeat`, `submitRoomCommand`, `recoverSeat`) are deployed to project `powerglove-1cd23`. Cloud Run invoker bindings were explicitly verified/repaired to permit unauthenticated transport to the callable boundary; every operation still requires and validates Firebase Auth inside the callable pipeline.
- **Sourcebook roster is production-ready in source:** all six supplied character sheets replace the placeholder roster while preserving stable character IDs for saved-room compatibility. Cigarettes and Cowboy Hat have player-facing marked-use mechanics, and Corpse Eater uses the printed any-1 trigger. Complete roster snapshot coverage and focused mechanics tests protect the source fields.
- **Live release verification passes:** at 2026-09-19T23:42Z, `two-device-smoke.mjs --reload` again passed all 17 GM/player/table steps against <https://digitable.signal-bleed.com>: create, isolated player/table admission, claim, opposed action, pause/resume, scene advance, role guidance, direct resume, reload recovery, original-art loading, zero console/request errors, and no horizontal overflow at 375/768/1024/1280/1920 px. Report/screenshots: `/private/tmp/digitable-hourly-staging-20260919-rerun/`. The deeper `ui-audit.mjs` run audited 150 states and 1,344 controls with zero control issues, overflow states, hard axe violations, or failures. One best-practice heading warning remains on the intentional nonexistent-room route; the documented 320 px + 200% text geometry limit remains non-gating.
- **Fresh staging rerun:** `node scripts/playtest/two-device-smoke.mjs --base https://digitable.signal-bleed.com --out /private/tmp/digitable-hourly-staging-20260920-rerun --reload --port 9444` passed all **17/17** steps at 2026-09-20T23:00Z. The new room completed GM creation, isolated player/table admission, claim, opposed action, pause/resume, scene advance, direct-resume and reload recovery; all GM/player/table responsive sweeps at 375/768/1024/1280/1920 px had no positive horizontal overflow. The report records zero console errors and failed requests; original hero/scene artwork loaded. This verifies the currently deployed pre-reskin build only; the independently reviewed reskin candidate remains unmerged and undeployed.
- **Fresh staging rerun (2026-09-21 HST):** the previously expected `digitable-staging-playthrough` session was absent and its leftover local artifact was a failure, so the smoke was rerun from this candidate as `node scripts/playtest/two-device-smoke.mjs --base https://digitable.signal-bleed.com --out /private/tmp/digitable-staging-playthrough-20260921 --reload --port 9445`. All **17/17** GM/player/table steps passed in 44 seconds: a new throwaway staging room completed create, player/table admission, character claim, opposed action, pause/resume, scene advance, direct resume and reload recovery. The run observed zero console errors, failed requests, or positive horizontal overflow across 375/768/1024/1280/1920 px; original hero and scene assets loaded. It is staging evidence for the deployed build, not evidence of a reskin deployment.
- **Fresh staging rerun (2026-09-22 HST):** the expected `digitable-staging-playthrough` Claude session remains absent, so its outcome is not inferred. A new direct run from this candidate, `node scripts/playtest/two-device-smoke.mjs --base https://digitable.signal-bleed.com --out /private/tmp/digitable-staging-playthrough-20260922-final --reload --port 9447`, completed all **17/17** GM/player/table steps in 44 seconds (14:28:50Z–14:29:33Z). It created a throwaway room, completed player/table admission, character claim, opposed action, pause/resume, scene advance, direct resume, and reload recovery. Console errors and failed requests were zero for all three devices; responsive overflow was non-positive at 375/768/1024/1280/1920 px (the table's -15 px value is spare viewport width). This is evidence for the deployed pre-reskin build only, not a reskin release.
- **Fresh staging rerun (2026-09-22 HST, hourly follow-up):** because the `digitable-staging-playthrough` session is still absent, the smoke was independently repeated from this isolated candidate: `node scripts/playtest/two-device-smoke.mjs --base https://digitable.signal-bleed.com --out /private/tmp/digitable-staging-playthrough-20260922-hourly-pty --reload --port 9453`. All **17/17** steps passed (23:40:45Z–23:41:22Z): create, isolated player/table admission, character claim, opposed action, pause/resume, scene advance, phone-width opening-scene check, cross-role responsive sweep, copy/title/role guidance, direct resume, and reload recovery. All three devices had zero console errors and failed requests; responsive overflow was non-positive at 375/768/1024/1280/1920 px (the table's -15 px is spare viewport width). This continues to validate the deployed pre-reskin build only; nothing was deployed or merged.
- **Fresh staging rerun (2026-09-22 HST, automation follow-up):** the expected `digitable-staging-playthrough` session remains absent, so the deployed build was exercised directly again from this candidate with `node scripts/playtest/two-device-smoke.mjs --base https://digitable.signal-bleed.com --out /private/tmp/digitable-staging-playthrough-20260922-automation --reload --port 9455`. All **17/17** GM/player/table steps passed in 49 seconds (00:40:39Z–00:41:28Z on 2026-09-23): fresh room creation, isolated player/table admission, character claim, opposed action, pause/resume, scene advance, direct resume, and reload recovery. All three devices reported zero console errors and failed requests; responsive overflow was non-positive at 375/768/1024/1280/1920 px (table -15 px is spare viewport width). This verifies the deployed pre-reskin build only; no build was deployed or merged.
- **Next action:** John decides whether to merge/redeploy the independently reviewed reskin candidate, then conducts the complete flow on two physical devices, including a lost-identity recovery attempt from a fresh/private browser, and records device/browser evidence. Do not promote to a separate production Firebase project without explicit direction.

### Final mobile audit (sonnet-h, 2026-09-20)

Branch `sonnet-h/reskin-final-mobile-audit`, from `factory/today-integration` at `a350b2d`. Record: [`docs/reviews/2026-09-20-final-mobile-audit-review.md`](docs/reviews/2026-09-20-final-mobile-audit-review.md); evidence with before/after reports and screenshots: [`docs/evidence/sonnet-h-reskin-audit/`](docs/evidence/sonnet-h-reskin-audit/README.md). **Not deployed; staging Hosting still serves the pre-fix build.** Merge and redeploy remain John's decisions.

- **Question:** does UI/UX/mobile-a11y work remain after the reskin, bottom sheet, overflow fix, recovery/title/copy/h1 fixes and sourcebook roster? **Answer:** the pop-outs themselves need no change (six native selects, one in-flow `<details>`, one `SheetDialog`; nothing else exists). Three narrow defects and one stale audit script were found, all from work that landed after the reskin was audited:
  1. `ui-audit.mjs` searched for the roster name "Rook" and died at 108 of 150 states on the shipped roster (the modal audit and later states silently stopped running). Fixed (first roster row).
  2. Iryna's Cigarettes action was an unstyled class-less `<button>` (grey browser default, 61×89 px, wrapped four lines) nested in a `<label>` beside a permanently disabled checkbox; utility items now render as a description plus a `secondary-action` button, no dead checkbox.
  3. The Cowboy hat's injury-panel button was class-less (30 px, grey); now `secondary-action`. New contract test forbids any class-less `<button>` except the +/- steppers.
  4. The recovery-code input lacked `autocapitalize`/`autocorrect`/`spellcheck` hints and sent the code verbatim although the server compares it case-exactly against an upper-case alphabet (an iPhone's default keyboard would make a correct code fail, and failures count toward the lockout); hints added and the code is trimmed and upper-cased on submit.
- **Audit additions:** a browser-default-button check, recovery-form states and hint assertions, and a 390×844 viewport (sweep and modal scenarios). Extended audit, 189 states × control/overflow/axe checks: **before 22 failures, after 0** (1,778 controls, 0 overflow states, 0 axe hard violations, 0 console errors; all seven modal scenarios pass including 390×844).
- **Commands and results (final code):** `npm run check` exit 0 (**697 tests passed | 11 todo**, 72 files passed, 1 skipped; baseline 690). `npm run build` exit 0 (existing chunk-size warning). `PATH=/opt/homebrew/opt/openjdk/bin:$PATH npm run test:emulator` exit 0 (**18** rules, **86** Functions, **4** web). `node scripts/playtest/ui-audit.mjs` against local emulators and a local `vite preview` build, before and after (see the evidence README for the recipe).
- **Independent second pass:** fresh-context agent, approve with nits, no blocker (details and dispositions in the review record). Its focus residual correction, the pool-eligible-with-effect fix, three extra tests and count corrections were adopted; those follow-up edits were verified by the gates and live audit, not re-reviewed.
- **Explicit limits:** all evidence is headless Chrome (touch and safe-area *emulated*) on one machine. **iOS Safari's visual-viewport-only keyboard cannot be produced in headless Chrome**: `useVisualViewportBox` is covered in jsdom and its `--vv-*` use by pinch-zoom scenarios in a real engine, but it has never run on a physical iPhone; nor has the recovery form's iOS field scrolling, and whether iOS honours `autocapitalize="characters"` is unobserved (the client normalisation makes the outcome independent of it). **No screen reader was run** (VoiceOver iOS/macOS, TalkBack, NVDA): accessible names/descriptions, live regions and focus order rest on axe-core, jest-axe and testing-library roles. No physical device: real thumb reach, the collapsing URL bar, and momentum scrolling are unmeasured. `docs/ARCHITECTURE.md` sections 13/16 still list the VoiceOver/iOS and NVDA/Windows manual flows as owed.
- **Residuals for John (not fixed):** no route- or view-level focus management anywhere (the recovery success card, like the create/join reveal cards, loses focus and its display-once code is outside a live region); the join screen's mode-switch button changes name in place; the modal audit opens only the first roster row's sheet; utility rows have no "not a die" visual cue; the pre-existing `page-has-heading-one` on the nonexistent-room route and the 320 px/200%-text non-gating case.
- **Next action for this lane:** John reviews/merges the branch, decides on a Hosting redeploy (`docs/RUNBOOK.md` section 3, step 4), then the physical-device rehearsal below should include: an iPhone keyboard-up pass on the GM correction sheet and the recovery form, and a VoiceOver pass over compose (utility rows), the injury choice, and recovery.

## Claude takeover checkpoint

Start in `/Users/john/Documents/ChatGPT/DigiTable/.claude/worktrees/today-integration` on branch
`factory/today-integration`. Run `git status --short --branch` and confirm the branch tracks
`origin/factory/today-integration` at or after `d1294cc`. Do not reconstruct the integration from the older stacked
branches; this branch is the reviewed, deployed aggregate.

The live staging URL is <https://powerglove-1cd23.web.app>, backed by Firebase project `powerglove-1cd23`.
Anonymous Auth must remain enabled. The callable Functions run in `us-west1`; their Cloud Run services require
public transport-level invocation (`allUsers` with `roles/run.invoker`), while every handler enforces Firebase
Auth and platform authorization internally. If a browser reports a generic callable failure before application
logs appear, inspect that IAM binding first. Do not commit Firebase web configuration in an environment file;
the public staging build values and deploy procedure are recorded in [`docs/RUNBOOK.md`](docs/RUNBOOK.md).

The last verified gates on the consolidated deployed candidate were:

- `npm run check` — on 2026-09-19, format, lint, typecheck, and **690 active tests passed** (11 todo; 71 files passed, 1 skipped), including complete roster fixture coverage and utility-item/Corpse Eater mechanics.
- `npm run build` — Functions and web production builds passed; Vite reports a non-blocking large-chunk warning.
- `PATH=/opt/homebrew/opt/openjdk/bin:$PATH npm run test:emulator` — 18 testing-package, 86 Functions, and 3 web emulator tests passed.
- `node scripts/playtest/two-device-smoke.mjs --base https://digitable.signal-bleed.com --out /private/tmp/digitable-hourly-staging-20260919-rerun --reload` — all 17 live GM/player/table steps passed at 2026-09-19T23:42Z; report captures zero console/request errors and no horizontal overflow at 375/768/1024/1280/1920 px.
- `node scripts/playtest/ui-audit.mjs --base https://powerglove-1cd23.web.app --label staging-consolidated --out /private/tmp/digitable-ui-audit-staging --no-shots` — 150 states and 1,344 controls audited; zero hard failures.
- Source changes had independent review on their source branches; the consolidated conflict resolution was verified by the complete gates and both live browser suites.
- F2/F3 closeout: `npm run check` passed with 681 tests and 11 todo; builds passed; emulator suites passed 18 rules + 86 Functions + 4 web tests, including live callable recovery/rotation/spent-code rejection. `npm audit --omit=dev` reports zero runtime vulnerabilities. Full audit retains only upstream Firebase CLI development-tool advisories; forced remediation would downgrade the CLI to 10.1.1 and break the current emulator/Functions workflow.
- Post-F2/F3 deploy: `/private/tmp/digitable-staging-smoke-8` passed every live GM/player/table step and all responsive checks.
- 2026-09-19 emulator rerun note: the 18 rules tests passed, but the Functions workers then emitted Admin-SDK metadata `ETIMEDOUT`/`ENOTFOUND` warnings and Firestore transaction-lock timeouts before producing a final total. A sandboxed retry could not bind the loopback emulator ports; an approved loopback-only retry reproduced the warnings. Treat the prior 18/86/3 result as the last complete emulator evidence, not this partial run; no source change was made.

The only release-evidence gap is a physical two-device rehearsal. After that rehearsal, fix and retest any found
issues, update this file and the deploy log, then commit and push verified changes. Do not merge the stacked PRs,
promote to production, provision paid resources, or create a production Firebase project without John's explicit
direction.

- Repository is initialized and connected to GitHub.
- Architecture work (PR #1, PR #2) is merged to `main`.
- **Phase 1A (scaffold and pure engine) is merged to `main`** (PR #3/#4), scoped exactly to `docs/IMPLEMENTATION_ROADMAP.md`'s Phase 1A and `docs/ARCHITECTURE.md` section 17's PR 1:
  - `AGENTS.md` added at the repo root.
  - npm workspace monorepo scaffolded: TypeScript (strict), ESLint 9 flat config with `typescript-eslint` type-checked rules plus `no-restricted-imports` guards against `react`/`firebase`/`three`, Prettier, and per-package Vitest configs wired through the root `vitest.config.ts`.
  - `packages/contracts`: branded IDs, stable error codes, `CommandEnvelope`/`EventEnvelope`, the bounded `AuthorityRecord<TState>` shape (256 KiB working budget / 1 MiB Firestore ceiling checks), the atomic per-viewer `ViewerProjection<TView>` shape (64 KiB ceiling check), the `RandomSource` interface, and the full `GameTemplate<TState, TCommand, TEvent, TView>` contract (`authorizeGameAction`, `decide`, `reduce`, `project`, `explainPool`, `validAllocations`, `theatre`, `migrate`).
  - `packages/engine`: platform authorization (membership/capability/room-status/payload-bounds/command-family guards, independent of any template), a seeded deterministic `RandomSource` (mulberry32 keyed by an FNV-1a-folded seed), `runCommand` (the pure command-run harness: authorization → `decide` → sequencing/envelope assignment → folding `reduce`), and `projectViewer` (wraps a template's raw `project` output into the full `ViewerProjection` envelope using `AuthorityRecord` version/revision metadata).
  - `packages/testing`: fixture builders, a template-agnostic `counterTemplate` fixture used to test the engine harness without any game content, and `findLeakedSecrets`/`collectStrings` — a reusable projection-isolation checker any template's tests can reuse.
  - `templates/eat-the-reich`: original placeholder content (character "Rook", location "Abandoned Métro Platform", objective "Silence the alarm...", threat "The Enforcer" — names match the already-approved placeholder art pack, no licensed text/mechanics), and a full pure implementation of one opposed action end to end: `BeginAction` → `ActionRolled` → `SubmitOpposition` → `OppositionRolled` → `AllocateResults` → `ActionResolved`. The threat carries a GM-only hidden difficulty modifier and hidden intel string that are folded into resolution but redacted from every non-GM event copy and projection (docs/ARCHITECTURE.md, N12).
  - **Contract refinements made during implementation** (not yet reflected in `docs/ARCHITECTURE.md`'s section 7 pseudocode, which was illustrative): `DecisionContext<TState>` also carries `actor: AuthorizedMemberContext`, because `authorizeGameAction` has no `state` and so cannot check entity ownership (e.g. "this roll belongs to this actor") — that check has to live in `decide`, which needs to know who is acting. `project` returns the raw `TView`, not a full `ViewerProjection<TView>`, because `TState` alone carries no `roomRevision`/version metadata; `@digitable/engine`'s `projectViewer` wraps it, mirroring how `decide` returns raw events that `runCommand` wraps into `EventEnvelope`s. Recommend folding both into `docs/ARCHITECTURE.md` section 7 on the next doc pass.
  - No application scaffold existed at merge time: no React/Vite client, no Firebase project, dependencies, or production credentials, and no licensed game text, art, or audio.
- The first independent Phase 1A implementation review is recorded in [`docs/reviews/2026-09-12-phase-1a-implementation-review.md`](docs/reviews/2026-09-12-phase-1a-implementation-review.md). Its six findings were remediated: the pure harness can return stored actor-private receipt results without rerolling, hidden-adjusted face counts are redacted outside the GM view, live rolls survive schema parsing/migration, duplicate allocation IDs are rejected, repeated gear IDs count once, and event/view parsers now validate their complete nested shapes. Regression coverage raised the suite to 111 tests, and the PR merged to `main` clean.
- The revised architecture selects trusted Firebase Functions as command authority, Firestore as transactional event/projection storage, and RTDB for ephemeral presence — all still deferred to Phase 2 per scope.
- **Phase 1B (player surface) is merged to `main`** (PR #7), scoped exactly to `docs/IMPLEMENTATION_ROADMAP.md`'s Phase 1B and `docs/ARCHITECTURE.md` section 17's PR 2. See "Second implementation PR: player surface (Phase 1B)" below for the full description, design decisions, and verification commands. Its independent review is recorded in [`docs/reviews/2026-09-13-phase-1b-implementation-review.md`](docs/reviews/2026-09-13-phase-1b-implementation-review.md): approved for merge, no blocking findings, with four non-blocking Phase 1C follow-ups (all addressed below).
- **Phase 1C (GM and shared views) is merged to `main`** (PR #5), scoped exactly to `docs/IMPLEMENTATION_ROADMAP.md`'s Phase 1C and `docs/ARCHITECTURE.md` section 17's PR 3, per `docs/PHASE_1C_PLAN.md`. See "Third implementation PR: GM and shared views (Phase 1C)" below for the full description, design decisions, and verification commands. Its independent review is recorded in [`docs/reviews/2026-09-13-phase-1c-implementation-review.md`](docs/reviews/2026-09-13-phase-1c-implementation-review.md): approved for merge, no blocking or non-blocking code findings.
- **Phase 2 preflight is complete on `main`** (merged from `worktree-phase2-preflight`), per `docs/ARCHITECTURE.md` section 17 step 4. See "Phase 2 preflight: contract re-evaluation before persistence" below.
- **Phase 2 PR 1 (repository interface + Firebase emulator harness) is complete on this branch** (`worktree-phase2-pr1`), scoped exactly to `docs/PHASE_2_PLAN.md`'s PR 1. See "Fourth implementation PR: repository interface and Firebase emulator harness (Phase 2 PR 1)" below.
- **Phase 2 PR 2 (Firestore data model and rules) is implemented on `worktree-phase2-pr2` and independently reviewed on this branch** (`claude/phase2-pr2-security-review-lexa32`). It adds the authority lifecycle fields, client-read security rules, and emulator allow/deny matrix described below; it does not add Functions, admission, or client reconnect/outbox behavior. The review approved it and applied two narrow remediations here (reserved-viewer hardening in `firestore.rules`; a fuller emulator matrix).
- **Phase 2 PR 3 (anonymous auth, code-plus-passphrase admission, and GM claim) is implemented on this branch** (`worktree-phase2-pr3-admission`), scoped exactly to `docs/PHASE_2_PLAN.md`'s PR 3. See "Sixth implementation PR: anonymous auth, admission, and GM claim (Phase 2 PR 3)" below for the full description, design decisions, and verification commands. Firebase CLI authentication previously verified access to staging project `powerglove-1cd23` and its `digitable-staging-web` app, with Anonymous sign-in already enabled in that project's console; this PR does not deploy to it (see that section's scope note on why a real deploy is not yet required).

## Read in this order

1. [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — canonical technical proposal and ADRs.
2. [`docs/EAT_THE_REICH_BUILD_GUIDE.md`](docs/EAT_THE_REICH_BUILD_GUIDE.md) — product experience and scope.
3. [`docs/UX_RESOLUTION_THEATRE.md`](docs/UX_RESOLUTION_THEATRE.md) — presentation and accessibility.
4. [`docs/TEMPLATE_ARCHITECTURE.md`](docs/TEMPLATE_ARCHITECTURE.md) — concise template boundary.
5. [`docs/DATA_AND_SYNC_MODEL.md`](docs/DATA_AND_SYNC_MODEL.md) — concise sync summary.
6. [`docs/IMPLEMENTATION_ROADMAP.md`](docs/IMPLEMENTATION_ROADMAP.md) — milestone view.

Also inspect `JohnWainee/signal-bleed` `AGENTS.md`, `README.md`, and `HANDOFF.md` for reference behavior. Its repository instructions apply only inside that repository.

## First review and resolution

Claude's independent review is recorded by commit `4324ecb` on branch `claude/codex-handoff-review-bc3ucm`. Every finding is dispositioned in [`docs/reviews/2026-09-12-architecture-review-resolution.md`](docs/reviews/2026-09-12-architecture-review-resolution.md). The principal changes are:

- Firestore is authoritative and transactional; RTDB is presence-only.
- Stable member seats decouple private data and GM ownership from anonymous UIDs.
- Safety actors and receipts are anonymous/private by construction.
- Viewer projections are authoritative; event tails do not reconstruct client state.
- Platform authorization and template mechanics are separate contracts.
- Accessibility verification and presentation semantics are explicit.
- The original vertical-slice PR is split into three reviewable PRs.

## Second architecture review and resolution

Claude's second pass is commit `868c75c` on PR #2. It approved the direction and identified N1–N12: the undefined authority record, projection tearing, invalid/inconsistent Firestore paths, RTDB presence authorization, recovery hardening, retry-stable randomness, and smaller safety, privacy, routing, bandwidth, factual, and pool-explanation issues. John approved the updated plan on 2026-09-12. Their dispositions are recorded in [`docs/reviews/2026-09-12-architecture-second-pass-resolution.md`](docs/reviews/2026-09-12-architecture-second-pass-resolution.md) and folded into the canonical architecture.

Implementation may begin after these documentation changes pass review and merge.

## First implementation PR after approval: scaffold and engine — DONE (merged to `main`)

Scope was a local-only vertical slice:

1. ✅ Add `AGENTS.md` with architecture/handoff and independent-review expectations.
2. ✅ Scaffold npm workspaces, TypeScript, Vitest, ESLint, and formatting without React or Firebase.
3. ✅ Create `contracts`, `engine`, `testing`, and the initial-template package.
4. ✅ Use original placeholder data for one character, location, objective, and threat.
5. ✅ Implement pure `decide`, `reduce`, `project`, `explainPool`, and `validAllocations` for one opposed action with a fixed-seed deterministic generator.
6. ✅ Include bounded authority-record and atomic per-viewer projection fixtures in the contracts.

### Required checks — all pass locally

- `npm run format` (Prettier check) — clean.
- `npm run lint` (ESLint 9, `typescript-eslint` type-checked rules) — clean, zero warnings.
- `npm run typecheck` (`tsc --noEmit` in all 4 workspaces) — clean.
- `npx vitest run` — **111/111 tests pass** across 19 test files after review remediation:
  - `packages/contracts`: 11 tests (authority/projection budget checks, dice-draw ordering, decision/authorization helpers).
  - `packages/engine`: 19 tests (seeded-RNG determinism/retry-stability/range, platform authorization's denial/allow branches, `runCommand` sequencing/reduction/per-destination redaction, and stored-receipt duplicate suppression without another draw).
  - `templates/eat-the-reich`: 81 tests — including regression coverage for hidden face-count inference, live-roll schema round trips, complete event/view structural validation, duplicate allocation IDs, and repeated gear IDs, plus the existing 200-run projection-isolation property.
- No React, Firebase, Three.js, licensed source assets, marketplace, tactical grid, or generic rules DSL were introduced (verified by dependency grep across every `package.json`).
- No production credentials of any kind exist in this repository.

### Contract refinements made during implementation

`docs/ARCHITECTURE.md` section 7's `GameTemplate` pseudocode was illustrative, not exhaustive, and needed two concrete additions to actually implement:

- `DecisionContext<TState>` gained `actor: AuthorizedMemberContext`. `authorizeGameAction` never receives `state`, so it cannot check entity-scoped ownership (e.g. "AllocateResults may only be submitted by the roll's own actor"); `decide` has `state` but the doc's original `DecisionContext` had no actor identity to check it against. Without this, "player cannot allocate another player's roll" (docs/ARCHITECTURE.md section 13's required proof) had no function capable of enforcing it.
- `project(state, viewer)` now returns the raw `TView`, not a full `ViewerProjection<TView>`. `TState` alone carries no `roomRevision` or version metadata (those live one level up, on `AuthorityRecord`), so a template literally cannot construct a complete `ViewerProjection` from `state` alone. `@digitable/engine`'s new `projectViewer(template, authority, viewer)` wraps the raw view into the full envelope — the same split `decide`/`runCommand` already use for events (`decide` returns raw `TEvent`s; `runCommand` wraps them into `EventEnvelope`s with sequence/revision).

Recommend folding both into `docs/ARCHITECTURE.md` section 7 on the next documentation pass; nothing about the wire format, security model, or data model changed.

## Second implementation PR: player surface (Phase 1B) — DONE (merged to `main`)

Scope was exactly `docs/IMPLEMENTATION_ROADMAP.md`'s Phase 1B and `docs/ARCHITECTURE.md` section 17's PR 2: React/Vite, an in-memory repository behind the same `runCommand`/`projectViewer` contract, the full accessible local player flow, and phone-width keyboard/reduced-motion/axe checks. No GM console, shared-table UI, Firebase/realtime, 3D, licensed content, or second template.

1. ✅ `apps/web`: a new npm workspace (React 18 + Vite 8 + TypeScript, strict) added alongside `packages/*` and `templates/*`. `eslint.config.js`'s `no-restricted-imports` guard against `react` now scopes to `packages/**`/`templates/**` only (Firebase/Three.js stay repo-wide restricted); `apps/web/**` gets `eslint-plugin-react-hooks` and `eslint-plugin-jsx-a11y`'s recommended rule sets.
2. ✅ `apps/web/src/repository/InMemoryRoomRepository.ts`: holds one `AuthorityRecord<EatTheReichState>` in memory (no persistence, no Firebase) and dispatches every command through the exact same `@digitable/engine` `runCommand`/`projectViewer` pipeline a trusted server will later run, per `docs/DATA_AND_SYNC_MODEL.md`'s "the local vertical slice implements the same repository interface in memory/local storage." Generates one `crypto.getRandomValues` seed per command (browser analogue of ADR-002's `crypto.randomBytes`), keeps a per-member receipt map for idempotent retries, and calls `authorizeGameAction`/`decide`/`reduce` only through `runCommand` — no reimplemented mechanics.
3. ✅ **Local GM stand-in (a deliberate, documented scope decision):** Phase 1B ships no GM console (that's Phase 1C), but the roadmap's player flow requires a real "wait for opposition" state to resolve. `apps/web/src/repository/localGmPolicy.ts` documents a fixed `SubmitOpposition` push-dice value the repository submits on the GM's behalf, through the identical `authorizeGameAction`/`decide` path a real GM command would use — it is a local-only stand-in for a human judgment call, not game content, not a GM UI, and not exposed to the player. `usePlayerActionFlow` owns *when* to trigger it (a short, reduced-motion-aware presentation delay so `waiting-on-gm` is genuinely experienced as its own semantic state per `docs/UX_RESOLUTION_THEATRE.md`, not skipped).
4. ✅ Full player flow (`apps/web/src/player/`): compose (action + gear selection) → explain pool (a native `<details>`/`<summary>` "Why?" disclosure, keyboard-operable with no bespoke ARIA) → roll → wait for opposition → allocate (a custom accessible spinbutton control, `AllocationStepper`, with tap +/- buttons and full Arrow/Home/End keyboard support) → confirm, matching `docs/UX_RESOLUTION_THEATRE.md`'s state machine and `docs/EAT_THE_REICH_BUILD_GUIDE.md`'s player flow.
5. ✅ **Phone-width keyboard behavior:** allocation input is a custom `role="spinbutton"` control (not a native `<input type="number">`) specifically so it never summons the on-screen keyboard on a phone for what's always a small integer count — it's driven by tap or by Arrow/Home/End keys either way. No text entry exists anywhere in the player flow. Verified at a 375px viewport in `apps/web/test/player/PlayerFlow.a11y.test.tsx`.
6. ✅ **Reduced-motion support:** `usePrefersReducedMotion` (a `useSyncExternalStore` over `matchMedia`) shortens (never zeroes) the `waiting-on-gm` presentation delay and the global stylesheet collapses `animation`/`transition` durations under `prefers-reduced-motion: reduce`.
7. ✅ **Automated accessibility checks:** `jest-axe` (`toHaveNoViolations`, wired into Vitest's matcher types via `apps/web/test/vitest-axe.d.ts`) runs against the compose step, the full keyboard-only playthrough, and the resolved step; `@testing-library/user-event` drives every flow test via `.focus()` + `.keyboard()` only, never a click, except in `AllocationStepper.test.tsx`'s dedicated tap-vs-keyboard comparison.

### Required checks — all pass locally

- `npm run format` (Prettier check) — clean.
- `npm run lint` (ESLint 9) — clean, zero warnings, across all workspaces including `apps/web`.
- `npm run typecheck` (`tsc --noEmit` in all 5 workspaces, `apps/web` included) — clean.
- `npm run test` — **127/127 tests pass** across 22 test files (111 carried over from Phase 1A plus 16 new in `apps/web`: 7 repository tests exercising the real `runCommand`/`projectViewer` pipeline end to end including projection-isolation and invalid-allocation rejection, 5 `AllocationStepper` tests covering tap, full keyboard operation, ARIA value exposure, and effective-max clamping, and 4 `PlayerFlow` tests covering axe violations, the "Why?" disclosure, a complete keyboard-only compose→confirm playthrough, and play-again reset).
- `npm run build` — clean; `apps/web` builds via `vite build` (verified the built `dist/` serves correctly under `vite preview`).
- No Firebase, Three.js, GM console, shared-table view, or second template were introduced.

### Vitest configuration after the security rebase

The branch is rebased onto the dependency-security remediation from PR #6. Vitest 5 uses the
root `vitest.config.ts` `test.projects` list, including `apps/web/vitest.config.ts`; the web
project sets its own root and jsdom/setup configuration. Root test scripts can therefore use
plain `vitest run`/`vitest` while retaining all project-specific settings.

## Third implementation PR: GM and shared views (Phase 1C) — DONE (this branch)

Scope was exactly `docs/IMPLEMENTATION_ROADMAP.md`'s Phase 1C and `docs/ARCHITECTURE.md` section 17's PR 3, per `docs/PHASE_1C_PLAN.md`: GM opposition controls (replacing Phase 1B's timed local GM stand-in with real human GM commands), a read-only shared-table capability, multi-role local simulation, and desktop-width tests, completing one opposed roll/allocation flow across all three views. No Firebase/realtime, encounter authoring, safety controls, GM overrides, 3D, licensed content, or second template were introduced.

1. ✅ **Replaced the local GM stand-in with real GM opposition controls.** `apps/web/src/repository/InMemoryRoomRepository.ts`'s `simulateOpposition` (a fixed-value, timer-triggered stand-in) and `localGmPolicy.ts` are gone. A new `submitOpposition(rollId, pushDice)` method dispatches `SubmitOpposition` as the GM member through the exact same `dispatch`/`runCommand` path every other command uses. `apps/web/src/gm/GmScreen.tsx` (a new `/room/:roomId/gm`-equivalent surface, simulated locally per `docs/ARCHITECTURE.md` section 6) renders the GM's own `ViewerProjection<EatTheReichView>` — full threat list including `ThreatGmSummary`'s hidden fields, the active roll's un-redacted `playerFaces`/`hiddenDifficultyModifier` — and a push-dice control (the existing `AllocationStepper`, moved to `apps/web/src/shared/` and reused as-is, bounded by a newly-exported `MAX_PUSH_DICE` from `templates/eat-the-reich/src/engine.ts` instead of a duplicated magic number) wired to `submitOpposition`. `apps/web/src/gm/useGmFlow.ts` owns the GM's projection subscription and dispatch-result handling.
2. ✅ **Read-only shared-table surface.** `apps/web/src/table/TableScreen.tsx` (a new `/room/:roomId/table`-equivalent surface) renders the `table` capability's projection — public character/threat summaries, the active roll without GM-only fields, `self` always null — via `apps/web/src/table/useTableProjection.ts`. It renders no buttons, inputs, or other controls anywhere, and no Pause/Fade/Veil/Skip (not yet implemented anywhere in the current command surface). `InMemoryRoomRepository.getGmProjection()`/`getTableProjection()` build the `{ viewerId: "gm" | "table", capability: "gm" | "table" }` viewer contexts directly (matching `templates/eat-the-reich/test/fixtures.ts`'s `GM_VIEWER`/`TABLE_VIEWER` pattern), distinct from the GM's own dispatch-time member ID.
3. ✅ **Multi-role local simulation.** One `InMemoryRoomRepository` instance is shared by all three surfaces: `apps/web/src/App.tsx` is now a local tab switcher (Player/GM/Table) over one repository instance, standing in for real per-role routing until Phase 2. `apps/web/test/multiRole/MultiRoleFlow.test.tsx` renders `PlayerScreen`, `GmScreen`, and `TableScreen` concurrently against one shared repository and drives the full `BeginAction` (player) → `SubmitOpposition` (GM) → `AllocateResults` (player) flow, asserting each surface's DOM only ever shows what its own projection contains at each step. A dedicated regression test (`attemptCommandAsTable`, a test-support-only repository method mapping a fixed member to the `table` capability) proves a table-attributed command is rejected by platform authorization through the same dispatch path, not merely omitted from the table UI.
4. ✅ **Projection isolation (extended).** `templates/eat-the-reich/test/multiRoleProjectionIsolation.property.test.ts` is a new property test that runs the actual `BeginAction`/`SubmitOpposition`/`AllocateResults` command sequence through `runCommand` with randomized hidden threat data and push-dice values (50 runs), asserting after every accepted command that `table` never carries hidden fields, `gm` is the only viewer that does, player-vs-GM isolation is unweakened by the added viewers, and all three projections stay within the 64 KiB ceiling (`checkProjectionBudget`). This is additive to, not a replacement for, the existing single-scenario `projectionIsolation.property.test.ts`.
5. ✅ **Responsive accessibility.** `GmScreen`/`TableScreen` reuse Phase 1B's `LiveRegion` and `usePrefersReducedMotion`/reduced-motion CSS harness (no second accessibility configuration). `apps/web/test/gm/GmScreen.test.tsx` and `apps/web/test/table/TableScreen.test.tsx` add `jest-axe` checks at both the existing 375px phone-width breakpoint and a new 1280px desktop-width breakpoint (chosen because none is named in `docs/ARCHITECTURE.md`/`docs/UX_RESOLUTION_THEATRE.md`; `docs/PHASE_1C_PLAN.md` flagged this as an open pick), plus keyboard-only operability of the GM's push-dice control and a polite live region announced once per `docs/UX_RESOLUTION_THEATRE.md`.
6. ✅ **Phase 1B independent review follow-ups, all addressed:**
   - "Replace the timed local GM stand-in with human opposition controls" — done (item 1 above); `usePlayerActionFlow.ts` no longer runs a `setTimeout`-based delay at all, since `waiting-on-gm` is now a genuine wait on another surface's action reflected live through `repository.subscribe`.
   - "Surface opposition-dispatch failures in the player UI" — `InMemoryRoomRepository` gained `subscribeToErrors`, broadcasting every rejected dispatch (from any role) to subscribers; `usePlayerActionFlow` shows the GM's dispatch failures as the same top-level alert used for the player's own failures (`apps/web/test/player/PlayerFlow.a11y.test.tsx`, "surfaces an opposition-dispatch failure instead of waiting silently forever").
   - "Consider explicit coverage for runtime reduced-motion preference changes" — added: `apps/web/test/accessibility/usePrefersReducedMotion.test.ts` drives a controllable `matchMedia` mock through a runtime `change` event (jsdom's own mock in `test/setup.ts` can't flip `matches`, so this test installs its own and restores it afterward).
   - "Preserve the existing engine-level idempotency guarantees when Phase 2 adds reconnect/outbox behavior" — unaffected by this PR; no change to command-ID minting.
7. ✅ **Contract refinements folded into `docs/ARCHITECTURE.md`.** Section 7's `GameTemplate` pseudocode now shows `DecisionContext<TState>`'s `actor` field and `project`'s raw-`TView`-plus-`projectViewer`-wrapper split explicitly, both flagged as outstanding since Phase 1A. No change to the wire format or security model — see the note appended to that section.

### Required checks — all pass locally

- `npm run format` (Prettier check) — clean.
- `npm run lint` (ESLint 9) — clean, zero warnings, across all workspaces.
- `npm run typecheck` (`tsc --noEmit` in all 5 workspaces) — clean.
- `npx vitest run` — **161/161 tests pass** across 28 test files (127 carried over from Phase 1A/1B plus 1 new in `templates/eat-the-reich` and 33 new in `apps/web`): the new template test is the multi-role projection-isolation property test (item 4 above); the new `apps/web` tests cover `GmScreen`/`useGmFlow` (hidden-field rendering, keyboard-operable opposition dispatch, engine-driven status, dispatch-failure surfacing, phone/desktop axe), `TableScreen` (public-only rendering, no controls, no safety controls, live status, stale-mount regression, phone/desktop axe), the multi-role integration flow, the reduced-motion runtime-change hook test, and updated repository/player-flow tests reflecting the real GM dispatch path.
- `npm run build` — clean; `apps/web` builds via `vite build` (verified the built `dist/` serves correctly under `vite preview`, HTTP 200).
- `npm audit` — 0 vulnerabilities.
- `git diff --check` — clean.
- No Firebase, Three.js, encounter authoring, safety controls, GM overrides, 3D, licensed content, or second template were introduced. `packages/contracts`, `packages/engine`, and `templates/eat-the-reich`'s pure functions are unchanged except the additive `MAX_PUSH_DICE` export noted above.
- Not independently verified in a real browser this session (no browser tool available); the automated suite above exercises the full rendered DOM (via `@testing-library/react` + `jsdom`) for every surface and the full multi-role flow, including `jest-axe` checks, so this substitutes for but does not replace a manual pass before merge.

## Phase 2 preflight: contract re-evaluation before persistence — DONE (this branch)

Scope was exactly `docs/ARCHITECTURE.md` section 17 step 4 ("Independently review and adjust contracts before persistence"), run before any Phase 2 implementation per its precondition. No Firebase package, credential, project, or persistence code was touched; this is a documentation-only branch.

1. ✅ **Independent contract re-evaluation:** [`docs/reviews/2026-09-13-phase-2-preflight-review.md`](docs/reviews/2026-09-13-phase-2-preflight-review.md) re-reads the actual merged Phase 1A–1C code (not just the architecture pseudocode) against repository boundaries, command receipts/idempotency, member-seat binding, projection atomics, recovery, authorization, failure semantics, and the emulator-test seam. It dispositions the architecture third-pass review's six still-open findings (R1–R6, all now folded into `docs/ARCHITECTURE.md` by this same branch) and records nine new findings (P1–P9) found only by reading the shipped code: most substantively, that command IDs are currently minted server-side inside `InMemoryRoomRepository.dispatch()` rather than by the caller (P1), which means the engine's already-correct idempotent-retry path (`runCommand`'s `priorReceipt` short-circuit) is currently unreachable from any UI code path and must be fixed by making `commandId` a caller-supplied outbox concern before `FirebaseRoomRepository` exists; and that no repository interface is yet an explicit contract, only one concrete synchronous implementation (P8). No blocking defect was found in the merged code.
2. ✅ **Documentation-only architecture corrections**, folding in the architecture third-pass review's R1–R6 (recorded there as "ride the next documentation edit"): `docs/ARCHITECTURE.md` section 8 now specifies the `uidBindings/{uid}` reverse index Firestore rules need to establish room membership from a UID alone (R1), states that `authority/current` carries `roomStatus`/`gmMemberId` directly as the transaction's serialization point with `meta/current` as a synced mirror (R2), fixes the `receiptId` scheme to `${memberId}_${commandId}` (R6), and states the GM-lockout, GM-code-theft, and old-UID-presence-recreation residuals explicitly (R3–R5). These are documentation corrections only — the corresponding `packages/contracts` shape changes (e.g. `AuthorityRecord` gaining `roomStatus`/`gmMemberId`) are deliberately deferred to Phase 2 PR 2, not made here.
3. ✅ **Phase 2 implementation plan:** [`docs/PHASE_2_PLAN.md`](docs/PHASE_2_PLAN.md) splits `docs/ARCHITECTURE.md` section 17 steps 5–6 into seven reviewable PRs (repository interface + emulator harness; Firestore data model + rules; anonymous auth + admission + GM claim; the transactional command-authority Function; RTDB presence; recovery-code redemption; client reconnect/outbox), each scoped like the Phase 1A–1C PRs (own tests, own review, land before the next starts). It includes a 22-row acceptance/failure-injection matrix combining `docs/ARCHITECTURE.md` sections 11/13's required proofs with concrete failure injections (duplicate command, concurrent invocation, disconnect-after-submit, stale revision, recovery lockout, kick), each mapped to the PR that first makes it testable.
4. ✅ **Decision brief for John:** [`docs/PHASE_2_DECISION_BRIEF.md`](docs/PHASE_2_DECISION_BRIEF.md) covers the three "before realtime implementation" decisions from `docs/ARCHITECTURE.md` section 16 — Firebase region/project separation, room join policy, and retention/export/deletion values — with options, tradeoffs, and a recommendation for each, plus the specific open questions only John can answer (e.g. what happens after a 90-day archive prompt goes unanswered).
5. ✅ **First safe implementation slice identified:** `docs/PHASE_2_PLAN.md`'s PR 1 (repository interface + Firebase emulator harness) and PR 2 (Firestore data model + security rules) need none of the three decisions above and can start in the Emulator Suite immediately — both run entirely against local emulators with a placeholder project ID. PR 3 onward (real project creation, the actual join/admission flow) waits on the decision brief.

### Required checks — all pass locally

- `npm install` (this worktree had no `node_modules` before this session; a clean install is required and is unaffected by the documentation-only changes here).
- `npm run format` (Prettier check) — clean.
- `npm run lint` (ESLint 9) — clean, zero warnings.
- `npm run typecheck` (`tsc --noEmit` in all 5 workspaces) — clean.
- `npx vitest run` — **161/161 tests pass** across 28 test files, unchanged from the Phase 1C merge (no source files were touched).
- `npm run build` — clean.
- `npm audit` — 0 vulnerabilities.
- `git diff --check` — clean.
- No Firebase, Three.js, or persistence-layer code was introduced; `packages/contracts`, `packages/engine`, `apps/web`, and `templates/eat-the-reich` are byte-for-byte unchanged from `main`. Only `docs/ARCHITECTURE.md`, `CLAUDE_HANDOFF.md`, and three new `docs/` files changed.

## Fourth implementation PR: repository interface and Firebase emulator harness (Phase 2 PR 1) — DONE (this branch)

Scope was exactly `docs/PHASE_2_PLAN.md`'s PR 1: extract an explicit, async `RoomRepository` contract closing preflight findings P1 (commandId minted server-side, making idempotent retry unreachable) and P8 (no repository interface, only one implicit concrete class); retrofit `InMemoryRoomRepository` and the player/GM hooks onto it without regressing any Phase 1 flow; add a minimal Firebase Emulator Suite harness using only the `demo-digitable` placeholder project ID. No Firestore data model, security rules (beyond a placeholder default-deny rule set so the emulators can boot), Functions, auth/admission, presence, recovery, or client reconnect/outbox implementation — all explicitly excluded per `docs/PHASE_2_PLAN.md`'s PR boundaries.

1. ✅ **`RoomRepository` contract** (`packages/contracts/src/repository.ts`): `dispatch(memberId, { commandId, payload, expectedRevision? })` returns `Promise<RoomCommandResult<TEvent>>` (`{ status: "accepted", commandId, roomRevision, sharedEvents }` or `{ status: "rejected", commandId, code, message }`); `getProjection`/`subscribeToProjection` are the async, per-viewer read/listen primitives a real backend needs. `commandId` is a required, caller-supplied field on the request — the exact contract-shape fix P1 called for: "the interface decision should be made when the shared repository interface is extracted (PR 1)." `RoomDispatchFailure` (used by `subscribeToErrors`) moved here from `apps/web` for the same reason: a `FirebaseRoomRepository` needs the identical broadcast shape.
2. ✅ **`InMemoryRoomRepository` retrofit** (`apps/web/src/repository/InMemoryRoomRepository.ts`): the class now `implements RoomRepository<EatTheReichCommand, EatTheReichEvent, EatTheReichView>` (a structural, compiler-checked conformance proof). Its own `dispatch()` is the sole command-execution path; the existing `beginAction`/`submitOpposition`/`allocateResults`/`attemptCommandAsTable` convenience methods now take a caller-supplied `commandId: CommandId` first parameter and return `Promise<RoomCommandResult<EatTheReichEvent>>` instead of minting a UUID internally and returning synchronously. The receipt-key separator changed from `:` to `_` (`${memberId}_${commandId}`), matching the `receiptId` scheme the Phase 2 preflight review's R6/P2 findings fixed in `docs/ARCHITECTURE.md` section 8, so a future `FirebaseRoomRepository`'s receipt lookup is written against the same key shape from the start. `getPlayerProjection`/`getGmProjection`/`getTableProjection` stay as synchronous convenience getters (not part of the interface) so no UI call site needed to change shape for projection reads — only command dispatch needed the async/caller-ID fix.
3. ✅ **Where `commandId` is minted**: at the point a member commits to an action, inside `usePlayerActionFlow`/`useGmFlow` (a `newCommandId()` helper calling `crypto.randomUUID()` via `asCommandId`), immediately before calling the repository — not inside the repository. This is deliberately *only* the contract seam, not a full outbox: nothing here yet persists a commandId client-side or resubmits it on retry (that's Phase 2 PR 7, "client reconnect and outbox," per the plan). What this PR proves is that the seam is real: `apps/web/test/repository/InMemoryRoomRepository.test.ts`'s "commandId is a caller-supplied outbox concern" tests resubmit the exact same `commandId` twice and assert the retry reaches `runCommand`'s `priorReceipt` short-circuit (packages/engine/src/runCommand.ts) — no second decision, no further randomness drawn, room revision unchanged. (One nuance recorded in that test: `AcceptedCommandReceipt` stores only accepted sequence numbers, not event payloads, so a retry's `sharedEvents` comes back empty rather than duplicating the original — reconstructing a retry's events from stored history is PR 7's job, not this one's.)
4. ✅ **Hooks stay `void`-returning at the UI boundary.** `usePlayerActionFlow`/`useGmFlow`'s exposed callbacks (`beginAction`, `allocate`, `submitOpposition`) keep their existing synchronous `(...) => void` signatures — no screen component (`PlayerScreen`, `GmScreen`, `ComposeStep`, `ActiveRollPanel`) changed at all. Internally each callback mints a `commandId`, calls the now-async repository method, and updates `errorMessage`/`resolvedSummary` state from the resolved `RoomCommandResult` via `.then()` (explicitly `void`-prefixed, satisfying `@typescript-eslint/no-floating-promises`). This kept the blast radius to the repository, the two flow hooks, and their tests — no component/JSX changes were needed to add the async seam.
5. ✅ **Firebase Emulator Suite harness** (`packages/testing/src/emulator.ts`, `firebase.json`, `.firebaserc`, `firestore.rules`, `database.rules.json`): `.firebaserc` pins the project to `demo-digitable` — the Emulator Suite's documented `demo-` prefix convention, which the emulators treat as an offline fake project regardless of whether a real project by that name exists, so no real Firebase project, credential, or production resource is ever created or contacted. `firestore.rules`/`database.rules.json` are explicit, clearly-labeled **placeholders** (default-deny) that exist only so the emulators can boot for this PR's connectivity proof — the real room data model and security rules are Phase 2 PR 2's job, not reinterpreted or pulled forward here. `createEmulatorTestEnvironment()` wraps `@firebase/rules-unit-testing`'s `initializeTestEnvironment`; `isAuthEmulatorReachable()` does a plain `fetch` against the Auth emulator's documented config endpoint (no Auth-specific test environment exists in `@firebase/rules-unit-testing`, and admission/auth flows are Phase 2 PR 3's job, correctly out of scope here).
6. ✅ **Emulator smoke test** (`packages/testing/test-emulator/emulatorHarness.smoke.test.ts`, run via `npm run test:emulator` → `firebase emulators:exec --project demo-digitable "npm run test:emulator --workspace @digitable/testing"`): proves the Auth emulator is reachable, that the placeholder Firestore/RTDB rules actually take effect (`assertFails` on an unauthenticated write to each), and that a trusted (`withSecurityRulesDisabled`) context round-trips a read/write against each — "a trivial read/write round-trips against the emulator," exactly as `docs/PHASE_2_PLAN.md` specifies for this PR. This suite has its own Vitest project (`packages/testing/vitest.emulator.config.ts`) deliberately **not** listed in the root `vitest.config.ts`'s `test.projects` — it requires the Firestore/RTDB emulators (and therefore a JVM) running, unlike every other suite in the repo, so it must never run as part of the default `npm run test`.
7. ✅ **ESLint's Firebase guard, tightened and scoped.** The prior `no-restricted-imports` rule only blocked the bare `"firebase"` specifier (a gap: `@firebase/*`-scoped imports like `@firebase/rules-unit-testing` weren't covered at all). It now also blocks `firebase-admin` and every `firebase/*`/`@firebase/*` subpath via a `patterns` restriction, repo-wide, with one explicit carve-out: `packages/testing/src/emulator.ts` and `packages/testing/test-emulator/**` are the only files allowed to import Firebase packages. `packages/contracts`, `packages/engine`, `templates/*`, and the rest of `apps/web` remain fully Firebase-free, matching `AGENTS.md`'s framework-independence boundary.

### Required checks — all pass locally

- `npm install` (fresh worktree; also added root devDependency `firebase-tools`, and `packages/testing` devDependencies `firebase`/`@firebase/rules-unit-testing`/`vitest`).
- `npm run format` (Prettier check) — clean.
- `npm run lint` (ESLint 9) — clean, zero warnings, across all workspaces.
- `npm run typecheck` (`tsc --noEmit` in all 5 workspaces, including `packages/testing`'s new `test-emulator/` and `vitest.emulator.config.ts`) — clean.
- `npx vitest run` — **157/157 tests pass** across 28 test files (unchanged file count from Phase 1C; 2 new tests added to `InMemoryRoomRepository.test.ts`'s idempotent-retry coverage plus 2 new `RoomRepository` contract-conformance tests, offset by no removals).
- `npm run build` — clean; `apps/web` builds via `vite build`.
- **`npm run test:emulator`** (`firebase emulators:exec --project demo-digitable ...`) — **5/5 tests pass**: Auth emulator reachable; Firestore and RTDB placeholder rules both reject an unauthenticated write; a trusted context round-trips a read/write against both. Required a JDK in this sandbox (installed via `brew install openjdk` with John's explicit approval, since the Firestore/RTDB emulators are Java-based and none was present) — the Auth emulator itself is Node-based and needs no JVM.
- `npm audit` — **not clean**: 9 moderate-severity advisories, all transitive dependencies of `firebase-tools` itself (`@opentelemetry/core`, `csv-parse`, `qs` (via `express`), `stream-json`, `uuid` (via `gaxios`) — none reachable from this project's own code or from `apps/web`'s production bundle, which remains dependency-clean per `vite build`'s output). Every advisory's non-breaking fix was already applied (`npm audit fix`); the remainder require downgrading `firebase-tools` to `10.1.1` (a 5-major-version regression, `npm audit fix --force`), which was **not** applied — that would trade a real capability regression (this PR's whole purpose) for advisories in dev-only CLI tooling (CSV import, pub/sub, HTTP client internals) this project never exercises. Recommend re-checking on `firebase-tools`' next release rather than downgrading.
- `git diff --check` — clean.
- No Firestore data model, security rules beyond the explicitly-labeled PR 1 placeholder, Cloud Functions, auth/admission, RTDB presence, recovery-code redemption, or client reconnect/outbox implementation were introduced. `packages/engine` and `templates/eat-the-reich`'s pure functions are byte-for-byte unchanged.
- Not independently verified in a real browser this session (no browser tool available); `apps/web`'s existing `jest-axe`/`@testing-library/react` suite (now exercising the async dispatch path throughout) substitutes for, but does not replace, a manual pass.

## Fifth implementation PR: Firestore data model and security rules (Phase 2 PR 2) — MERGED to `main` (PR #12)

Scope is exactly `docs/PHASE_2_PLAN.md` PR 2. This change replaces PR 1's default-deny placeholders with the resolved, read-only client access model. It does not introduce a Cloud Function, anonymous-auth admission flow, a real Firebase project, or a Firebase-backed client repository.

1. `AuthorityRecord` now carries `roomStatus` (`active` or `archived`) and `gmMemberId`, making the architecture's transaction serialization requirement compiler-visible. All representative authority fixtures and the local repository's initial record include these fields, so the existing budget tests continue to cover the persisted shape.
2. `firestore.rules` implements the resolved `uidBindings/{uid}` reverse-index check. A signed-in member can read the public room mirror, roster, shared events, and only their own member projection, receipt, and private event partition. GM and table reserved projections/event partitions require their matching capability. `authority`, bindings, reverse bindings, snapshots, room codes, and all direct client writes are denied.
3. `database.rules.json` permits authenticated reads of opaque room-level presence and permits writes only at `presence/{roomId}/{auth.uid}/{connectionId}`. It intentionally does not duplicate Firestore membership data, preserving the documented limited-presence-disclosure residual.
4. `packages/testing/test-emulator/roomRules.test.ts` adds the PR 2 emulator matrix: own-versus-other player projection/receipt/private-event isolation, GM/table capability isolation, authorized shared reads, service-only path denial, universal direct-Firestore-write denial (including a table-attributed command surrogate), and UID-owned RTDB presence writes. Together with the harness smoke suite, this was **10/10** emulator tests at `a40e7dc`; the review branch extends the matrix to **16/16** (see the review outcome below).

### Required checks — all pass locally

- `npm run check` — formatting, lint (zero warnings), typecheck, and **157/157** default tests across 28 files passed.
- `npm run build` — passed (`vite build`).
- `PATH=/opt/homebrew/opt/openjdk/bin:$PATH npm run test:emulator` — **10/10** tests passed against the local `demo-digitable` Auth, Firestore, and RTDB emulators.
- `git diff --check origin/main...HEAD` — clean before the handoff update; rerun before commit.
- `npm install` repaired a pre-existing lockfile omission for `packages/testing`'s declared `vitest` devDependency; it did not change requested dependency versions.

## Sixth implementation PR: anonymous auth, admission, and GM claim (Phase 2 PR 3) — READY FOR JOHN'S MERGE DECISION (this branch)

Scope is exactly `docs/PHASE_2_PLAN.md` PR 3, revised during review to also host the trusted `apps/functions` codebase (ADR-001) rather than deferring it to PR 4. Two `onCall` callables, `admitMember` and `claimSeat` (`apps/functions/src/callables.ts`), wrap an Admin-SDK transaction (`apps/functions/src/admissionAuthority.ts`) behind the pipeline App Check monitoring → auth required → payload validation → per-IP/per-UID throttle → transaction. A separate `admission/tableSecret` document is the only secret that admits the table seat; the general room passphrase can never satisfy it. Every persisted document the transaction reads (authority, room-code index, uid binding, secret hash, throttle counter) is runtime-validated and fails closed (`ROOM_DATA_INVALID`) rather than defaulting. A bound UID must still present the current secret before a reclaim is honored, including after rotation. `apps/web/src/firebase/appCheck.ts` uses the Enterprise reCAPTCHA provider, wired from a new `apps/web/src/firebase/bootstrap.ts` startup seam; a local-only build without Firebase config touches no Firebase service. Room creation itself (minting the initial code/passphrase/table code and the empty GM seat) is not in this PR's scope — see board task A03.

### Required checks — all pass locally

- `npm run check` — formatting, lint (zero warnings), typecheck, and **283/283** default tests across 38 files passed.
- `npm run build` — passed (`apps/functions` esbuild bundle, 23.1kb; `apps/web` vite build).
- `PATH=/opt/homebrew/opt/openjdk/bin:$PATH npm run test:emulator` — **54/54** tests passed (16 in `packages/testing`, 38 in `apps/functions`) against the local `demo-digitable` Auth, Firestore, and RTDB emulators.
- `git diff --check origin/main...HEAD` — clean.
- `npm audit` — 13 moderate advisories repository-wide, none high/critical, all in the `firebase-tools`/`firebase-admin` dependency trees (see the second-pass review's residual R6 for the one advisory genuinely reachable from the Function's dependency tree).

### Independent reviews

1. First independent review: five blockers, dispositioned in [`docs/reviews/2026-09-14-phase-2-pr3-review-resolution.md`](docs/reviews/2026-09-14-phase-2-pr3-review-resolution.md) (residuals R1–R7).
2. Second independent pass over the remediation (two reviewers in fresh contexts, with emulator probes): [`docs/reviews/2026-09-14-phase-2-pr3-second-pass-review.md`](docs/reviews/2026-09-14-phase-2-pr3-second-pass-review.md). No blocking finding; six Medium findings (spoofable IP key, no enumeration bound, absent `gmMemberId` reopening the GM seat, unconstrained room-code characters, deploy manifest, `meta/current` merge) and the Low ones are fixed on this branch with tests.
3. Third independent pass (board task A01, a fresh reviewer subagent given only the branch and the architecture invariants): [`docs/reviews/2026-09-14-phase-2-pr3-third-pass-independent-review.md`](docs/reviews/2026-09-14-phase-2-pr3-third-pass-independent-review.md). Re-verified callable auth/throttle ordering, fail-closed persisted-data validation, separate table admission, secret-on-reclaim ordering, and Enterprise App Check monitoring against the actual code (not just the prior reviews' claims) — no blocking finding. One Low, non-blocking, cosmetic finding (a recovery-code alphabet comment claimed 32 symbols; the literal alphabet is 31, still ~64.4 bits, clearing the required >=64-bit floor) fixed on this branch with no behavior change.

Merge remains John's decision.

## Eighth implementation PR: integration contracts (board task A02) — READY FOR JOHN'S MERGE DECISION

`sonnet-a/a02`, PR #15, commit `af20261`, branched from `origin/main` (does not depend on PR #13 merging first — publishable and mergeable independently). Adds `packages/contracts/src/session.ts` (create/join/claim-GM-seat request and result shapes, viewer routing, client-side pending/accepted/rejected/disconnected request state, local-only session ownership record, runtime-validating `parseCreateRoomInput`), `packages/engine/src/queryProjection.ts` (the "game projection selectors" a UI binds a template's read-only queries to one fetched projection), fixture builders, and the required milestone-adjustment record (`docs/IMPLEMENTATION_ROADMAP.md` + a dated `docs/reviews/` note) pulling character/scene tools forward into this sprint per John's 2026-09-14 direction. `npm run check`: pass, 172/172 tests across 30 files. `npm run build`: pass. Not independently reviewed as its own slice (a pure-contracts, no-runtime-behavior addition); its content was subsequently exercised and extended by A03's own independent review.

## Ninth implementation PR: secure createRoom (board task A03) — READY FOR JOHN'S MERGE DECISION

`sonnet-a/a03`, PR #18, commit `b1bbca8` (stacked on PR #13's branch with PR #15 merged in — see PR #18's description for the stacking note; retarget to `main` once #13 and #15 merge). Adds a third callable, `createRoom`, to the trusted `apps/functions` boundary: one Firestore transaction atomically provisions the room-code index, the hashed room passphrase, a separate system-generated table credential, `authority/current` (ETR preselected, `participantCount: 1` for the seated GM), its `meta/current` mirror (including the creator's `sessionName`), the GM's binding/uidBinding/member/recovery documents, and the GM's own initial isolated projection. Idempotent on a client-minted, UID-scoped `requestId` via `createRoomReceipts/{requestId}`; room-code collision is checked transactionally with bounded regeneration; a UID-scoped replay reads the room's live `roomRevision` rather than a hardcoded value. A second, independent throttle (per-UID/per-IP) gates creation. `templates/eat-the-reich/src/engine.ts`'s `initialState` now tolerates zero player members (only the GM seat exists at creation) — backward-compatible, flagged for Sonnet B's awareness since that module is B's.

### Required checks — all pass locally

- `npm run check` — formatting, lint (zero warnings), typecheck, and **306/306** default tests across 43 files passed.
- `npm run build` — passed (`apps/functions` esbuild bundle 70.7kb; `apps/web` vite build).
- `PATH=/opt/homebrew/opt/openjdk/bin:$PATH npm run test:emulator` — **72/72** tests passed (16 `packages/testing`, 56 `apps/functions`).
- `npm audit` — 13 moderate, unchanged from A01's baseline.
- `git diff --check` — clean.

### Independent review

One round: [`docs/reviews/2026-09-14-a03-createroom-independent-review.md`](docs/reviews/2026-09-14-a03-createroom-independent-review.md). No blocking finding in the security-relevant guarantees (atomicity, collision safety, secret handling, privilege/injection safety, throttling, rules enforcement — all independently verified PASS with test evidence). One process-blocking finding (a formatting check that hadn't been re-run after the last file was added — fixed) and three substantive findings, all fixed with tests: idempotency receipts were not scoped to the calling UID (fixed — `ROLE_FORBIDDEN` on a UID mismatch, which also corrected a test that had inadvertently exercised the insecure cross-identity case as the happy path), the validated `sessionName` was silently discarded (fixed — persisted to `meta/current`), and a replay hardcoded `roomRevision: 0` (fixed — reads the live value). One judgment call (a client's own recovery code persisted in `localStorage` until board task A06 consumes it) recorded as an explicit A06 follow-up rather than an A03 defect.

Merge remains John's decision.

## Tenth implementation PR: trusted game-command authority (board task A04) — READY FOR JOHN'S MERGE DECISION

`sonnet-a/a04`, PR #23, commit `1113209` (stacked on PR #18's branch — see PR #23's description for the stacking note; retarget to `main` once #13, #15, and #18 merge). Adds a fourth callable, `submitRoomCommand`, implementing `docs/PHASE_2_PR4_PLAN.md`'s design for the current template's three commands (`BeginAction`, `SubmitOpposition`, `AllocateResults`). One transaction per invocation: resolve capability from `uidBindings` only (checked immediately — `AUTH_REQUIRED` before any other read) → prior-receipt lookup → full `authority/current` read (`parseAuthorityRecord`, fail-closed) → every live binding read (before any write) → `expectedRevision` check → platform authorization, using the client's own asserted `templateId`/`templateVersion` (`WireCommandRequest`) checked against the room's live values → command parse → `runCommand` → atomic writes of authority, receipt, every event's destination-partitioned copy, and every live viewer's projection (via `projectViewer`, matching the reserved `"gm"`/`"table"` viewer-ID convention). Idempotent both ways: an accepted retry short-circuits; a rejected retry replays the identical stored `code`/`message`. Seed generated once per invocation outside the transaction, reused across internal retries, never logged. `commandId` is UUID-shape-validated; `roomId` gets the same character-safety pattern `admission.ts`'s room codes use.

Explicitly out of scope for this PR (documented, not silently dropped): synthetic revision-gated/anonymous-actor fixture-command tests (no current ETR command is revision-gated or anonymous) and Firestore write-count/size worst-case budget assertions (today's commands stay far under those limits).

### Required checks — all pass locally

- `npm run check` — formatting, lint (zero warnings), typecheck, and **321/321** default tests across 43 files passed.
- `npm run build` — passed (`apps/functions` esbuild bundle 91.6kb; `apps/web` vite build).
- `PATH=/opt/homebrew/opt/openjdk/bin:$PATH npm run test:emulator` — **89/89** tests passed (16 `packages/testing`, 73 `apps/functions`).
- `npm audit` — 13 moderate, unchanged from A01's baseline.
- `git diff --check` — clean.

### Independent review

One round: [`docs/reviews/2026-09-14-a04-gamecommand-independent-review.md`](docs/reviews/2026-09-14-a04-gamecommand-independent-review.md). No blocking finding — all 10 required verification items passed with direct code-path tracing. One Medium finding (client template-version assertion was previously unreachable, so `TEMPLATE_VERSION_MISMATCH` could never fire — fixed) and three Low findings (hand-duplicated projection assembly instead of reusing `projectViewer`; `commandId`/`roomId` only length-bounded, not character-restricted; authority/bindings validation could throw before the `AUTH_REQUIRED` check), all fixed with regression tests.

Merge remains John's decision.

## Eleventh implementation PR: live client repository (board task A05) — READY FOR JOHN'S MERGE DECISION

`sonnet-a/a05`, PR #27, commit `2ac90f4` (stacked on PR #23's branch — see PR #27's description for the stacking note; retarget to `main` once #13, #15, #18, #23 merge). The client half of A01/A03/A04's trusted authority: `FirebaseSessionClient` (create/join/claim, wrapping A01/A03's callables behind A02's client contracts) and `FirebaseRoomRepository` (the real `RoomRepository` — `dispatch` via `submitRoomCommand` with the client's own asserted template identity; `getProjection`/`subscribeToProjection` via direct Firestore reads/listeners on `rooms/{roomId}/projections/{viewerId}`, never `authority/current` or an event tail). Found and fixed a real gap while wiring this: neither `admitMember` nor `claimSeat` returned `roomId` or `roomRevision`, and `roomCodes/{code}` is service-only — `AdmissionAccepted` now carries both, server-resolved, at all three construction sites in `admissionAuthority.ts`. `anonymousAuth.ts`'s sign-in helpers now take an explicit `FirebaseApp` instead of silently resolving to the process-wide default. Infrastructure: the Functions emulator now starts for `npm run test:emulator` (`firebase.json`) — the first time any test in this repository has driven it over real HTTP transport. `apps/web` gains its own opt-in emulator suite (`vitest.emulator.config.ts` + `test-emulator/session.test.ts`).

Known, documented, out-of-scope gap (not fixed here): the current pre-B02 template never connects "a player joined" to "a character exists" — that's Sonnet B's B02/B03 `ClaimCharacter` rework. The integration test seeds a placeholder character directly past `firestore.rules` (matching `admission.test.ts`'s own fixture pattern) purely to exercise the real accepted-command path end to end.

### Required checks — all pass locally

- `npm run check` — formatting, lint (zero warnings), typecheck, and **325/325** default tests across 43 files passed.
- `npm run build` — passed (`apps/functions` esbuild bundle 92.1kb; `apps/web` vite build, no Firebase/test-emulator code in the production bundle — verified by grep).
- `PATH=/opt/homebrew/opt/openjdk/bin:$PATH npm run test:emulator` — **92/92** tests passed (16 `packages/testing`, 73 `apps/functions`, 3 `apps/web` — the new suite genuinely drives `createRoom` → `admitMember` → `submitRoomCommand` (accepted) → projection read end to end through the real emulators, plus a live `onSnapshot` proof and a real `ROOM_NOT_FOUND` rejection proof).
- `npm audit` — 13 moderate, unchanged from A01's baseline.
- `git diff --check` — clean.

### Independent review

One round: [`docs/reviews/2026-09-14-a05-client-repository-independent-review.md`](docs/reviews/2026-09-14-a05-client-repository-independent-review.md). No hard-blocking finding. One Medium finding (the client-side `roomRevision` approximation's stated reasoning was factually wrong — fixed properly with a small server-side change, `AdmissionAccepted` now echoes the transaction's real `authority.roomRevision`, rather than left as a documented limitation) and two Low findings (a duplicated error-mapping helper, a missing `onSnapshot` error callback), all fixed with tests.

Merge remains John's decision.

## Twelfth implementation PR: seat recovery / redemption (board task A06, partial) — READY FOR JOHN'S MERGE DECISION

`sonnet-a/a06`, PR #30, commit `78a2d94` (stacked on PR #27's branch; retarget to `main` once #13, #15, #18, #23, #27 merge). Board task A06's full scope (outbox persistence/reconciliation, seat recovery/rotation/rebind, old-UID revocation, kick, bounded RTDB presence, reload/identity-loss tests) is large. This PR delivers the first-named, fully-specified item — seat recovery ("Redemption," `docs/ARCHITECTURE.md` section 8) — as its own reviewable slice.

A fifth callable, `recoverSeat`: proves seat ownership by presenting a room code plus recovery code (never a client-asserted `memberId`) — the transaction scans every seated member's binding (bounded at `MAX_PARTICIPANT_SEATS + 1`) and checks the candidate code against each seat's `recovery/{memberId}` hash with no early exit. On match, in one transaction: revokes the old UID's `uidBindings` entry (skipped when the caller already holds it — the self-rotate case), binds the caller's UID to the seat, replaces the spent code with a freshly minted one (redemption invalidates it), and writes a GM-visible audit entry (`rooms/{roomId}/audit/{id}`, `memberId` only — no UID, no secret material). New independent throttle (`recoveryThrottle`, per-room-code+IP and per-IP) and stable error code (`INVALID_RECOVERY_CODE`).

Explicitly deferred (see PR #30's description for the full list): client-side outbox persistence/reconciliation, a rotation command distinct from redemption, kick, and bounded RTDB presence (its own large plan-only subsystem, `docs/PHASE_2_PR5_PLAN.md`, still dependency-blocked on PR 3/4 merging). Reload-during-roll/identity-loss test scenarios not exercised (no outbox/reconnect machinery yet to test against).

### Required checks — all pass locally

- `npm run check` — formatting, lint (zero warnings), typecheck, and **325/325** default tests across 43 files passed.
- `npm run build` — passed (`apps/functions` esbuild bundle 100.0kb; `apps/web` vite build, 79 modules).
- `PATH=/opt/homebrew/opt/openjdk/bin:$PATH npm run test:emulator` — **106/106** tests passed (17 `packages/testing`, 86 `apps/functions`, 3 `apps/web`).
- `npm audit` — unchanged from A05's baseline.
- `git diff --check` — clean.

### Independent review

One round: [`docs/reviews/2026-09-14-a06-recoverseat-independent-review.md`](docs/reviews/2026-09-14-a06-recoverseat-independent-review.md). No blocking finding. One Low finding — `packages/testing/test-emulator/roomRules.test.ts` had no rules-matrix coverage for the two new Firestore paths (`rooms/{roomId}/audit/{auditId}`, `recoveryThrottle/{document=**}`) — fixed with new/extended tests (GM-only audit read, no client write, fully service-only throttle tree). One Low documentation nuance noted (architecture doc says "deletes the old UID's presence"; the implementation deletes the Firestore `uidBindings` entry, since RTDB presence isn't implemented yet — tracked under the existing R5 residual, not a defect).

Merge remains John's decision.

## Thirteenth implementation PR: release integration, partial (board task A07) — READY FOR JOHN'S MERGE DECISION

`sonnet-a/a07`, PR #32, commit `ef15eb2` plus a small post-review documentation fix (stacked on PR #30's branch; retarget to `main` once #13, #15, #18, #23, #27, #30 merge). A07's full board scope — full quality gates, emulator transport tests, privacy/security review, staging candidate prep, setup/resume/recovery/backup/restore runbook, verify configured regions, three-device rehearsal evidence — is not completable end-to-end from this branch alone: genuine rehearsal evidence needs `apps/web`'s production screens wired to the real backend, and they are not (Sonnet C's C01–C05 fixture engine lives on unmerged branches; a `sonnet-c/c06-integration` branch exists locally, unpushed, that appears to be exactly that integration in progress). Fabricating rehearsal evidence against a fixture engine would prove nothing about this backend, so none is included.

What this PR does deliver:

1. **A real, previously-unnoticed region-mismatch bug, fixed.** `docs/PHASE_2_DECISION_BRIEF.md` records staging Firestore in `us-west1` and directs recording the Functions region alongside it; neither the five `apps/functions` callables nor `apps/web`'s client SDK call had ever actually specified a region (both silently defaulted to `us-central1`, agreeing with each other locally but not by design). Added `FUNCTIONS_REGION = "us-west1"` to `packages/contracts/src/deployment.ts` (shared by both apps so they cannot drift apart independently again) and applied it everywhere. Verified live via the emulator's own registered function names (`us-west1-createRoom`, etc.), not just a type-level claim.
2. **`docs/RUNBOOK.md`** — setup, resume-vs-recovery (with the architecture doc's R3/R4/R5 residuals stated as plain operational guidance), and backup/restore via standard `gcloud` tooling, explicitly marked unexercised against any real project. Includes the exact (unexecuted) staging deploy command sequence for John to run deliberately, region-verification steps, and an empty "deploy log" section never to be overwritten, only appended.

### Required checks — all pass locally

- `npm run check` — formatting, lint (zero warnings), typecheck, and **325/325** default tests across 43 files passed.
- `npm run build` — passed (`apps/functions` esbuild bundle 100.2kb; `apps/web` vite build, 80 modules).
- `PATH=/opt/homebrew/opt/openjdk/bin:$PATH npm run test:emulator` — **106/106** tests passed (17 `packages/testing`, 86 `apps/functions`, 3 `apps/web`), with the emulator log confirming `us-west1`-qualified function names actually executing.
- `npm audit` — unchanged from A06's baseline.
- `git diff --check` — clean.

### Independent review

Two passes (the first stalled mid-run on a long-running background command and was re-run in the foreground to completion): [`docs/reviews/2026-09-14-a07-release-integration-independent-review.md`](docs/reviews/2026-09-14-a07-release-integration-independent-review.md). No blocking finding. One Low finding — `docs/RUNBOOK.md` section 8 imprecisely implied this branch's own `apps/web` held the fixture-engine files it named, when those files live only on Sonnet C's unmerged branches — fixed by clarifying that this branch's `apps/web` is a separate, more primitive, unrelated stub, and the cited files are cross-track information about Sonnet C's branches specifically.

Merge remains John's decision.

## C06 integration fixes (issue #14) — PRs #34 and #36, READY FOR JOHN'S MERGE DECISION

Sonnet C's `sonnet-c/c06-integration` (PR #33) surfaced two `apps/functions` gaps while running its own full check/build/emulator pass, plus a third found live during the follow-up verification. All three are fixed here, stacked `sonnet-a/a07` → `sonnet-a/a08-integration-fixes` (PR #34) → `sonnet-a/a08-final` (PR #36):

1. **`httpsErrors.ts` exhaustiveness** — `grpcCodeFor`'s switch had no case for B05's eight stable error codes or this repo's own `SESSION_PAUSED`. Fixed with semantically-grouped mappings (PR #34).
2. **`test:emulator` silently ran against a stale/missing Functions build** — nothing in the pipeline built `apps/functions` before the emulator suite ran; a missing `dist/index.js` made the whole Functions emulator fail to load, surfacing as unmapped-error rejections everywhere. Fixed with a `pretest:emulator` npm lifecycle script (PR #34).
3. **`admitMember`/`claimSeat` never wrote the newly-admitted member's own initial projection** — a known, documented-but-never-implemented residual from A03/A04, only caught by actually driving create → join → claim live against the real emulator. Fixed in `writeInitialProjection` (PR #36).

**Verified live**, not just by unit test: merged this fix with `origin/sonnet-c/c06-integration` (`25b9dec`) in a throwaway verification worktree and ran the real UI against the real Functions/Firestore/Auth emulators through the full loop — create room → load scene → join player → claim character → declare action → GM reviews/rolls → player allocates → GM advances scene. Every step went through the real callables; nothing was mocked or faked. Full write-up, including two findings that could not be committed to this branch (a client-side auth-readiness race in `sonnet-c/c06-integration`'s own `apps/web/src/session/useRoomProjection.ts`, with a ready-to-apply patch; a stale `BeginAction`-rolls-immediately assumption in `gameCommand.test.ts`'s fixtures, needing a dedicated follow-up), is recorded on issue #14.

### Required checks — all pass locally (PR #36's branch)

- `npm run check` — 325/325 tests, 43 files, format/lint/typecheck clean.
- `PATH=/opt/homebrew/opt/openjdk/bin:$PATH npm run test:emulator` — 106/106 (17 `packages/testing` + 86 `apps/functions` + 3 `apps/web`), no regressions from the projection fix.

Merge remains John's decision.

## S06 event-tail presentation (DeepSeek factory run) — historical source branch, now integrated

Closes the three code findings of [`docs/reviews/2026-09-17-s06-outbox-reconciliation-review.md`](docs/reviews/2026-09-17-s06-outbox-reconciliation-review.md) (acceptance row 8). Full record: [`docs/reviews/2026-09-18-s06-deepseek-factory-review.md`](docs/reviews/2026-09-18-s06-deepseek-factory-review.md). Seat provenance: [`docs/evidence/2026-09-18-deepseek-seats/`](docs/evidence/2026-09-18-deepseek-seats/README.md).

What is on the branch:

1. **Authorized event-tail reads** (commit `afd0ced`): `RoomRepository.readEventTail` / `readEventTailHead` / `presentationScope` for the Firebase and in-memory repositories. Per-partition cursors (`shared`, `gm`, `member`), a full-partition watermark so merged pages are globally ascending, no `actor` field, fail-closed envelope parsing. Presentation only; state is never rebuilt from events.
2. **Bounded persisted presentation ledger** (`afd0ced`): acknowledged-id FIFO (512), sequence-lag expiry (300), roll contexts (64), merge-on-save for two tabs.
3. **Ordered, projection-gated presentation queue** (this branch's follow-up commit): `useRoomProjection(..., { presentEvents: true })` returns `presentation` + `acknowledgePresentation`; the single `recoveredResult` slot is gone. An item is exposed only once the rendered projection's `roomRevision` has reached the item's. `PlayerDashboardScreen` derives its resolution summary from the queue (`presentationQueue.ts`), including the attack-success explanation (from observed `ActionRolled` context).
4. **Recovered-command baseline:** with no ledger yet, the baseline is the partition head, except it is lowered to `acceptedSequence - 1` for commands `reconcilePending` just recovered, so a member's own recovered `ActionResolved` is not baselined away. The recovered sequences are kept across a failed head read (regression test d3, verified to fail without the fix).
5. **Shared-event redaction fixes** (`templates/eat-the-reich/src/engine.ts`): the shared copies of `SceneEdited`, `RoundEnded` and `ActionResolved` no longer name Threats that were unrevealed before the command; the GM copy and the canonical event `reduce` consumes are unchanged. `templates/eat-the-reich/test/sharedEventRedaction.test.ts` (8 tests) fails against the pre-fix engine.
6. **Pre-integration limitation:** the original DeepSeek source branch lacked LAN-safe emulator routing and UUID generation. The integrated branch resolves those limitations through `emulatorConfig.ts`, `firebase.lan.json`, `newUuid()`, and `docs/PLAYTEST_TWO_DEVICE.md` from the Qwen lane.
7. **Fixes from the independent review** (same commit): a sync requested while one is in flight now re-runs immediately instead of being dropped (previously the summary could arrive ~30 s after a dispatch); recovered sequences are recorded right after `reconcilePending` so a failed refresh cannot lose them; the summary no longer shows "Unresolved opposition" while an injury choice is pending, and an own `InjuryCategoryChosen` with no queued `ActionResolved` is acknowledged instead of pinning the cursor. Each hook fix has a test that was confirmed to fail with the bug reintroduced.

### Source-branch verification (2026-09-18, before Qwen integration)

- `npm run check` — format, lint (zero warnings), typecheck, **565 tests passed | 11 todo** (58 files passed, 1 skipped).
- `npm run build` — passed from an APFS clone under `/private/tmp` (`apps/web` 129 modules; the existing >500 kB chunk warning is unchanged).
- `PATH=/opt/homebrew/opt/openjdk/bin:$PATH npm run test:emulator` — passed from that clone: **18/18** rules, **86/86** Functions, **3/3** web.
- `git diff --check` — clean.
- Not run: `npm audit`, any physical-device or staging session.

### Open items (details and dispositions in the review record)

- **Row 22:** browser-emulated LAN evidence exists under `docs/evidence/today-qwen/`, but a human physical-device run and staging rehearsal remain open.
- **Player-private detail in shared event copies** (injury marks, `actorMemberId`, item/advance ids): product decision for John; none names an unrevealed Threat.
- **`AllocateResults` accepts an unrevealed Threat target** (pre-existing rule; a player can mutate it and probe ids). Redaction does not close it.
- **Reused engine event ids** (`session-paused`, `mission-ended`, `round-N-ended` after a round reset, `scene-edited-N`) would be dropped by the ledger's `eventId` dedupe for any future timeline/theatre consumer (reported by the reviewer; not re-verified).
- **Resend path** returns no `acceptedSequence`, so with no ledger yet a recovered summary can still be baselined away (needs a callable-contract change).
- Low: `attackSuccessesRolled` unavailable when the ledger is created after `ActionRolled`; blocked `localStorage` disables presentation; two tabs of one seat can each present a summary once.

### DeepSeek seat evidence

One `deepseek-v4-pro` design review (verdict AMEND, 11 findings) and four `deepseek-v4-flash` implementation seats (A ledger, B tail reads, C hook/UI, E redaction), each one attempt, all `completed`. Seats D and F were drafted but never dispatched. Seat-reported test results are self-reports from their own scratch worktrees; the numbers above are from the integrated tree. Raw transcripts are not committed.

## Definition of first playable

After the later realtime PR, two players and one GM can join a room, load the sample encounter, resolve an opposed action, receive correctly isolated projections, reconnect without duplicating it, invoke anonymous safety controls, and review the timeline.

## Decisions requiring John

- **See [`docs/PHASE_2_DECISION_BRIEF.md`](docs/PHASE_2_DECISION_BRIEF.md) for the full brief, options, and recommendations.** Summary: Firebase region and staging/production project separation; room join policy (open code / code + passphrase / invites); campaign retention/export/deletion values, including what happens if a 90-day archive prompt goes unanswered.
- Game-content distribution rights and approved placeholder fixture.
- Whether 3D dice, durable accounts, or Cloudflare hosting enter the first public milestone.

## Handoff protocol

When pausing or finishing a material unit:

1. Update Current state and Next action in this file.
2. Record branch/PR, commands run, test results, decisions, and blockers.
3. Commit and push the handoff with the work.
4. Do not call a non-trivial change complete until independently reviewed.

## Integrated verification and next action

- `npm run check` — format, lint, typecheck, **589 tests passed | 11 todo** (62 files passed, 1 skipped).
- `npm run build` — Functions and web builds passed; the existing Vite chunk-size warning remains non-blocking.
- `PATH=/opt/homebrew/opt/openjdk/bin:$PATH npm run test:emulator` — **18/18** rules, **86/86** Functions, **3/3** web.
- Independent integration review found no code/security blocker and requested only this handoff correction; recorded in `docs/reviews/2026-09-18-deepseek-qwen-integration-review.md`.

1. Push `factory/today-integration`, then use `docs/PLAYTEST_TWO_DEVICE.md` on a trusted LAN with a physical GM device and player device; fill `docs/evidence/today-qwen/CHECKLIST.md` with real-device results.
2. After physical-device evidence, prepare the reviewable next-phase PR/integration against the current target branch. Do not deploy production implicitly.
3. Follow-ups that need their own change: unique engine event ids for repeatable events; rejecting unrevealed Threat targets for non-GM `AllocateResults`; returning `acceptedSequence` from the game-command callable; decide whether player injury detail belongs in shared event copies.
4. Keep production uncreated and do not pull forward App Check enforcement, campaign tooling, 3D, licensed content, or a second template.

### Independent staging playtest verification (2026-09-18)

- `node scripts/playtest/two-device-smoke.mjs --base https://powerglove-1cd23.web.app --reload` — 14/14 steps passed on the deployed build; the same script with the new phone-width GM step fails on that build (40px) and passes 15/15 against the patched build served locally (staging backend, nothing deployed). `--routes-only` and `--no-images` runs also passed.
- `npm run check` — format, lint, typecheck, **589 tests passed | 11 todo** (62 files passed, 1 skipped). `npm run build` — passed (existing chunk-size warning). Emulator suites not rerun: no Functions, rules, contracts, or engine file changed.
- Independent second pass on the CSS/smoke diff: approve with nits (comment adopted). Recorded in the review linked above.

### F4-F7 polish (branch `sonnet-f/copy-resume-a11y`, 2026-09-18)

- **Status:** committed and pushed on `sonnet-f/copy-resume-a11y` (branched from `59c4fe3`, the head of `factory/today-integration` that carries the F1 fix). Nothing merged or deployed; staging Hosting still serves the pre-fix build.
- **Changed (`apps/web` only; no engine, contracts, template, Functions, or rules file touched):** plain live document title with a fixture-only suffix (F4); accurate Invite copy (F5); player Resume goes to the dashboard, which forwards an unclaimed player seat to the picker with a history-replacing redirect (F6a); a guidance panel for a visitor without the GM seat that uses only the browser's own saved seat, and a GM-only projection subscription (F6b); one `h1` on every player-dashboard state (F7). Dispositions, evidence and the independent review are in the review record's "Disposition of F4-F7" section.
- **Commands and results:** `npm run check` passed with **614 tests passed, 11 todo** (68 files passed, 1 skipped; baseline 589). `npm run build` passed (existing chunk-size warning). `node scripts/playtest/two-device-smoke.mjs --base http://localhost:4181 --reload` against a scratch build of this branch and the local Auth/Firestore/Functions emulators: **17/17 passed**, no console errors or failed requests. `PATH=/opt/homebrew/opt/openjdk/bin:$PATH npm run test:emulator` (run once the other job released the fixed ports) passed: **18/18** rules, **86/86** Functions, **3/3** web; no Functions, rules, contracts, or engine file changed.
- **Integration order:** this branch touches `apps/web` (`App.tsx`, `router.tsx`, `styles.css`, `index.html`, the landing/gm2/player2/shell screens), `scripts/playtest/two-device-smoke.mjs`, and docs. It is independent of F2/F3 (recovery UI and `ownership.ts` recovery-code persistence): if F3 edits `apps/web/src/session/ownership.ts`, no conflict is expected (this branch does not touch it). Expect textual conflicts only with lanes that also edit `PlayerDashboardScreen.tsx`, `GmDirectorScreen.tsx`, `LandingScreen.tsx`, `styles.css`, `CLAUDE_HANDOFF.md`, or the smoke script. Suggested order: F1's branch (`factory/today-integration`), then F3, then this branch, then any F2 change, then one Hosting redeploy (`docs/RUNBOOK.md` section 3, step 4) followed by a smoke run against staging.
- **Next action:** John decides the merge/redeploy order above. After a redeploy, re-run the smoke script against staging to confirm F1 and F4-F7 on the deployed build.
