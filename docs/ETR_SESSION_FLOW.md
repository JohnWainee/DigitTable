# Eat the Reich session flow specification (F02)

- **Status:** Fable deliverable for issue #14 task F02. Specification only. Sonnet A implements transport/room commands (A02–A06), Sonnet B the template commands (B02–B04), Sonnet C the screens (C01–C05).
- **Inputs:** `docs/ETR_RULES_MATRIX.md` (F01), `docs/ARCHITECTURE.md` sections 6, 8, 9, 11, `docs/UX_RESOLUTION_THEATRE.md`, PR #13's admission contracts (`packages/contracts/src/admission.ts`, `apps/functions/src/callables.ts`), and the shipped component structure on `main` (`apps/web/src/{App,player/*,gm/*,table/*,shared/*}`).
- **Binding constraints restated:** secrets never appear in URLs, shared documents, logs, or any non-owner projection; the role in the URL is presentation intent, not authorization; clients render projections only and never rebuild state from events; every command carries a client-minted `commandId` and retries reproduce the original result.

## 1. Surfaces and routes

| Route | Surface | Device target | Component (existing → new) |
|---|---|---|---|
| `/` | Landing: Create / Join / Resume | any | `App.tsx` becomes a router; new `LandingScreen` |
| `/create` | Create session (GM) | desktop, works on phone | new `CreateSessionScreen` |
| `/join` | Join by code + passphrase; claim a character | phone | new `JoinScreen`, new `ClaimCharacterScreen` |
| `/table` | Join a shared display with code + table code | large display | new `JoinTableScreen` |
| `/room/:roomId/player` | Player dashboard | phone portrait | `PlayerScreen` (extended), `ComposeStep`, `ActiveRollPanel`, `ConfirmStep`, `AllocationStepper`, `PoolExplanationDetails`, `LiveRegion` |
| `/room/:roomId/gm` | Director console | desktop | `GmScreen` (extended), new `SceneDirector`, `RosterPanel`, `CorrectionDialog`, `InvitePanel` |
| `/room/:roomId/table` | Read-only display | TV/projector | `TableScreen` (extended), new `RouteMap` (SVG) |

The Phase 1C tab switcher stays available only in **fixture mode** (`?fixture=1` or no Firebase config), clearly labelled "Local fixture — not a live room" in the header and in the document title.

## 2. Identity, connection and outbox states (shared by every surface)

Every surface shows one of these in a persistent status strip (top of screen, `role="status"`, polite):

| State | Meaning | UI |
|---|---|---|
| `connecting` | anonymous sign-in or first projection load in flight | skeleton + "Connecting…"; no controls |
| `live` | projection subscription active | normal |
| `reconnecting` | subscription lost; last projection still shown | banner "Reconnecting… showing last known state"; action buttons disabled but visible |
| `stale-input` | a command was rejected with `REVISION_CONFLICT` | inline alert on the control; the control re-derives from the fresh projection |
| `signed-out` | identity lost (storage cleared) | "Your seat is on another identity. Enter your recovery code." |

Command (outbox) states, shown on the control that issued the command:

| State | Meaning | UI |
|---|---|---|
| `pending` | sent, no receipt yet | control disabled, spinner, "Sending…" (never optimistic domain updates) |
| `accepted` | receipt accepted | control clears; projection update renders the result |
| `rejected(code)` | stable error | inline message from the table in §9; control re-enabled |
| `disconnected` | disconnect after send, before response (A02 `SessionRequestState`) | on reconnect, reconcile via receipt; show "Checking whether your last action went through…" then resolve to accepted/rejected; **never mint a new requestId/commandId for the same intent** |

These are A02's `SessionRequestState` statuses (`idle | pending | accepted | rejected | disconnected`, `packages/contracts/src/session.ts`), reused unchanged for pre-membership requests and game commands.

## 3. Create session (GM)

**Precondition:** none (anyone can create; anonymous identity is obtained on submit).

