# Architecture review resolution

- **Source review:** Claude, commit `4324ecb` on `claude/codex-handoff-review-bc3ucm`
- **Reviewed proposal:** `81993ef`
- **Resolution status:** First pass resolved; second pass completed at `868c75c` and dispositioned separately
- **Canonical document:** [`../ARCHITECTURE.md`](../ARCHITECTURE.md)

## Disposition

| Finding | Resolution |
|---|---|
| F1 | Accepted: Firestore is authoritative; one transaction commits receipt, events, revision, and projections. RTDB is presence-only. |
| F2 | Accepted: typed anonymous actors, private safety receipts, ungated interrupts, and identity-free safety logs/tests. |
| F3 | Accepted: stable room-scoped member seats, replaceable UID bindings, and one-time recovery codes. |
| F4 | Accepted: projections are authoritative; event tails serve timeline/theatre only; no speculative domain state. |
| F5 | Accepted: receipt check/creation occurs inside the effects transaction; concurrent-duplicate proof added. |
| F6 | Accepted: revision guard is optional and command-family-specific; safety is never revision-gated. |
| F7 | Accepted: actor-private receipts contain stable codes/results without hidden messages. |
| F8 | Accepted: platform authorization precedes template authorization; pure query methods and event destinations added; full projections bounded to 64 KiB. |
| F9 | Accepted: README and focused architecture summaries now match the canonical document. |
| F10 | Partially accepted: the existing target was already warm-path-specific; cold-path measurement, billing, and optional warm-instance decision are now explicit. |
| F11 | Accepted: App Check, IP/room throttles, capacity, admission closure, kick, and code rotation added. |
| F12 | Accepted: snapshots are full authority state and service-only. |
| F13 | Accepted with adjustment: table is a read-only capability admitted by a separate code and cannot invoke safety commands. |
| F14 | Accepted: automated assertions are separated from manual VoiceOver/NVDA validation; focus/live-region/waiting semantics added. |
| L1 | Accepted: revision counts commands; sequence orders events, including multiple events per revision. |
| L2 | Superseded by Firestore authority; sequence is an indexed numeric field, not an RTDB key-order dependency. |
| L3 | Accepted: visibility-path gaps are expected and not used for reconstruction. |
| L4 | Accepted at first pass; subsequently refined by second-pass N6 to use `crypto.randomBytes` for one invocation seed and a deterministic retry-stable generator. Generated faces remain persisted. |
| L5 | Accepted: refresh proofs now cover outbox resubmission and theatre event replay. |
| L6 | Accepted: GM submits opposition inputs and the server generates faces. |
| L7 | Accepted: anonymous retention prompts are in-app; deletion automation remains gated. |
| L8 | Accepted: drafts are local-only in v1. |
| L9 | Accepted: opaque room IDs and service-only, rotatable room-code lookup are distinct. |
| L10 | Accepted: one seat/capability per identity is a v1 constraint; local multi-role simulation covers testing. |

## Second-pass acceptance checklist

The reviewer should verify, rather than assume, that:

1. The proposed Firestore document boundaries allow the complete command write set to fit in one transaction and security rules expose only the intended projection/event/receipt documents.
2. Transaction retries cannot repeat externally observable randomness or side effects.
3. Recovery-code generation, storage, redemption, revocation, and audit semantics do not create a second credential leak.
4. No safety actor identifier is available through event payloads, receipts, logs, timing metadata, or correlation fields.
5. Platform authorization cannot be bypassed or weakened by a template.
6. Player, GM, and table capabilities map coherently to routes and rules.
7. The three implementation PRs are independently testable and do not prematurely extract unused packages.
8. Canonical and supporting documents contain no remaining RTDB-authority, UID-keyed-private-state, client-replay, or broad first-PR claims.

## Remaining product decisions

- Distribution rights and approved placeholder fixture.
- Room admission mode: open code, passphrase, or explicit invites.
- Campaign retention/export/deletion values and recovery-code presentation UX.
- Firebase regions and separate staging/production projects before realtime work.
- Optional 3D dice, durable account linking, and hosting changes after the local slice.
