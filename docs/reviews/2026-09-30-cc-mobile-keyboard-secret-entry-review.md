# Mobile keyboard audit: secret-entry fields (2026-09-30) — independent review

- **Branch:** `sonnet-cc/reskin-mobile-physical-audit-20260930`, from `776af04`.
- **Scope:** audit of the reskin candidate for functional mobile defects that the real-browser harness cannot see, with attention to real phone keyboards. Pop-out system (`SheetDialog`, `useVisualViewportBox`, the six native `<select>`s, the one `<details>`, `AllocationStepper`, `CorrectionDialog`) re-read in full; `apps/web/src/styles.css`, `apps/web/src/shared/**` and `apps/web/index.html` are unchanged from the reviewed reskin and no new defect was found in them.

## Defect found (real, fixed)

Every code/secret entry field was a bare `<input type="text">`. iOS Safari defaults such a field to sentence capitalisation, autocorrect and spell-check, and Chrome device emulation (which the audit harness uses) applies none of it, so no prior pass could observe this. The server compares these values byte for byte:

- `packages/engine/src/secretHash.ts` `verifySecret` is an exact PBKDF2 comparison; nothing trims or case-folds.
- The room passphrase is sent as typed (`JoinScreen`, `CreateSessionScreen`). A player on an iPhone told `wolfbane` gets `Wolfbane` and is rejected with "wrong passphrase", with no visible reason.
- The recovery code (13 characters of `23456789ABCDEFGHJKMNPQRSTUVWXYZ`) had no `autoCapitalize` and was sent unnormalised, so typing it as the lower-case keyboard shows it could never match. This is the lost-identity recovery path John is about to test on physical devices.
- The table join fields (`JoinTableScreen`) had no attributes at all (the client upper-cases on submit, but autocorrect could still rewrite the code).
- Two GM identifier fields (`grant-item-id`, `reassign-member-id`; member ids are lower-case `member-…`) would be capitalised.

## Fix

- Passphrases and the two GM identifier fields: `autoCapitalize="none" autoCorrect="off" spellCheck={false}`.
- Room, recovery and table codes: `autoCapitalize="characters" autoCorrect="off" spellCheck={false}` (table fields also `autoComplete="off"`, matching the recovery field).
- `JoinScreen` recovery submit sends `recoveryCode.trim().toUpperCase()`. Safe because minted codes are upper-case with no whitespace; it only changes entries that could never have matched. The server is deliberately left exact (case-folding server-side would shrink the code's entropy and needs an architecture decision).
- Regression: `apps/web/test/landing/secretEntryAttributes.test.ts` (static pin over each field's element plus the normalisation).

No engine, contracts, template, Functions, rules, authorization or projection code changed, and no secret value is read, stored or displayed differently.

## Independent review

One read-only Claude general-purpose agent in a fresh context (no edits, no npm). Verdict: **no P0/P1; change correct and safe.** It confirmed the defect from the source, checked each attribute against its field, found no missed secret/identifier field (remaining text inputs are free text), found no existing test that types a lower-case or padded recovery code, and read the new test against the sources (unique ids, `inputElement()` slicing, strictness, style). Nits, accepted: (P2) the test is a static source pin, not behaviour — `LandingFlow.a11y.test.tsx` could retype the recovery code in lower case with padding; (P2) a hard-coded id list will not catch a future secret field; (P2) room codes and the table code are upper-cased but not trimmed, so a pasted trailing space still fails (pre-existing, left alone to keep this change narrow).

## Verification after review

The original review was deliberately read-only; a follow-up verification pass restored the lockfile-pinned dependencies and exercised the candidate without changing its source:

- `npx vitest run apps/web/test/landing/secretEntryAttributes.test.ts` — **10/10 passed**.
- `npm run check` — Prettier and ESLint clean, TypeScript clean, **704 active tests passed | 11 todo** (72 files passed, 1 skipped).
- `npm run build` — Functions and web builds passed. The existing Vite chunk-size warning remains non-blocking.
- `PATH=/opt/homebrew/opt/openjdk/bin:$PATH npm run test:emulator` — **108/108 passed** (18 `packages/testing`, 86 Functions, 4 web); expected emulator-only App Check warnings and Node 22/host Node 24 notice were observed, with a zero exit status.
- `git diff --check` — clean.

`ui-audit.mjs` and `two-device-smoke.mjs` are not rerun for this browser-keyboard-attribute-only change: Chrome emulation cannot enact iOS sentence capitalization or autocorrect, while the complete local UI audit and 17-step session rehearsal on its exact parent (`776af04`) already passed. Physical-device, real-iOS keyboard and other-browser behaviour remain unverified; the attributes are standard but their effect still needs John’s physical rehearsal.