Form fields (bounded per A02's `parseCreateRoomInput`, `packages/contracts/src/session.ts`): session name (`sessionName`, 1–60 chars), passphrase (4–128), your display name (`creatorDisplayName`, 1–40, at least one visible character). Template is fixed to Eat the Reich and shown, not selectable. Reinforcements mode (F01 S7) is **not** a creation field; it is a GM console setting (§7) defaulting to "book".

Client behaviour:

1. On first render mint `requestId` (UUID, 8–128 chars) and persist it in local storage keyed by the form instance; reuse it on every retry of this form until success (A02 `RequestId`).
2. Submit → `createRoom` callable with `CreateRoomInput { requestId, sessionName, passphrase, creatorDisplayName }` → state `pending`. Double-click cannot mint a second request.
3. Success returns A02's `RoomAdmissionAccepted { ok, roomId, roomCode, memberId, capability: "gm", recoveryCode, roomRevision }`. **Gap for A03:** the flow also needs the distinct **table code** shown once at creation; A03 must either add `tableCode: string | null` to the createRoom result (non-null only on first acceptance) or provide a GM-only `rotateTableCode` command whose result reveals it once. The client shows the **reveal card** once:
   - Room code (locator, can be re-shown later from the GM console),
   - Passphrase (echo of what they typed; never returned by the server; not stored in shared docs),
   - Table code (shown once; GM can rotate later),
   - GM recovery code (shown once).
   - Checkbox "I have written these down" enables "Open director console" → navigate to `/room/:roomId/gm`.
4. Lost response (tab closed during `pending`): on return, the form offers "Finish creating the session you started?" which re-submits the same `requestId`; the backend returns the same receipt **without** secrets (they were shown once). The card then says "Secrets were shown once at creation. Rotate the table code from the console if you did not record it."

Errors: `RATE_LIMITED` ("Too many sessions created from here; try again in a minute"), `INVALID_REQUEST` (field-level messages from client validation; server message generic), network failure (retry with the same `requestId`).

**Acceptance examples**

- *Given* a GM fills the form and taps Create twice quickly, *then* exactly one room exists and the second tap shows the same reveal card.
- *Given* the GM closes the tab while `pending`, *when* they reopen `/create`, *then* they are offered to finish the pending creation and land in the same room, and no second room appears in the GM's list.
- *Given* a GM console is open, *then* the passphrase and table code are never present in the DOM, URL, page title, or any projection document.

## 4. Invite, join and character claim

### 4.1 GM invite panel (`InvitePanel`, GM only)

Shows: room code (large), a "Show passphrase hint" that displays only the passphrase's first character and length (never the passphrase), "Rotate table code" (confirms; new code shown once), "Rotate my recovery code" (shown once), join count `n/8`, and "Close admissions" toggle (F01 T-level control from PR #13's `admissionStatus`).

### 4.2 Player join (`JoinScreen`, phone)

Fields: room code (uppercase, letters/digits/hyphen), passphrase, display name. Submit → `admitMember{ requestedCapability: "player" }`.

- Success with `recoveryCode !== null`: show it once with "I wrote it down" gate, then `ClaimCharacterScreen`.
- Success with `recoveryCode === null` (same identity reconnecting): go straight to the player dashboard (resume).
- Errors: `ROOM_NOT_FOUND`, `INVALID_PASSPHRASE` (same message for both: "Code or passphrase not recognised" to avoid oracle), `ROOM_FULL`, `ADMISSION_CLOSED`, `RATE_LIMITED`, `ROOM_ARCHIVED`.

### 4.3 Character claim (`ClaimCharacterScreen`)

Renders the roster from the player's projection: each card = portrait (or fallback monogram), name, one-line concept, seven stats, and status `available` / `claimed by {displayName}` / `yours`.

- Tap "Claim" → `ClaimCharacter{ characterId, expectedRevision }`.
- `CHARACTER_TAKEN` or `REVISION_CONFLICT` → card flips to "claimed by …" from the fresh projection; alert "Someone claimed {name} a moment ago."
- A member may hold exactly one character; claiming another first requires `ReleaseCharacter` (or a GM reassignment).
- Late joiner mid-scene sees the same screen; unclaimed characters remain claimable; after claim they land on the dashboard in the current scene with the current round state.

### 4.4 Table join (`JoinTableScreen`)

Room code + table code → `admitMember{ requestedCapability: "table" }`. No display name is required (defaults to "Table"). One table seat per room; second attempt → `ROOM_FULL` with message "This room already has a shared display."

**Acceptance examples**

- *Given* two phones claim Rook at the same revision, *then* exactly one succeeds; the other sees "claimed by" within one projection update and no duplicate character binding exists in authority.
- *Given* a player joined and closed the browser, *when* they reopen the same browser, *then* they land on their dashboard without re-entering the passphrase and without a new recovery code being minted.
- *Given* the table display, *then* it renders no buttons or inputs after admission, and its projection contains no `self`, no GM notes, no unrevealed threats, and no other member's private fields.

## 5. Briefing and scene start (GM)

