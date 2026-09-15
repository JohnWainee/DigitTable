# Phase 2 PR 3 second-pass independent review: remediated admission boundary

- **Reviewed PR:** [#13](https://github.com/JohnWainee/DigitTable/pull/13) (`worktree-phase2-pr3-admission`) at `9ed0967` — the remediation of the first review's five blockers (`2026-09-14-phase-2-pr3-review-resolution.md`)
- **Against:** `main` at `2823b69`
- **Scope authority:** `docs/PHASE_2_PLAN.md` PR 3 (as revised 2026-09-14); `docs/ARCHITECTURE.md` sections 6, 8, 9, 11, 13; `AGENTS.md`
- **Reviewers:** two independent passes in fresh contexts, neither the remediation's author — one adversarial security pass with emulator probes (findings T1–T10), one correctness/contract/test-quality pass (findings C1–C10). Their probe files were throwaway and are not committed.
- **Date:** 2026-09-14
- **Result:** **No blocking finding. Six Medium findings, all fixed on the branch in the follow-up commit; the rest fixed or recorded below.** PR #13 is ready for John's merge decision; the residuals that remain are product/deploy decisions, not defects in the boundary.

## What was verified to hold (with evidence)

Both passes ran the full gate on `9ed0967` (`npm run check` 262/262 after moving aside a stray untracked Vitest report — see C8; `npm run build`; `npm run test:emulator` 48/48; `git diff --check` clean) and confirmed:

- Pipeline order monitoring → auth → validate → throttle → transaction is a sound boundary: validation runs before any Firestore read; no path reaches the transaction without a validated room code; a thrown non-`HttpsError` becomes `internal` (fails closed), never a bypass.
- No denial or log path leaks a room code, passphrase, table code, recovery code, or UID (fixed-string messages; logger fields only `function`/`code`), except the unmapped path in T3/C2 below.
- Reads-before-writes discipline; reclaim writes nothing and cannot change capability or counters; GM claim writes `authority/current` and `meta/current` in one transaction.
- Races: 30 concurrent identical requests → exactly 20 admitted to the transaction and 10 `RATE_LIMITED`, counter exactly 20; 8 concurrent legitimate joins all succeed; the existing GM-seat and capacity race proofs pass.
- Table-code matrix enumerated over `{player, table} × {which secret valid} × {no binding, player, table, gm}`: no combination admits with the wrong secret; cross-capability bindings deny `ROLE_FORBIDDEN`; secret-before-reclaim holds in both decisions.
- Parsers reject strings, `NaN`, `Infinity`, negatives, fractions; extra fields are ignored (safe); every read in `apps/functions` goes through a parser. One gap: T2/C4.
- Rules: additive diff; `admission/secret`, `admission/tableSecret`, `recovery/*`, and the throttle tree are `read, write: if false` for every role, `get`, `list`, `set`, `update`, `delete`; no `{document=**}` allow exists.
- Web: `ReCaptchaEnterpriseProvider` only; `isTokenAutoRefreshEnabled` is the only option; `null` without a site key; a local-only build touches no Firebase service; no stale `VITE_RECAPTCHA` name.
- Wiring: no Admin SDK or `firebase-functions` import outside `apps/functions/`; the deleted testing-package seam has no live references; `apps/functions` unit tests are in `npm run test` and its emulator tests in `npm run test:emulator`; the esbuild bundle imports only `firebase-admin/*` and `firebase-functions/*`.

## Findings and dispositions

Severity is against the boundary as shipped. "Fixed" means fixed on this branch in the follow-up commit, with a test.

### T1 / C6 (Medium, fixed). The per-IP throttle key was caller-spoofable

`clientIpFrom` preferred `req.ip`, then the *leftmost* `X-Forwarded-For` entry. The Functions framework enables Express `trust proxy`, so `req.ip` is also the leftmost entry — the one a scripted caller writes. Probe: 30 requests with rotating `X-Forwarded-For` values → 0 `RATE_LIMITED`, 30 buckets. **Fix:** a third bucket keyed on the verified anonymous `auth.uid` (60 per minute), consumed in the same transaction. It cannot be spoofed per request; an attacker must mint a fresh anonymous identity every 60 attempts, which App Check enforcement later gates. IP derivation is unchanged and documented as best-effort until R2 is verified on staging. Emulator test: one identity rotating IP and code every request is denied at the 61st.

### C1 (Medium, fixed). The throttle did not bound room-code enumeration

Keying only on `(code, ip)` gave every distinct guess a fresh 20-attempt bucket, so the number of codes tried per minute from one IP was unbounded — while five documents claimed the opposite. **Fix:** a per-IP bucket across all codes (100 per minute), plus the per-UID bucket above. Emulator test: 100 distinct codes from one IP with distinct identities → the 101st is `RATE_LIMITED`. `docs/ARCHITECTURE.md` section 8 now describes all three buckets and their limits.

### T2 / C4 (Medium, fixed). An absent `gmMemberId` key parsed as "no GM seated"

`parseAuthorityAdmissionFields` mapped `undefined` to `null`, and a contract test pinned it. Probe: drop the key from a seated room's `authority/current` → a second identity's `claimSeat` succeeded, two `gm` bindings existed, `participantCount` went to 2. **Fix:** the key must be present and be `null` or a non-empty string; `""` is rejected too. Contract test flipped; emulator test seats a GM, drops the key, and proves the second claim is `ROOM_DATA_INVALID` with exactly one `gm` binding remaining.

### T3 / C2 (Medium, fixed). Unconstrained room-code characters escaped as an unmapped error carrying the code

`"ab/cd"`, `"a/../b"`, `"__id__"` passed the length-only parser and threw Firestore path errors out of `runAdmissionTransaction` — an `internal` response and a framework log line containing the submitted code, after a throttle attempt was consumed. **Fix:** room codes are validated to `^[A-Za-z0-9-]+$` (they are human-typed locators); display names reject control and format characters and must contain a visible character (T8). Unit tests for both; emulator test for `"ab/../cd"` → `INVALID_REQUEST`.

### C3 (Medium, fixed). `firebase deploy` would have failed at install

`apps/functions/package.json` listed `@digitable/contracts` and `@digitable/engine` under `dependencies`; Cloud Build installs from that manifest and those names are not on the registry. The esbuild bundle already inlines both. **Fix:** moved to `devDependencies`. Deploy itself remains unexercised (R3).

### T4 (Low, fixed). The malformed-payload denial carried no stable code

**Fix:** new stable code `INVALID_REQUEST` (section 6), mapped to `invalid-argument`, with a fixed message so the parser's detail string never reaches a client.

### T5 (Low, fixed). Oversized or hostile throttle segments could exceed Firestore's ID limit

**Fix:** every throttle document ID is the SHA-256 hex of the untrusted value; no submitted code, address, or UID is stored as a path segment.

### T6 / C10 (Low, fixed). `meta/current` was merged without being read, and `updatedAtServer` never bumped

**Fix:** the transaction reads `meta/current`; a missing mirror is `ROOM_DATA_INVALID` (never a partial document created); a GM claim updates `gmMemberId` and `updatedAtServer`. Emulator tests for both.

### T7 (Low, fixed). Throttle documents grew without bound

**Fix:** each carries an `expiresAt` timestamp two windows out. Enabling the Firestore TTL policy on the `byIp` and `scope` collection groups is a console-side step before public preview (recorded in section 8).

### C5 (Low, fixed). Emulator tests were not isolated across runs against one emulator instance

Re-running the Function suite twice under one `emulators:exec` failed 9/32 (stale bindings turned creates into reclaims; throttle counters persisted). **Fix:** every fixture room, code, and UID carries a per-run suffix.

### C7 (Low, fixed). `decideClaimSeat` reclaim ignored a `gmMemberId` mismatch

**Fix:** a `gm` binding whose member ID is not the authority's seated GM denies `GM_SEAT_TAKEN` (inconsistent data never reclaims). Unit test.

### C10 (Low, fixed). Both PBKDF2 verifications and the recovery-code hash ran inside the transaction

**Fix:** only the secret the requested capability needs is verified (one PBKDF2 run per request); the seat's recovery credential is minted and hashed before the transaction, so no slow hash holds the `authority/current` lock or is redone on retry; stored `iterations` is capped at 1,000,000 so a corrupted secret document cannot pin the CPU.

### T10 / C8 (Informational, fixed). A stray untracked Vitest JSON report tripped `prettier --check`

**Fix:** `.vitest/` added to `.gitignore` and `.prettierignore`.

### T9 / C-docs (Informational, fixed). Documentation drift

Corrected in this commit: the first-pass resolution's "36 contract unit tests" and "every denial carries the stable code" (now true via T4); "recovery hashes are runtime-validated" (the parser exists; nothing reads `recovery/*` until PR 6); "no region or project is named in code" (`.firebaserc` carries a `staging` alias from PR 3's earlier commits, default unchanged); `docs/PHASE_2_PLAN.md`'s status line; the handoff's "anonymous Firebase Authentication wiring" (a `signInForAdmission` helper exists but is not yet called — the join UI is a later PR).

