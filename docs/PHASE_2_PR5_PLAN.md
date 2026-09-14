# Phase 2 PR 5 plan — RTDB presence

- **Status:** Planning only. **Dependency-blocked**: PR 3 (anonymous auth, admission,
  GM claim) and PR 4 (trusted command authority) have not merged. No RTDB client
  code, Cloud Function, auth wiring, or rule file changes land in this document
  or its branch.
- **Scope authority:** `docs/PHASE_2_PLAN.md` PR 5; `docs/ARCHITECTURE.md`
  sections 8, 11–13; `docs/reviews/2026-09-14-phase-2-pr2-independent-review.md`
  finding S4.
- **Depends on:** PR 3 (an authenticated UID must be able to reach a bound member
  seat before presence has anyone meaningful to test against) and PR 4 (not a
  hard technical dependency for RTDB itself, but `docs/PHASE_2_PLAN.md`'s PR
  sequence places PR 5 after it, and this plan does not reopen that ordering).
- **Date:** 2026-09-13.

## 1. Why this is a plan, not an implementation

`docs/PHASE_2_PLAN.md` marks PR 5 as needing none of the three decisions in
`docs/PHASE_2_DECISION_BRIEF.md`, but it is not independent of PR 3. Presence
is keyed by Firebase Auth UID (`docs/ARCHITECTURE.md` section 8), and the only
way to get an authenticated UID that maps to a real member seat is PR 3's join
flow. Writing and testing real presence code today would mean either faking a
UID→member binding by hand (duplicating the very admission logic PR 3 owns) or
shipping presence code with no meaningful integration test — both cut against
`AGENTS.md`'s scope discipline ("do not pull forward later-phase concerns...
just because the contracts hint at them"). This document is the
implementation-ready design so that once PR 3 and PR 4 land, PR 5 is a
translation exercise, not a design exercise.

## 2. Scope and explicit exclusions

In scope for this document: the RTDB rules design (`.write`/`.validate`),
the connection/`onDisconnect` lifecycle design, UID-keyed presence semantics,
payload bounds, the client member-display lookup design, the disclosure
residuals, and the test matrices.

Explicitly out of scope for this document and for the eventual PR 5 unless
restated here:

- No live RTDB client code (no `onValue`/`onDisconnect`/`set` calls land in
  `apps/web`).