`SceneDirector` (GM): lists the original scene fixture (F01 Appendix C) plus any owner private pack scenes if loaded. "Load scene" → `LoadScene{ sceneId }` (allowed only when no scene is active or the active scene is `completed`). Loading sets `round = 1`, clears `actedThisRound`, instantiates the scene's Objectives/Threats (unrevealed threats stay hidden), and emits `SceneStarted` to shared.

Players see: scene title, location art, primary Objective card (rating/challenge), revealed Threat cards (rating/attack/challenge), party strip (each character: portrait, Blood, injury pips, downed flag). "Briefing" is narrative; the GM reads it aloud. Optional GM "broadcast a line of text to all" is **deferred** (Phase 3).

## 6. The action loop (player + GM)

State names extend `docs/UX_RESOLUTION_THEATRE.md`'s machine. One roll per character at a time; several characters may have rolls open concurrently (the GM reviews them in order).

```text
compose → declared (awaiting_gm_review) → rolled (awaiting_allocation)
        → allocated (applying: injury/downed/reinforcement bump) → resolved
declared ──GM strikes claims──▶ rolled (with fewer dice)
rolled ──Flashback (P1)──▶ rolled (rerolled)
any ──scene change/pause──▶ interrupted (see §8)
```

### 6.1 Compose (`ComposeStep`, phone)

Derived only from the projection and `explainPool`:

- **Stat** radio group (7, plus "No stat fits (2 dice)"), showing each rating after injury deltas.
- **Items** checklist: name, uses `n/m`, bonus requirement text; depleted items disabled with "no uses left"; `oneItemPerTurn` injury limits selection to one.
- **Abilities** checklist: only `blood`-cost and free-use abilities; each shows cost; disabled if Blood is insufficient or `noBloodSpend` applies; SPECIALs are listed read-only with "activate with a critical when allocating".
- **Bonus claims**: for each selected item/ability, a checkbox "I'm meeting its bonus requirement" with the "+" count; disabled under `noBonusDice`. A free-text "how" (≤140 chars) is optional and shown to the GM only.
- **Targets**: which Threats you are engaging (multi-select of revealed threats; the GM confirms/changes this).
- **Pool preview**: "Why?" disclosure (existing `PoolExplanationDetails`) lists stat, items, abilities, claimed bonus (marked "pending GM"), last-use bonus, and the total.
- Primary button "Declare action". Disabled when: not your turn this round (`actedThisRound` contains you) → message "You've acted this round; waiting for the GM to end the round"; downed → "You're down. A teammate must rescue you"; retired → "Your story is told"; paused → "Session paused".

`BeginAction{ characterId, stat, itemIds, abilityIds, bonusClaims[], engagedThreatIds[], note? }` → `declared`. Blood and item uses are **not** charged until the GM review resolves (so a struck declaration costs nothing). The player sees "Declared. Waiting for the GM to confirm bonus dice and opposition." (announced once).

### 6.2 GM review (`GmScreen` → "Pending actions" list)

Each pending declaration card shows the actor, stat, items/abilities, claimed bonuses with the player's note, engaged threats, and the resulting dice count. Controls: per-claim approve/strike toggles (default approve), engaged threats multi-select (default = player's choice), "Roll it" button → `ReviewAction{ rollId, approvedClaimIds[], engagedThreatIds[] }`.

Server, in one command: charges Blood/item uses, computes the pool, rolls player dice and the Attack dice from the same seed, applies passive triggers (F01 D5), stores faces, emits `ActionRolled` (player faces public; GM attack faces public; nothing hidden here in ETR).

### 6.3 Allocate (`ActiveRollPanel`, phone)

Shows the kept dice as tappable chips (face, "success"/"critical"), the discarded dice greyed, and the GM's Attack successes as red pips. Targets are a list from `validAllocations`:

- Each Objective (name, rating, challenge), each Threat (name, rating, attack, challenge), Defend (pips remaining), Feed (Blood n/10), and one row per SPECIAL the character can trigger (needs a critical).
- Interaction: tap a die, then tap a target (or keyboard: die chips are radio buttons; targets are buttons; Enter assigns). `AllocationStepper` is reused for a "quick assign N to this target" alternative.
- Running totals per target show projected effect after Challenge ("−1 rating (Challenge absorbs 2)"), Blood after feeding, and attack pips left → predicted outcome line: "No injury" / "1 injury" / "Downed!".
- Flashback button (P1) visible when kept dice ≤ 2 and unused.
- "Confirm" disabled until every kept die is assigned.

