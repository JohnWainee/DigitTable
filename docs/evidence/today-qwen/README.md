# Factory Qwen "today-qwen" evidence (2026-09-18)

Base commit `e0ad252` (branch `factory/today-qwen`). Goal: make that commit visually complete and
manually playable today on two devices (GM + player), using only original, provenance-documented,
already-committed art. Nothing was pushed, merged, or deployed; no Firebase project was touched.

## What is here

| Path | Contents |
| --- | --- |
| `two-device-run/` | Full 3-device session (GM 1280x800, player 375x812 phone emulation, table 1920x1080) driven over the LAN address `http://192.168.4.56:4173` with a non-secure context; 14 steps, 19 screenshots, `report.json`. Includes player reload-restore. |
| `noimg-run/` | Same run with every `*.png/*.webp/*.jpg` request blocked: proves gradient/monogram/glyph fallbacks in a real browser. |
| `partial-art-run/` | Same run with only `*scene-*` art blocked: the table banner falls back from the 1024 derivative to the 640 image (`report.json` step "table display connects" records `currentSrc`). |
| `route-audit/` | Signed-out route audit: 9 routes x 4 viewports (375/768/1280/1920), heading, alert, control count, overflow. |
| `baseline-e0ad252-lan-run/` | The **untouched** `e0ad252` build over the same LAN address: crashes at *Create a session* with `TypeError: globalThis.crypto.randomUUID is not a function` (before/after proof of blocker 1). |
| `qwen-seats/` | Bounded local Qwen seat evidence (below). |
| `CHECKLIST.md` | Blank manual-session evidence checklist. Runbook: `docs/PLAYTEST_TWO_DEVICE.md`. |

Every run: 0 console errors, 0 failed requests except deliberately blocked ones, 0 horizontal
overflow at 375/768/1024/1280/1920 on GM, player and table screens.

## Blockers found and fixed

1. **Plain-http LAN pages cannot call `crypto.randomUUID`** (secure-context-only). Create, join,
   claim and every command crashed on a phone at `http://<lan-ip>`. Fix: `apps/web/src/shared/uuid.ts`
   (`newUuid`, v4 via `getRandomValues` fallback) at all 7 call sites. Tests: `test/shared/uuid.test.ts`.
2. **Emulator hosts hard-coded to `127.0.0.1`**, unreachable from a phone. Fix:
   `apps/web/src/session/emulatorConfig.ts` (page hostname, or `VITE_EMULATOR_HOST`), `firebase.lan.json`
   (0.0.0.0 bind, opt-in only), `scripts/playtest/lan-up.sh`. Tests: `test/session/emulatorConfig.test.ts`.
3. **GM "Advance scene" defaulted to reloading the current scene** (default computed once while no
   scene was loaded). Fix: default to the next scene in mission order; `SceneDirector` derives its
   selection from the loaded scene at render (no remount; typed reason text survives). Tests: `test/gm2/SceneDirector.test.tsx`.
4. **Existing original art was shipped but unused or only half-used.** Landing hero (3 derivatives),
   the 1024/1536 scene banners and the GM's scene image are now wired with fallbacks; a manifest test
   fails if any content id would request a missing file (`test/shared/artManifest.test.ts`).
5. Stale image state across scene changes (`SceneArt` kept "error"/"loaded" for the next scene): now keyed per scene.

## Art audit and provenance

Source of truth: `assets/generated/eat-the-reich/README.md` + `LICENSE-ASSETS.md` (tool, model, date,
exact prompts, native size for every source PNG; original placeholders, no licensed *Eat the Reich*
art, no readable text or real insignia; **approval still pending for any public release**).
All 18 source PNGs (6 portraits, 4 scenes, 7 threats, 1 hero) are individually documented in the pack README, and `LICENSE-ASSETS.md` covers the directory; the 47 shipped WebP derivatives map 1:1 to them
(6 portraits x {512, 256, token-128} = 18; 4 scenes x {640, 1024, 1536} = 12; 7 threats x {256, 128} = 14;
hero x {600, 1000, 1600} = 3). Requested by the UI: 34 files (12 scene + 12 portrait + 7 threat + 3 hero); all exist.
Spare, currently unrequested: portrait `-256` (6) and threat `-256` (7) derivatives, kept for future layouts.
Nothing was generated, downloaded, or copied in from anywhere this session.

## Qwen seats (analysis-only; Sonnet owns implementation and review)

Runner: `scripts/qwen-seat.sh` (Ollama local API, temperature 0, seed 42, hard `num_predict` cap,
`keep_alive: 0`, no tools, no filesystem, single stream, only `qwen3:4b` and `qwen2.5-coder:7b`
permitted; 14B/30B refused). Each seat directory holds `prompt.md`, `schema.json` (when used),
`response.json` (raw), `response.txt`, `meta.json` (model digest, wall time, token count).

