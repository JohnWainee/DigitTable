# Phase 2 PR 3 third-pass independent review: closing the admission gate (board task A01)

- **Reviewed PR:** [#13](https://github.com/JohnWainee/DigitTable/pull/13) (`worktree-phase2-pr3-admission`) at `121ea71` — no code changed since the second pass; this pass re-verifies the second pass's claims and inspects the specific items GitHub issue #14 task A01 names.
- **Against:** `main` at `2823b69`.
- **Reviewer:** a fresh subagent session (`general-purpose`, model `sonnet`), independent of the branch's author, given only the branch/PR, the two prior review documents (to avoid re-litigating fixed issues, not to be trusted blindly — instructed to spot-check their claims against the actual code), and the architecture invariants. Its probe work was read-only; no repository files were modified by it.
- **Date:** 2026-09-14.
- **Result:** **No blocking finding.** One new Low-severity, non-blocking, cosmetic finding — fixed on this branch below.

## Inspection targets (A01's explicit list) and verdicts

1. **Callable authentication/throttle ordering — PASS.** `apps/functions/src/callables.ts` runs App Check monitoring → `requireAuth` (throws `AUTH_REQUIRED` before any Firestore access) → payload validation (throws `INVALID_REQUEST` before any Firestore access) → throttle (its own transaction, scoped to `admissionThrottle/*` only) → the admission transaction. No path reaches a Firestore read before validation and throttle succeed.
2. **Persisted-data fail-closed validation — PASS.** Every authority/room-code/uid-binding/secret-hash/throttle read goes through a parser in `packages/contracts/src/room.ts` that throws `RoomDataError` on any malformed or missing required field (never defaults); both transactions (`runAdmissionTransaction`, `checkAndConsumeAdmissionThrottle`) run inside `db.runTransaction`, so a thrown `RoomDataError` aborts before any write commits.
3. **Separate table admission — PASS.** The transaction reads exactly one secret document per request, selected by `requestedCapability`, and sets the other capability's valid-flag to `false` unconditionally — the pure decision in `packages/engine/src/admission.ts` cannot see the wrong secret as valid for the wrong capability. Covered by both engine unit tests and the emulator's "separate table code" test group.
4. **Secret-on-reclaim ordering — PASS.** Both `decideAdmitMember` and `decideClaimSeat` check secret validity before considering the `existingBinding`/reclaim branch, so a stale identity is denied `INVALID_PASSPHRASE` before reclaim, including after rotation. Emulator tests cover a rotated room passphrase, a bound GM with a wrong passphrase, and a bound table seat rejected by the general passphrase.
5. **Enterprise App Check monitoring — PASS.** `apps/web/src/firebase/appCheck.ts` uses `ReCaptchaEnterpriseProvider` (not the deprecated v3 provider), wired from `apps/web/src/firebase/bootstrap.ts` and called once from `main.tsx` before render; a local-only build without Firebase config never calls `initializeApp` or touches any Firebase service.
6. **General sweep — one new finding (Low, fixed below).** No fail-open path, secret leak into logs/errors/URLs, or missing edge-case test was found; the two prior review documents' claims were spot-checked against the code and hold.

## New finding and disposition

### Finding (Low, non-blocking, fixed). Recovery-code alphabet comment overstated its symbol count

`packages/engine/src/secretHash.ts`'s `RECOVERY_CODE_ALPHABET` constant ("`23456789ABCDEFGHJKMNPQRSTUVWXYZ`") is 31 characters, not the 32 its comment claimed. This is a real, verifiable count (`"23456789ABCDEFGHJKMNPQRSTUVWXYZ".length === 31`), not a stylistic complaint: `docs/ARCHITECTURE.md` section 8 requires recovery codes carry "at least 64 bits of entropy" and offers "13 characters from a 32-symbol unambiguous alphabet" as an illustrative example of one way to clear that floor. With 31 symbols the actual entropy is 13 × log₂(31) ≈ 64.4 bits — it still clears the binding 64-bit floor, so this was never a security defect, only a factually wrong comment (and a correspondingly tiny, immaterial modulo bias in `byte % 31` versus a power-of-two alphabet size).

**Fix (this pass):** corrected the comment in `secretHash.ts` to state the true 31-symbol count and the ~64.4-bit figure, and to note that `docs/ARCHITECTURE.md`'s "32-symbol" phrasing is an illustrative example rather than a description of this exact alphabet. No behavior change: the alphabet string, `RECOVERY_CODE_LENGTH`, and `generateRecoveryCode`'s logic are unchanged, so no test assertion or generated-code shape changes. Verified `npm run check` still passes 283/283 after the edit (unchanged from the second pass — a comment-only diff).

Not fixed (deliberately, as a residual, not a defect): the alphabet is not widened to a true 32 symbols. Doing so would change every future-generated recovery code's character distribution for a floor the current alphabet already clears; left as a product judgment call for whoever next touches recovery-code generation, not a merge blocker.

## Verification (re-run this pass)

| Command | Result |
|---|---|
| `npm run check` | pass; **283/283 tests, 38 files** (unchanged from the second pass — this pass's only change is a comment) |
| `npm run build` | pass (functions esbuild bundle 23.1kb; web vite build) |
| `PATH=/opt/homebrew/opt/openjdk/bin:$PATH npm run test:emulator` | pass; **54/54** (16 `packages/testing` + 38 `apps/functions`) |

All three counts match the second-pass review's recorded numbers exactly, confirming no drift between that review and this one.

## Disposition

**PR #13 is ready for John's merge decision.** Three independent review rounds (first pass: 5 blocking findings, all remediated; second pass: two reviewers, no blocking findings, 6 Medium findings fixed; this third pass: no blocking findings, 1 Low cosmetic finding fixed) have now inspected the admission boundary, including every item board task A01 names by description. Residuals carried forward are unchanged from the second-pass review (R2 IP-resolution-on-staging, R3 deploy/region, R4 room creation ownership — now being addressed by board task A03, R5 throttle tuning, R6 the `gaxios`/`uuid` transitive advisory, plus enabling the Firestore TTL policy before public preview) and remain product/deploy decisions, not defects in the boundary. This review does not merge the PR; merge authority remains John's per the board's instructions.