`AllocateResults{ rollId, allocations: {dieIndex, target}[] }` → server applies effects, rolls the injury category if needed, applies the zero-success Attack bump, records `actedThisRound`, emits `ActionResolved` plus `InjuryMarked`/`CharacterDowned`/`ObjectiveCompleted`/`ThreatBeaten` as applicable.

If the rolled injury category is full, the resolution stores `injuryChoicePending` and the player gets `ChooseInjuryCategory{ rollId, category }`; until chosen, that character cannot declare again, and the GM can choose for them with a correction.

### 6.4 Confirm (`ConfirmStep`)

Summary from the projection (never local arithmetic): dice, what changed on each target, Blood delta, injury (name + penalty text), downed/rescue objective created, "Your turn is done this round". Button "Back to scene".

**Acceptance examples**

- *Given* Rook declares SNEAK with the pistol and claims "+ close quarters", *when* the GM strikes the claim and rolls, *then* the pool is 5 dice not 6, one pistol use is spent exactly once, and a retry of `ReviewAction` with the same commandId changes nothing.
- *Given* faces [6,5,4,3,1] and two Attack successes, *when* the player assigns 6 → Objective (challenge 1), 5 → Defend, 4 → Feed, *then* the objective drops by 1, one attack pip is removed, Blood becomes 1, one attack success remains, one injury category is rolled and marked, and the table shows all of this without the GM's notes.
- *Given* a player assigns a 4 to a SPECIAL, *then* the client never offers it and the server rejects it with `INVALID_ALLOCATION`.
- *Given* the player's phone loses connection after tapping Confirm, *when* it reconnects, *then* the receipt is reconciled, the resolved summary appears, and no second allocation is sent.

## 7. GM director controls (`SceneDirector`, `RosterPanel`, `CorrectionDialog`)

| Control | Command | Guard | Audit |
|---|---|---|---|
| Reveal threat | `RevealThreat{threatId}` | scene active | shared event |
| Add/edit objective or threat | `EditScene{...}` with reason | scene active | GM event + shared "The GM adjusted the scene" |
| End round | `EndRound` | no pending review; open allocations allowed → they stay open across the round boundary? **No:** `EndRound` is rejected with `ROUND_HAS_OPEN_ROLLS` listing them; GM must resolve or void them | shared event with reinforcement deltas |
| Next scene | `NextScene{sceneId}` | primary objective complete **or** GM reason provided; no open rolls (else reject `SCENE_HAS_OPEN_ROLLS`; GM may void each with reason) | shared |
| End mission | `EndMission` | final scene objective complete or reason | shared; epilogue prompt to each player |
| Correct character | `CorrectCharacter{characterId, patch, reason}` — Blood, uses, injuries, downed/retired flags, active loot | bounded: Blood 0–10, uses 0–max, boxes boolean | GM event; player sees "The GM corrected {field}: {reason}" |
| Void a roll | `VoidRoll{rollId, reason}` | roll not resolved | refunds Blood/uses charged at review; shared "action withdrawn" |
| Grant item / advance | `GrantItem`, `UnlockAdvance` | reason optional | shared |
| Reassign / release character | `ReassignCharacter{characterId, memberId?}` | — | shared |
| Pause / Resume | `Pause`, `Resume` | anyone (player or GM) may pause; only GM resumes | shared event with anonymous actor; **no** actor in any client path |
| Kick member / rotate codes | PR #13 + A06 commands | — | GM event |
| Reinforcements mode | `SetSceneRules{ reinforcements: "book" \| "simplified", reason }` | scene not mid-round-end | shared "The GM changed the reinforcement rule" |

The GM console also shows: every character's full sheet (Blood, injuries, items, abilities, advances), each threat's `notes` and unrevealed threats (GM-only), round number, and who has acted.

## 8. Interrupts: pause, scene change, disconnect

- **Pause:** all surfaces show "Paused" over the action area; declare/review/allocate controls disabled; open rolls are preserved untouched. Resume re-enables. The table shows "Paused" with no name.
- **Scene change with open rolls:** blocked (see §7). The GM voids or resolves first. This is the explicit "interrupted-roll" behaviour B04 asked for.
- **Player disconnects mid-roll:** the roll stays open; the GM sees "{name} is offline" from presence and may void with reason or wait. On reconnect the player sees the roll exactly where it was.
- **GM disconnects:** players see "Waiting for the GM to reconnect"; nothing is auto-resolved.
- **Identity loss:** recovery code entry (`RecoverSeat`, A06) rebinds the seat; the previous identity loses access; the character binding is unchanged.