### Recorded, not fixed

- **C9 (Informational).** `signInForAdmission` is exported but uncalled until a join UI exists; `AdmissionCommand` is used only by a test. Left in place, wording corrected.
- **Cost note (Informational).** Each admission request still costs one PBKDF2-210k verification (down from two) plus one hash for a new seat; acceptable at eight seats per room, worth revisiting if throttle limits are raised.

## Verification after the fixes

| Command | Result |
|---|---|
| `npm run check` (format, lint, typecheck, default tests) | pass; **283/283 tests across 38 files (21 added by the second-pass fixes)** |
| `npm run build` | pass |
| `PATH=/opt/homebrew/opt/openjdk/bin:$PATH npm run test:emulator` | pass; **54/54 emulator tests: 16 in `packages/testing` (harness + rules matrix, now covering the whole `admissionThrottle` tree) and 38 in `apps/functions` (adds: missing/empty `gmMemberId` never reopens the GM seat, missing `meta/current` denies, hostile room code rejected with `INVALID_REQUEST`, per-IP enumeration bound, per-UID bound under rotating IP/code, GM claim bumps the mirror's `updatedAtServer`)** |
| `npm audit` | 13 moderate, unchanged from the first-pass remediation (all in the `firebase-tools`/`firebase-admin` trees; residual R6); no high/critical |
| `git diff --check` | clean |

## Residuals carried forward

R2 (verify the resolved client IP on staging before enforcement — the per-UID bucket is the trustworthy bound until then), R3 (deploy and region), R4 (room creation and issuing a table code have no owning PR), R5 (throttle limits 20/100/60 per minute are initial values), R6 (`@google-cloud/storage`'s `gaxios`/`uuid` advisory in the Function's unused Storage client), plus: enable the Firestore TTL policy for `admissionThrottle` before public preview.