| Seat | Model (digest) | Job | Result | Disposition |
| --- | --- | --- | --- | --- |
| `s1a-art-coverage-unconstrained` | qwen3:4b (`359d7dd4bcda`), 20 s | Audit art-id coverage | Rambled in visible reasoning; hit the 900-token cap with no answer | Rejected. Kept as evidence; led to schema-constrained output for all later seats. |
| `s1b-art-coverage` | qwen3:4b, 10 s | Same, schema-constrained | Wrong: called all 6 portraits missing (all 12 files exist), ignored the threat ids, flagged `signal-mast-640.webp` as orphan (SceneArt requests it), missed the 13 `-256` spares | Rejected. Replaced by direct file checks and `artManifest.test.ts`. Only "hero and large scene art unused" was right, and I had already confirmed it by grep. |
| `s2-secure-context` | qwen2.5-coder:7b (`dae161e27b0e`), 18 s | Read call sites for insecure-context breakage and phone-unreachable hosts | Correctly flagged the hard-coded `127.0.0.1` in `roomClient.ts`; misattributed the `randomUUID` finding to that file and listed every real `randomUUID`/`subtle` call site under "works fine" | Half used. Host finding confirmed and fixed; the `randomUUID` list was wrong, so the real sites came from my own grep, and the browser baseline run proved the crash. |
| `s3-sceneart-review` | qwen2.5-coder:7b, 11 s | Trace the new SceneArt fallback state machine | Mostly UNCERTAIN; omitted the final "none" stage; said the call site does not prevent stale state (it does: `key={scene.id}`) | Rejected. Behaviour covered by `artFallbacks.test.tsx` (large -> 640 -> CSS fallback) and my own read. |
| `s4-run-triage` | qwen3:4b, 5 s | Triage the three browser-run reports | No failing steps, console errors, overflow or unexpected problems | Accepted; matches my direct read of the `report.json` files (prompt used the pre-final run; re-checked against the final runs, same result). |

Net: Qwen seats produced two correct/consistent outputs (host finding, run triage), three that were
wrong or unusable. Nothing from a seat was adopted without independent verification, and no seat
wrote a file in the repository (the seat evidence files are written by the runner script).

Second session (2026-09-18): the runner was hardened after independent review (loopback-only host,
seat-id allowlist, repo-root cwd, request body via stdin). Its three refusals and one 40-token real
call were re-tested; that smoke output was discarded and is **not** counted as a seat above.

## Throwaway credentials in this directory

Screenshots `*/04-gm-secrets-reveal-*.jpg` and each `report.json` `roomCode` show codes and the
smoke script's fixed passphrase from throwaway rooms in the offline `demo-digitable` emulator. They
guard nothing that exists after the emulator stopped; there are no real credentials or player data here.

## Verification (mirror at `/private/tmp/today-qwen-run`, synced from this worktree)

The worktree lives under `~/Documents`, where macOS blocks esbuild/Firebase startup, so gates run in a
synced copy (see handoff). Results:

- `npm run check` (format, lint, typecheck, tests): clean, exit 0; **485 tests passed, 11 todo** across 54 files (1 skipped), re-run at the end of a second session on 2026-09-18 (484 before one added `uuid` test) after `diff -rq` confirmed the mirror's source is identical to this worktree; an earlier run in the first session recorded 478 (baseline `e0ad252`: 461), and the difference was not investigated beyond confirming identical sources.
- `npm run build`: clean, exit 0 (web Vite build; Functions bundle 208.8 kB as recorded in the first session).
- `npm run test:emulator`: **107/107** (18 rules + 86 Functions + 3 web), observed in the first session; **not re-run** in the second.
- Browser: full three-device loop over `http://192.168.4.56:4173` and `http://localhost:4173`, plus
  no-images, partial-art, and route/viewport audits, all passing; baseline run fails as described.

## Not verified / open

- **No physical phone was used.** The "phone" is Chrome device emulation (375x812, touch, mobile UA
  metrics) over the real LAN address and a real non-secure context. The manual checklist is the
  remaining evidence.
- iOS/Safari specifics (lazy images, `srcset`, viewport units) were not exercised.
- No recovery-code entry UI on this base (`sonnet-c/c08-recovery` `97126b5` applies cleanly; John decides).
- Screen-reader/VoiceOver pass, the staging rehearsal (acceptance row 22), and S06's open items
  (event-tail dedup, ordered recovered presentations) are unchanged and remain open.