- No Cloud Functions.
- No auth or admission logic (PR 3's territory).
- No recovery-code redemption or old-UID presence deletion behavior (PR 6's
  territory; this plan only ensures PR 5's rules don't block PR 6's cleanup).
- No client reconnect/outbox logic (PR 7's territory).
- No production Firebase project or resources; no secrets.
- No generic rules-authoring DSL — the `.validate` design below is a fixed,
  narrow shape, not a general schema system.
- No later-phase feature (maps, encounters, broadcasts, safety interrupts,
  Resolution Theatre, a second template).
- No edits to `database.rules.json` or `firestore.rules` in this branch. The
  designed rule set in section 4.4 is a specification for the implementation
  PR to apply, not a change made here.

## 3. Recap: what PR 2 already shipped, and what S4 left open

PR 2 (`main`, `a40e7dc`) already implements the write-grant shape this plan
confirms:

```json
"presence": {
  "$roomId": {
    ".read": "auth != null",
    "$uid": {
      "$connectionId": {
        ".write": "auth != null && auth.uid === $uid"
      }
    }
  }
}
```

`packages/testing/test-emulator/roomRules.test.ts` already covers: own-UID
writes succeed, other-UID and unauthenticated writes fail, room-level reads
succeed for any authenticated user (member or not) and fail unauthenticated,
and the presence root and `/` stay unreadable. Finding S4
(`docs/reviews/2026-09-14-phase-2-pr2-independent-review.md`) recorded two
open items against this shape, both resolved by this plan:

1. No `.validate` — any authenticated UID can write arbitrary nested data
   under its own connection node. Section 4.3/4.4 close this.
2. The write-grant level (`{uid}` vs `{connectionId}`) was implemented but not
   argued. Section 4.2 confirms `{connectionId}` with rationale.

## 4. Data model and rules design

### 4.1 RTDB path and the one Firestore touch point

```
RTDB:   presence/{roomId}/{uid}/{connectionId}
Firestore: rooms/{roomId}/members/{memberId}.uid   (new field, see below)
```

Presence itself needs no new Firestore path. It needs one new **field** on an
existing, already-member-readable document: `members/{memberId}` gains a
`uid` field, written by the same transaction that already writes
`uidBindings/{uid}` on join (PR 3) and on rebind/kick (PR 6). This is not a
rule change — `firestore.rules`' existing `members/{memberId}` rule
(`allow read: if isMember(roomId)`) already grants every room member read
access to every other member's roster document, so adding `uid` there
exposes nothing beyond what any member can already see (display name,
capability). It is the one addition PR 3 and PR 6 must carry forward; see
section 8 and section 12.

### 4.2 Write-grant level: per-connection (confirmed), per-UID (rejected)

**Chosen: `{uid}/{connectionId}`**, matching PR 2's existing implementation.

| Option | Multi-tab/device behavior | Cleanup granularity |
|---|---|---|
| **`{uid}/{connectionId}`** (chosen) | Each tab/device owns one leaf. Closing one tab removes only that leaf; the UID still reads as online while any sibling connection node exists. | `onDisconnect` is registered per connection and only ever removes its own leaf. |
| `{uid}` (rejected) | A second tab's write overwrites the first tab's node (one value per UID). Closing whichever tab most recently registered `onDisconnect` deletes the *entire* UID node, so a still-open first tab now reads offline. | One `onDisconnect().remove()` per UID, but it races across tabs; last-registered wins, which is the wrong tab to trust. |

The per-UID scheme is Firebase's classic presence footgun: it reads clean but
produces a visible bug the moment one member opens the app in two tabs (or a
phone plus a laptop, an explicitly expected pattern for a 3–8-person session).
Per-connection avoids it entirely because "online" is redefined as "at least
one connection node exists for this UID," never "the most recent write."
`docs/reviews/2026-09-14-phase-2-pr2-independent-review.md` S4 flagged this
as a genuinely open choice (noting the competing PR #10 chose `{uid}`); this
plan resolves it in favor of `{connectionId}`, keeping PR 2's shape.

### 4.3 Connection payload: deliberately minimal

The connection node carries exactly one field:

```ts
{ connectedAt: number } // RTDB ServerValue.TIMESTAMP, resolved server-side
```

No client-supplied strings, device labels, or activity timestamps. Two
reasons, both tracing to `docs/ARCHITECTURE.md` section 11's threat table
("Spam/oversized payload" → "Runtime schemas, room capacity, App Check,
IP/room throttles"):

1. RTDB has no server-side redaction or moderation layer the way Firestore
   writes do (those go through the trusted Function). A free-text field under
   a path readable by any authenticated user — including non-members, per
   the documented residual — would be an unmoderated, semi-public write
   surface. Keeping the payload to a single server-resolved timestamp removes
   that surface entirely rather than trying to bound it.
2. Everything a client actually needs to *display* (name, capability, avatar)
   already lives in Firestore's `members/{memberId}` roster, which is
   authorized, moderatable-by-construction (service-written), and already
   readable to every member (section 4.1). Presence's only job is "is this
   UID connected, since when" — the join in section 8 supplies the rest.

If a future need arises for a small enum (e.g., `"active" | "idle"`), add it
as a second narrowly-typed, still-non-free-text field through the same
`.validate` pattern in section 4.4 — do not widen this into a general
payload.

### 4.4 Designed `database.rules.json` (specification for the implementation PR)

```json
{
  "rules": {
    ".read": false,
    ".write": false,
    "presence": {
      "$roomId": {
        ".read": "auth != null",
        "$uid": {
          "$connectionId": {
            ".write": "auth != null && auth.uid === $uid",
            ".validate": "newData.hasChildren(['connectedAt']) && newData.child('connectedAt').isNumber() && newData.child('connectedAt').val() <= now",
            "connectedAt": {
              ".validate": "newData.isNumber() && newData.val() <= now"
            },
            "$other": {
              ".validate": false
            }
          }
        }
      }
    }
  }
}
```

Rationale per clause:

- `.write` is unchanged from PR 2 — own-UID only, any room ID, any connection
  ID. RTDB cannot verify a Firestore binding (section 8), so "any room ID" is
  the accepted residual, not a gap this rule can close.
- `hasChildren(['connectedAt'])` requires the field to exist on every write —
  no empty/placeholder nodes.
- `connectedAt` must be a number `<= now`: rejects strings, booleans, nested
  objects, and future-dated timestamps (a client cannot claim to have
  connected "in the future" to manipulate ordering or sort-by-age displays).
- `"$other": { ".validate": false }` is a closed-shape guard: any key besides
  `connectedAt` fails validation, so the node cannot carry extra fields no
  matter what the client sends.
- Deletion (`set(null)`) is ungated by `.validate` (Realtime Database does
  not run `.validate` against a remove), so `own.set(null)` — the pattern
  the existing PR 2 test already exercises — keeps working unchanged.
- No explicit byte-size constant is needed (contrast
  `packages/contracts/src/size.ts`'s `PROJECTION_CEILING_BYTES`): a single
  numeric field is bounded to a few bytes by construction, so there is no
  variable-length input to cap.
- A per-UID cap on the *number* of simultaneous connection children is not
  expressible in RTDB rules (no child-count function). This is an accepted
  operational residual, bounded in practice by: requiring authentication,
  App Check monitoring (section 11, enforced before public preview), and the
  8-participant-plus-table room-capacity cap that already limits how many
  distinct UIDs can even exist in a room. Revisit only if abuse is observed.

## 5. UID-keyed presence semantics

- Presence is keyed by Firebase Auth **UID**, never by `memberId`. This is
  the architecture's explicit choice (section 8) because RTDB rules cannot
  read a Firestore binding to translate UID → member at write time.
- "Online" is defined as *at least one child node under `presence/{roomId}/{uid}`*.
  There is no explicit `online: true/false` boolean field — existence of a
  connection node **is** the online signal, and its absence **is** offline.
  This keeps section 4.3's minimal payload consistent with the presence
  semantics: nothing needs to be flipped or cleared, only added and removed.
- A UID can have zero, one, or several connection nodes (multi-tab,
  multi-device). The room's presence view is the set of UIDs with at least
  one live child, not a flat list of connections, though the connection-level
  detail remains available for diagnostics.
- Presence carries no history. RTDB retains no "last seen" beyond what a
  still-live `connectedAt` on an existing node happens to record; once a node
  is removed, the fact that UID was ever connected is gone. This matches
  `docs/ARCHITECTURE.md` section 8's retention table: "Presence expires on
  disconnect/TTL" is not a policy choice PR 5 makes — it is the mechanism.
- Presence never gates authorization. It is a display signal only; every
  authorization decision continues to run through Firestore rules and, from
  PR 4 onward, the trusted Function. A UID with no presence node can still
  hold a valid, currently-inactive member seat.

## 6. Connection and `onDisconnect` lifecycle

This is the client-side sequence the implementation PR must follow. Described
as a sequence, not code, since no RTDB client code lands in this PR.

1. On mount (after the client has an authenticated UID and has subscribed to
   its own member projection, i.e., after PR 3's join flow completes),
   generate a `connectionId` client-side (a random, opaque token — a UUID is
   sufficient; the value has no meaning to the server) and hold it in memory
   only. It is never persisted to storage and never reused across a reload.
2. Subscribe to `.info/connected`.
3. On each transition to `true` (initial connect, and every reconnect after a
   drop — `onDisconnect` registrations do not survive a disconnect and must
   be redone every time `.info/connected` flips back to `true`):
   a. Register `onDisconnect()` on
      `presence/{roomId}/{uid}/{connectionId}` to remove that node.
   b. Only after the `onDisconnect` registration is acknowledged, write
      `{ connectedAt: ServerValue.TIMESTAMP }` to the same path.
   Registering `onDisconnect` before the write (not after) closes the race
   where the socket drops between the write and the registration, which
   would otherwise leave an orphaned node with no matching cleanup queued.
4. On a clean, voluntary teardown (explicit leave-room action, or component
   unmount while still connected), call `remove()` on the connection node
   directly rather than relying solely on the queued `onDisconnect`, since
   the server-side `onDisconnect` fire has no guaranteed latency bound and a
   deliberate leave should reflect immediately.
5. Do not write any other RTDB path. Presence is the only client-direct RTDB
   write in this architecture (section 8: "Game commands go through
   Functions; direct client writes are limited to presence...").

## 7. Reconnect and multi-tab/device behavior

- **Same-tab network blip:** `.info/connected` flips `false` then `true`.
  Step 3 above re-runs in full (re-register `onDisconnect`, rewrite the same
  `connectionId`'s node with a fresh `connectedAt`). The implementation PR's
  test must specifically verify the *re-registration*, not just the rewrite —
  a bug that writes the node but forgets to re-arm `onDisconnect` would look
  correct until the *next* disconnect, when cleanup silently stops happening.
- **Full reload:** the in-memory `connectionId` is lost, so the client
  generates a new one on remount. The old connection's node is cleaned up by
  its still-queued server-side `onDisconnect` once the old page's socket
  actually closes (which a reload does trigger). Never persist `connectionId`
  across a reload specifically to avoid two live tabs colliding on one
  connection node's `onDisconnect` registration.
- **Two tabs, one UID:** two independent `connectionId`s, two independent
  nodes, two independent `onDisconnect` registrations. Closing one tab
  removes only its node; the room correctly still shows the UID online via
  the other tab's node (this is the property section 4.2 chose the
  per-connection grant to guarantee).
- **Seat rebind / kick (PR 6):** out of scope to implement here. PR 5's rules
  place no obstacle in front of PR 6's old-UID presence deletion (the
  service, not the client, deletes it — presence rules only ever gate the
  connection-owning UID's own writes). The already-documented residual
  (`docs/ARCHITECTURE.md` section 8, third-pass review R5: the old UID can
  re-create its own presence node until its session ends, since its
  `$uid === auth.uid` write grant remains valid after redemption) is
  unchanged by this plan and remains PR 6's to test, not PR 5's.

## 8. Client member-display lookup (authorized Firestore data only)

The task constraint here is narrow and important: presence gives a client a
set of online **UIDs**; turning that into "Player A and the GM are online"
must use only data the client is already authorized to read — no new
service-only reverse-index exposure.

Design:

1. Subscribe to `presence/{roomId}` (already authorized per section 4.4 — any
   authenticated user, residual documented in section 9).
2. Subscribe to the `members` collection under the room (already authorized
   to every member via `firestore.rules`' existing `members/{memberId}` rule
   — this is the roster, not a new read).
3. Client-side only (never sent anywhere, never used for authorization): join
   the two sets on the `uid` field added in section 4.1. A member whose `uid`
   appears among the live presence UIDs displays as online; everyone else
   displays as offline. A presence UID with no matching member `uid` (see
   section 9) displays as nothing — the client has no member data to render
   for it.
4. This join is purely a display computation. It must never be used to infer
   membership or capability — those questions are always answered by
   Firestore rules and, from PR 4 on, the Function's platform authorization,
   never by whether a UID happens to appear under `presence/{roomId}`.

No new Firestore path, index, or rule is needed beyond the single `uid` field
addition in section 4.1 — the roster read is already granted.

## 9. Non-member and room-ID disclosure residuals (explicit and bounded)

Both residuals below are already accepted in `docs/ARCHITECTURE.md` section 8
and reconfirmed by PR 2's review (S4). This plan restates them precisely so
the implementation PR can test the *boundary*, not just note the residual
exists.

**Residual 1 — room-ID disclosure.** Any authenticated Firebase user (not
just a room member) who knows or guesses a `roomId` can read
`presence/{roomId}` and see every connected UID plus its `connectedAt`
timestamps. Bound: this is strictly less than membership — Firestore's
`firestore.rules` still denies that same non-member every other room path
(`meta/current`, `members/{memberId}`, every projection, every event
partition), so an outsider with a room ID sees *opaque UID churn and
timing only*, never a display name, never game content, never which UID
belongs to which role. `roomId` itself is not the human-shareable room code
(`roomCodes/{code}` is a separate, service-only, rotatable index per section
8 — "Human room codes are locators, not secrets," a stronger statement about
codes than about raw document IDs); this plan does not change or widen that
distinction, only notes that presence's read grant is keyed to the same
`roomId` an outsider would need to already have obtained some other way (for
example, by having briefly been a member, or by network inspection of their
own room's traffic).

**Residual 2 — non-member UID visibility.** A signed-in user who is not a
room member at all (never joined, or was kicked) can still read
`presence/{roomId}` if they know the `roomId`, for the same reason as
Residual 1. This is unavoidable without duplicating Firestore's membership
check inside RTDB rules, which section 8 explicitly rejects as a design
("RTDB cannot verify a Firestore binding... If that residual disclosure
becomes unacceptable, replace presence tokens with short-lived signed room
claims rather than duplicating authorization state across databases").

**What remains bounded regardless of either residual:**

- No RTDB path ever reveals a display name, capability, or any game state —
  only opaque UIDs and connection timestamps (enforced by section 4.4's
  closed-shape `.validate`).
- The presence *root* (`presence` with no `$roomId`) and the database root
  (`/`) stay unreadable, so `roomId`s cannot be enumerated from RTDB itself
  (already tested in `roomRules.test.ts`; section 10 keeps that regression
  test).
- A UID can only ever write its own node (`auth.uid === $uid`); it can never
  forge another UID's presence or falsify who is connected.

**Escalation path if this becomes unacceptable:** documented already in
section 8 — replace the room-ID-keyed presence read with short-lived signed
room claims. Not proposed here; this plan only confirms the residual is
still the intended, bounded shape.

## 10. Emulator allow/deny matrix

Extends `packages/testing/test-emulator/roomRules.test.ts`'s existing
presence tests (which already cover own/other/unauthenticated writes and the
room-level read residual) with the `.validate` and Firestore `uid`-field
coverage this plan adds. All rows are for the implementation PR to write;
none exist yet.

| # | Actor | Path / operation | Payload | Expected |
|---|---|---|---|---|
| 1 | Own UID | write `presence/{room}/{uid}/{conn}` | `{ connectedAt: <=now number }` | **Allow** |
| 2 | Own UID | write same path | `{ connectedAt: <future number> }` | **Deny** |
| 3 | Own UID | write same path | `{ connectedAt: "now" }` (string) | **Deny** |
| 4 | Own UID | write same path | `{ connectedAt: <=now>, extra: "x" }` | **Deny** |
| 5 | Own UID | write same path | `{}` (missing `connectedAt`) | **Deny** |
| 6 | Own UID | write same path | `null` (delete) | **Allow** (unchanged from PR 2) |
| 7 | Other UID | write `presence/{room}/{ownerUid}/{conn}` | valid payload | **Deny** (unchanged from PR 2) |
| 8 | Unauthenticated | write any presence path | valid payload | **Deny** (unchanged from PR 2) |
| 9 | Own UID | write a second `connectionId` under the same UID | valid payload | **Allow** (multi-connection is intended) |
| 10 | Signed-in member | read `presence/{room}` | — | **Allow** (unchanged) |
| 11 | Signed-in non-member | read `presence/{room}` | — | **Allow** — documented residual (unchanged, re-asserted per section 9) |
| 12 | Unauthenticated | read `presence/{room}` | — | **Deny** (unchanged) |
| 13 | Any authenticated | read `presence` (root) | — | **Deny** (unchanged) |
| 14 | Any authenticated | read `/` | — | **Deny** (unchanged) |
| 15 | Any room member | read `members/{memberId}` including the new `uid` field | — | **Allow** — no rule change; regression-guards that adding `uid` did not require (or accidentally get) a rule change |
| 16 | Any room member | read `uidBindings/{anyUid}` | — | **Deny** — regression guard that the `members.uid` addition did not loosen the still-service-only reverse index |

## 11. Cleanup/reconnect/failure-injection test matrix

These are integration-level, client-SDK-against-emulator tests (not pure
rules tests), because `onDisconnect` and `.info/connected` are protocol
behaviors, not authorization rules. They belong in the implementation PR, not
this document, but are specified now so that PR is a build, not a design.

| # | Scenario | Expected behavior | Notes |
|---|---|---|---|
| 1 | Clean disconnect (`goOffline()` / socket close) with one open connection | The connection's node is removed within the emulator's `onDisconnect` propagation | Verifies the `onDisconnect` queue actually fires against the emulator, not just that it was registered |
| 2 | Two connections (simulated two tabs) for one UID; one disconnects | Only that connection's node is removed; the sibling node (and thus "online" status) survives | Directly exercises section 4.2's rationale for the per-connection grant |
| 3 | Reconnect after a blip (force `.info/connected` false→true) | `onDisconnect` is re-registered; a *second* forced disconnect afterward still removes the node | Catches "wrote the node but forgot to re-arm `onDisconnect`" bugs, which pass a naive single-disconnect test |
| 4 | Full reload (new `connectionId`, old socket closes) | New node appears under a new `connectionId`; old node is cleaned up by its own queued `onDisconnect` | Confirms `connectionId`s are correctly not reused across reload |
| 5 | Malformed write rejected by `.validate` | The connection node is left absent (or unchanged, if one already existed), never partially written | `.validate` failures are all-or-nothing per Realtime Database's write semantics |
| 6 | Explicit leave (voluntary `remove()`) while still connected | Node is removed immediately, not after the `onDisconnect` propagation delay | Exercises step 4 of section 6 |
| 7 | Old UID after PR 6 recovery redemption re-creates a presence node on its next `.info/connected` tick | Node re-appears; this is the accepted R5 residual, not a PR 5 defect | Out of scope to fix here; include as a documentation-only regression assertion once PR 6 lands, not as a PR 5 gate |

**Tooling note for the implementation PR:** confirm at build time whether
`@firebase/rules-unit-testing`'s `RulesTestContext.database()` exposes a full
enough `.info/connected`/`onDisconnect` surface against the RTDB emulator for
rows 1–6, or whether those rows need the plain `firebase` client SDK's
`connectDatabaseEmulator` instead (with `goOffline()`/context teardown used
to simulate a socket drop). `roomRules.test.ts`'s existing presence tests
only exercise single writes/reads and do not currently prove either way.

## 12. Interactions with PR 3, PR 4, PR 6, PR 7

- **PR 3** must write the `members/{memberId}.uid` field (section 4.1) inside
  its existing seat-creation transaction (the same one that already writes
  `bindings`, `uidBindings`, and `members` per `docs/PHASE_2_PLAN.md` PR 3).
  This is one additional field on an already-planned write, not a new
  transaction or command.
- **PR 4** has no presence-specific obligation; it is listed in
  `docs/PHASE_2_PLAN.md`'s sequence purely as the PR before PR 5, not as a
  technical dependency this plan introduces.
- **PR 6** must keep `members/{memberId}.uid` in sync on rebind and kick (the
  same transaction that already updates `uidBindings` on those operations),
  and owns the R5 residual and old-UID presence deletion behavior described
  in section 7 and tested per section 11 row 7.
- **PR 7** (client reconnect/outbox) is presence-adjacent but independent:
  presence reconnection (section 7) is a Realtime Database protocol concern,
  while PR 7's reconnect/outbox is a Firestore command-replay concern. They
  share no rule surface; the only shared concept is "the client is offline
  and comes back," handled independently in each database.

## 13. Acceptance checklist for the implementation PR

- [ ] `database.rules.json` updated to section 4.4's design (or a documented,
      reasoned deviation).
- [ ] `members/{memberId}.uid` written by PR 3's join transaction (carried by
      PR 3, verified here as a precondition).
- [ ] `members/{memberId}.uid` kept in sync by PR 6's rebind/kick transactions.
- [ ] Section 10's full allow/deny matrix passes against the emulator.
- [ ] Section 11's cleanup/reconnect matrix passes against the emulator, with
      the tooling question resolved and recorded.
- [ ] Client connection/`onDisconnect` lifecycle matches section 6 exactly,
      including the register-before-write ordering.
- [ ] Client member-display lookup matches section 8: computed client-side
      only from `presence/{roomId}` plus the `members` collection, never from
      any new or widened service-only read.
- [ ] No new client-writable RTDB path beyond
      `presence/{roomId}/{uid}/{connectionId}`.
- [ ] `docs/ARCHITECTURE.md` section 8's residual language is re-checked
      against section 9 of this plan and updated only if the implementation
      diverges from what is designed here.
- [ ] Independently reviewed per `AGENTS.md` before merge, per the same
      pattern as `docs/reviews/2026-09-14-phase-2-pr2-independent-review.md`.

## 14. Open questions / follow-ups

- This plan does not modify `docs/PHASE_2_PLAN.md`'s acceptance matrix. That
  matrix has no numbered row for presence connect/disconnect correctness
  itself (only row 16, the R5 old-UID residual, which is PR 6-scoped). The
  implementation PR should consider whether to propose adding one when it
  lands, rather than this plan pre-deciding it.
- Section 4.3's decision to keep the payload to a single field is a
  recommendation, not a locked architecture decision — if product wants a
  lightweight "idle/active" indicator later, section 4.3 already describes
  how to extend the `.validate` shape without redesigning the write grant.
- The room-ID disclosure residual (section 9) has a stated escalation path
  (signed room claims) already in `docs/ARCHITECTURE.md` section 8. This plan
  does not trigger it; it only restates the bound.