## 9. Error and empty states

| Code | Where | Player/GM text |
|---|---|---|
| `AUTH_REQUIRED` | any callable | "Signing you in…" then retry once; else "Could not sign in. Check your connection." |
| `ROOM_NOT_FOUND` / `INVALID_PASSPHRASE` | join | "Code or passphrase not recognised." |
| `ROOM_FULL` | join | "This session is full (8 seats)." |
| `ADMISSION_CLOSED` | join | "The GM has closed the doors for now." |
| `RATE_LIMITED` | join/create | "Too many attempts. Wait a minute and try again." |
| `ROOM_ARCHIVED` | any | "This session has ended." |
| `ROLE_FORBIDDEN` | any | "You can't do that from this seat." |
| `REVISION_CONFLICT` | claim/allocate | "Things changed while you decided. Take another look." (control re-derives) |
| `ROLL_ALREADY_RESOLVED` | allocate | "That roll was already resolved." |
| `INVALID_ALLOCATION` | allocate | "Assign every kept die to a valid target." + specific reason |
| `CHARACTER_TAKEN` | claim | "{name} was just claimed by someone else." |
| `NOT_YOUR_TURN` | declare | "You've acted this round." |
| `CHARACTER_DOWNED` / `CHARACTER_RETIRED` | declare | as §6.1 |
| `INSUFFICIENT_BLOOD` / `ITEM_DEPLETED` | declare | "Not enough Blood for {ability}." / "{item} has no uses left." |
| `ROUND_HAS_OPEN_ROLLS` / `SCENE_HAS_OPEN_ROLLS` | GM | "Resolve or withdraw: {list}" |
| `ROOM_DATA_INVALID` | any | "This session's data could not be verified. Ask the GM." |
| `INVALID_REQUEST` / `PAYLOAD_TOO_LARGE` | any | "That didn't go through. Try again." |

Empty states: no scene loaded (players: "The GM is preparing the first scene"; table: hero art + session name + "Waiting to begin"); no revealed threats ("No opposition… yet"); no items with uses ("Everything's spent — loot something"); roster fully claimed for a late joiner ("All six are taken. Ask the GM to free one").

## 10. Read-only table information

Shows: session name, scene title and art, route map with the current node highlighted and completed nodes stamped, primary Objective (rating/challenge) and revealed Threats (rating/attack/challenge), party strip (portrait, name, Blood, injury pips, downed), the current roll(s) in progress with kept dice once rolled, the last three resolved summaries, round number, "Paused". Never: GM notes, unrevealed threats, bonus-claim notes, pending declarations' details beyond "{name} is acting", any code or passphrase.

## 11. Fixture mode

With no Firebase configuration the app runs the in-memory repository. It must: label itself "Local fixture" in the header and title; expose the Phase 1C role switcher; drive the identical screens and commands. Nothing else may differ, so C's screens are testable before A05 lands.

## 12. Reconciliation with A02 (PR #15, `sonnet-a/a02` @ af20261)

Adopted from A02 as published: `CreateRoomInput`/`JoinRoomInput`/`ClaimGmSeatInput` (with `requestId`), `RoomAdmissionAccepted`/`RoomAdmissionRejected`, `ViewerRoute`/`viewerRouteForCapability` (matches §1), `SessionRequestState` (§2), `SessionOwnershipRecord` (client-local resume record), `queryProjection` selectors, and the fixture builders in `packages/testing/src/builders.ts`.

Still open, owned as noted:

- **Table code at creation** (§3 gap) — A03.
- **Stable error additions** from §9 (`CHARACTER_TAKEN`, `NOT_YOUR_TURN`, `CHARACTER_DOWNED`, `CHARACTER_RETIRED`, `INSUFFICIENT_BLOOD`, `ITEM_DEPLETED`, `ROUND_HAS_OPEN_ROLLS`, `SCENE_HAS_OPEN_ROLLS`) — B proposes, A merges into `errors.ts`.
- `ClaimCharacter`/`ReleaseCharacter`/`ReassignCharacter` — template commands (B02) behind the platform membership guard.
- Presence-derived `online` per member in projections — A05/A06.
- `SessionOwnershipRecord.recoveryCode` is held in local storage until A06 consumes it; A's independent review should weigh that against the "shown once" rule (an XSS on the origin would read it). Not blocking.

Where a later A slice differs from this document, A's contract wins and this document is updated in the same PR.
