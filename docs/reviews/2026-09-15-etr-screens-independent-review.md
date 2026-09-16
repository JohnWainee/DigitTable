# Independent review: sonnet-c/c05-accessibility (Eat the Reich screens)

Reviewer: independent audit, not the author of this branch. Findings below are
based on directly reading `apps/web/src/**`, `apps/web/test/**`, running the
real test suite, and opening the actual evidence PNGs — not on
`CLAUDE_HANDOFF.md` or any PR description.

Branch reviewed: `sonnet-c/c05-accessibility`
HEAD at review time: `610acba feat(web): C05 accessibility fixes and rendered-screen evidence`

Worktree: `/Users/john/Documents/ChatGPT/DigiTable/.claude/worktrees/sonnet-c-screens`

---

## 0. Test suite — real output

Command run: `npm run check` (format + lint + typecheck + vitest run), full
output captured, not paraphrased from any doc.

```
> digitable@0.0.0 format
> prettier --check .
Checking formatting...
All matched files use Prettier code style!

> digitable@0.0.0 lint
> eslint .
(no output — zero lint errors/warnings)

> digitable@0.0.0 typecheck
> npm run typecheck --workspaces --if-present
(all five workspaces — contracts, engine, testing, template-eat-the-reich, web —
 ran `tsc --noEmit` with no errors)

> digitable@0.0.0 test
> vitest run

 RUN  v5.0.0 /Users/john/Documents/ChatGPT/DigiTable/.claude/worktrees/sonnet-c-screens

 Test Files  34 passed (34)
      Tests  196 passed (196)
   Start at  21:25:55
   Duration  3.16s
```

**Real result: 34/34 test files passed, 196/196 tests passed, 0 failures.**
This matches what I would expect the author to claim, and I verified it by
actually running the command myself rather than trusting a prior report.

---

## 1. Accessibility audit

### 1.1 Keyboard operability of dice allocation (`AllocationStepper.tsx`, `AllocationPanel2.tsx`)

**Finding (informational):** Keyboard support is genuinely implemented, not just claimed in a comment.
`apps/web/src/shared/AllocationStepper.tsx:36-58` — the `role="spinbutton"` div has
`tabIndex={0}` and a real `onKeyDown` handler covering `ArrowUp`/`ArrowRight`
(increment), `ArrowDown`/`ArrowLeft` (decrement), `Home` (zero), `End` (max),
each calling `clamp()` before `onChange`. The `+`/`−` buttons are native
`<button>` elements, so they are independently reachable and activatable by
keyboard (Enter/Space) with no extra work. `AllocationPanel2.tsx:70-80`
renders one `AllocationStepper` per target returned by `validAllocationTargets`,
in normal DOM/tab order, and the "Confirm allocation" button
(`AllocationPanel2.tsx:83-90`) is a native button disabled only while
`unassigned !== 0`. A keyboard-only user can Tab through every target's
stepper, use arrow keys (or Tab to the +/- buttons) to assign every point,
and Tab to Confirm once `unassigned === 0`. I traced this by hand; it holds up.

**Finding (non-blocking, test-coverage gap):** No automated test actually drives
this control by keyboard. `apps/web/test/player2/PlayerDashboard.a11y.test.tsx:120-136`
(comment: "Assign everything to the objective via the AllocationStepper
(keyboard/click operable)") only ever calls `user.click(btn)` on the `+`
button — it never sends `ArrowUp`/`Home`/`End` key events to the spinbutton
div. So the keyboard path I verified by reading the source is not regression-tested;
a future change could silently break `handleKeyDown` and none of the 196
passing tests would catch it. Category: test-coverage. Severity: non-blocking.

### 1.2 Touch target sizing (`apps/web/src/styles.css`)

**Finding (informational, verified not assumed):** Grepped for `min-height`/
`min-width` rather than trusting the CSS comments. Real interactive controls
enforce 44×44px consistently: `.surface-switcher button` (60-61), `.gear-option`
wrapper (145), `.primary-action` (149), `.stepper-controls button` (183-184),
`.secondary-action`/`.link-button` (271, 281), form text inputs (318), and a
GM/table-specific rule at 632-633. `.stepper-value` (the read-only spinbutton
display, line 199) is only `min-width: 2.5rem` (40px) — below 44px — but it has
no click handler (value changes only via the flanking buttons or keyboard), so
it isn't a tap target for an action; at most it's a focus target. The one
genuinely small control is `.form-field--checkbox input` (24×24px,
`styles.css:333-336`, used once in `CreateSessionScreen.tsx:172-180` for "I have
written these down"). 24×24px meets WCAG 2.2's AA-level Target Size (Minimum,
2.5.8) even though it's below the AAA 44px bar used everywhere else. Not a
defect.

### 1.3 Focus management in `CorrectionDialog.tsx` (modal)

**Finding (verified correct, and actually tested):** `CorrectionDialog.tsx:33-38`
moves focus to the heading (`headingRef.current?.focus()`) on mount and
restores focus to whatever was previously focused on unmount
(`previouslyFocused.current?.focus()`). `CorrectionDialog.tsx:41-46` closes on
Escape via a real `keydown` listener calling `onClose`. This is not just a
docstring claim — `apps/web/test/gm2/GmDirectorFlow.a11y.test.tsx:170-186`
asserts `within(dialog).getByRole("heading",...).toHaveFocus()` after opening
and `correctButton.toHaveFocus()` after applying/closing, and a second test
(`GmDirectorFlow.a11y.test.tsx:196-210`) asserts Escape closes the dialog
without applying a change and returns focus to the trigger. Both pass.

**Finding (non-blocking): no keyboard focus trap.** `CorrectionDialog.tsx` has
no logic to intercept `Tab`/`Shift+Tab` and cycle focus within the dialog, and
`GmDirectorScreen.tsx:81-89` renders `<CorrectionDialog>` as a plain sibling
inside `<main>` alongside `InvitePanel`, `SceneDirector`, `PendingActionsPanel`,
and `RosterPanel` — none of that background content is given `inert`,
`aria-hidden`, or `tabIndex={-1}` while the dialog is open (grepped the whole
`apps/web/src` tree for `inert`/`aria-hidden`/`trapFocus`/`focus-trap`: the
only `aria-hidden` uses are unrelated, on decorative icons/images). Mouse
users can't reach background controls — `.modal-backdrop` is
`position: fixed; inset: 0; z-index: 10` (`styles.css:687-696`), so it
visually and physically blocks clicks. But a sighted keyboard-only user who
keeps pressing Shift+Tab from the dialog's first control (or Tab from its
last) will move focus onto background buttons (e.g. other roster rows'
"Correct" buttons) that are still in the page's tab order, visually hidden
underneath the backdrop. This is a real, if narrow, keyboard-trap gap in an
otherwise well-built dialog. `aria-modal="true"` (`CorrectionDialog.tsx:51`)
means most screen readers will still constrain their virtual cursor to the
dialog, which limits the practical blast radius to sighted keyboard users.
Severity: non-blocking (small trigger surface, no data loss, doesn't affect
the majority of users), but worth fixing before this ships as a
production-grade modal pattern.

**Finding (non-blocking): `<label htmlFor="correction-delta">` targets a
`<span>`, not a form control.** `CorrectionDialog.tsx:56-73` — the label
"Blood change" has `htmlFor="correction-delta"`, but the element with that id
is `<span id="correction-delta" className="stepper-value">` (line 65), a plain
text span, not an input/button/other labelable element. Clicking the label
therefore does nothing (no associated control to focus), and the
label-to-control programmatic association a screen reader would normally rely
on doesn't actually exist. In practice the impact is limited because the two
stepper buttons carry their own explicit `aria-label`s ("Decrease/Increase
Blood change", lines 60, 68) and the pending value is separately announced via
`role="status" aria-live="polite"` (line 76), so the information isn't lost —
it's just not exposed through the `<label>` the markup implies. Category:
correctness/semantics. Severity: non-blocking.

**Finding (non-blocking, test-coverage gap): the CorrectionDialog is never
axe-scanned.** I checked every `axe(...)` call in
`apps/web/test/gm2/GmDirectorFlow.a11y.test.tsx` (lines 109, 228, 230, 238,
240, 242). The three-viewport "no detectable accessibility violations on the
GM console" test (lines 232-243) calls `createSessionAsGm(user)` only — it
never opens the correction dialog before running `axe()`. The two tests that
do open the dialog (the "corrects a character's Blood" test and the "closes on
Escape" test) never call `axe()` at all. So the `role="dialog"` /
`aria-modal` / `aria-labelledby` wiring, and the mislabeled `<label>` noted
above, have never been run through an automated accessibility checker. Given
axe wouldn't necessarily flag the label issue anyway (it isn't always a hard
violation, depending on the ruleset), this is worth closing but isn't proof of
a defect on its own.

### 1.4 Evidence screenshots (`docs/evidence/etr-screens/`)

**Finding (verified, positive):** Opened
`docs/evidence/etr-screens/05-player-dashboard-375x812-noimg.png` and
`docs/evidence/etr-screens/05-player-dashboard-375x812.png` directly with the
image reader (not just checked file sizes). Both are real, legible, full-page
renders of the actual player dashboard — connection status, fixture-mode
banner, scene card, party strip with Blood/Injuries, and the full compose
form (stat radios, items with use counts, abilities with the "Second Wind (1
Blood) — not enough Blood" disabled state visible, engaged threats, pool
summary, Declare action button). The two differ exactly as expected: the
`-noimg` variant shows the CSS fallback (dark gradient scene card, plain
charcoal-circle "R" monogram portrait) while the non-`-noimg` variant shows
the loaded scene photo and character portrait art in the same layout — i.e.
these are not placeholder/broken images, and they are not identical/duplicated
files. File sizes across the rest of the directory are consistent with this
(e.g. `01-landing-*-noimg.png` and `01-landing-*.png` are byte-identical,
which is correct since the landing screen has no images to toggle; `04-claim`
and `05-player-dashboard` pairs differ substantially, consistent with
portrait/scene art being present or absent).

---

## 2. Secret handling in the DOM

Traced every `passphrase`/`recoveryCode`/`tableCode` reference in
`apps/web/src` (grep, then read every call site).

### 2.1 Passphrase

**Finding (verified correct):** The plaintext passphrase only ever exists in
transient component state (`CreateSessionScreen.tsx:23` `useState("")`,
`JoinScreen.tsx:20` `useState("")`) and in the one-time
`CreateRoomReveal.passphraseTyped` field returned by
`FixtureSessionGateway.createRoom` (`FixtureSessionGateway.ts:67`,
`:214`), which is only ever read to render the reveal card
(`CreateSessionScreen.tsx:153`). It is never passed to
`writeOwnershipRecord` (`CreateSessionScreen.tsx:59-67`,
`JoinScreen.tsx:40-48` — both omit it), so it never reaches `localStorage`.
`FixtureSessionGateway.ts` is the only file that writes to `localStorage.setItem`
(`FixtureSessionGateway.ts:363`, confirmed by grepping the whole `apps/web/src`
tree for `localStorage.setItem`/`getItem` — one write site, one read site,
both in this file), and that call never includes the passphrase. Comparison
during join always goes through the hash: `FixtureSessionGateway.ts:224`
`room.passphraseHash !== nonCryptoHash(input.passphrase)` — never a plaintext
`===` comparison. The join error message is intentionally identical for "room
not found" and "wrong passphrase" (`FixtureSessionGateway.ts:225-227`) to
avoid a room-code enumeration oracle, matching the comment's stated intent.

**Finding (informational):** `FixtureSessionGateway.ts:196-201` stores a
`passphraseHint` (first character + length only) in an in-memory
`Map<roomId, {firstChar, length}>`, surfaced by `InvitePanel.tsx:14` as a GM
convenience ("full passphrase is never shown again"). This is a deliberate,
documented feature (`FixtureSessionGateway.ts:343` doc comment references
`docs/ETR_SESSION_FLOW.md` section 4.1), not an accidental leak, and it never
stores more than one character plus a length. It's in-memory only (a
module-level field, gone on reload), not `localStorage`. Worth knowing about,
not a defect.

### 2.2 Recovery code

**Finding (non-blocking, worth flagging):** The GM's and a joining player's
one-time `recoveryCode` (13 random chars, `FixtureSessionGateway.ts:181,234`)
*is* written to `localStorage` as part of `SessionOwnershipRecord` —
`CreateSessionScreen.tsx:59-67` and `JoinScreen.tsx:40-48` both include
`recoveryCode: reveal.accepted.recoveryCode` / `result.recoveryCode` in the
object passed to `writeOwnershipRecord`, which JSON-stringifies the whole
record into `localStorage` under `digitable.etr.fixtureOwnership.v1`
(`FixtureSessionGateway.ts:363`). `readOwnershipRecord()`
(`FixtureSessionGateway.ts:352-359`) can read it back at any time for the
life of that `localStorage` entry — there is no code anywhere that clears or
redacts the `recoveryCode` field afterward (grepped every `.recoveryCode`
reference in `apps/web/src`: the only reads are the two writes above and the
one-time reveal renders in `CreateSessionScreen.tsx:164` /
`JoinScreen.tsx:131`; nothing ever reads it back out of the stored ownership
record for any purpose — it's write-only after that point in this fixture).
So: the UI copy says "shown once" / "Nobody else can see it"
(`JoinScreen.tsx:126-129`), and the *screen* is genuinely one-time (the
component holding the value in memory unmounts on navigation, same as the
passphrase) — but the value is simultaneously persisted in plaintext,
indefinitely, in this browser's `localStorage`, readable by anyone with
devtools access to this device, and unused for anything after that write. For
a real backend this is a defensible pattern (a local recovery token that lets
this device silently resume without re-entering the code — the same shape as
a session cookie), and the doc comment on `SessionOwnershipRecord`
acknowledges it's "the one field the client already holds and the server
never echoes back." But the "nobody else can see it" framing on the join
screen is about *other people*, not about this device's own storage, so it
isn't strictly false — it's just worth the team being aware that "shown once"
applies to the UI, not to storage. Category: secret-handling. Severity:
non-blocking (intentional fixture-mode mirror of a real, documented
contract), but flag for the eventual real backend integration to confirm this
is the intended long-term behavior rather than an oversight carried over from
the fixture.

### 2.3 Table code / room code

**Finding (verified correct):** The table display screen is explicitly tested
to never show the room code or passphrase:
`GmDirectorFlow.a11y.test.tsx:220-226` asserts
`screen.queryByText(roomCode)).not.toBeInTheDocument()` and
`screen.queryByText(/wolfbane/i)).not.toBeInTheDocument()` after navigating to
`#/room/:id/table`, and separately asserts there are zero buttons and zero
textboxes on that screen (`:218-219`) — i.e. no way to even trigger a reveal
from that surface. I read `TableDashboardScreen.tsx` and confirmed it never
imports or renders `roomCode`/`tableCode`/`passphrase` at all.

### 2.4 URL / `location.hash`

**Finding (verified correct):** `router.tsx` is a small hash router
(`parseHash`/`navigate`) whose `Route` union only ever carries an opaque
`roomId` (e.g. `fixture-abc123`) in the hash — never a room code, table code,
passphrase, or recovery code. Grepped `apps/web/src` for any other write to
`window.location.hash`: the only site is `navigate()` in `router.tsx:44`,
which is always called with a `/room/:roomId/...` or similarly code-free path
by every caller I found (`CreateSessionScreen.tsx:198`,
`JoinScreen.tsx:135/148`, etc.). No secret ever touches the URL.

---

## 3. No illegal choices (UI-layer only — fixture mode, no backend)

### 3.1 Compose step (`ComposeStep2.tsx`)

**Finding (verified correct):** Items with zero uses left are disabled, not
just visually deemphasized: `ComposeStep2.tsx:90`
`disabled={item.usesRemaining <= 0}` on the checkbox itself, with the label
text also appending "— no uses left" (`:94`). Abilities costing Blood the
character doesn't have are disabled the same way:
`ComposeStep2.tsx:104,110` `disabled = ability.cost === "blood1" &&
character.blood < 1`, appending "— not enough Blood" (`:114`). A disabled
checkbox cannot be checked by mouse or keyboard, and `onChange` never fires
for it, so a player genuinely cannot select an unaffordable item/ability
through this control. I confirmed this visually too:
`docs/evidence/etr-screens/05-player-dashboard-375x812.png` shows "Second
Wind (1 Blood) — not enough Blood" rendered in the dimmed disabled state with
the character at Blood 0/10, matching the source.

### 3.2 Allocation (`AllocationPanel2.tsx`, `validAllocationTargets`)

**Finding (verified correct):** `validAllocationTargets`
(`fixturePlayLoop.ts:249-283`) only ever appends a `"defend"` target when
`roll.gmAttackSuccessesRemaining > 0` (`:270-278`) and only ever appends a
`"feed"` target when `character.blood < 10` (`:279-287`); objective/threat
targets are similarly gated on `scene.objectiveRating > 0` and
`threat.rating > 0`. `AllocationPanel2.tsx:70` maps directly over whatever
`validAllocationTargets(...)` returns with no additional hardcoded options
mixed in, so the UI genuinely cannot offer "Defend" at 0 remaining attack
successes or "Feed" at Blood 10/10 — those cases are simply absent from the
`targets` array, not merely disabled-looking.

**Finding (verified correct): total allocation cannot exceed rolled
points, defense-in-depth at two layers.** Each `AllocationStepper`'s own max
is computed as `Math.min(option.maxUses, Math.floor(budgetIfZero /
option.costPerUse))` (`AllocationStepper.tsx:31`), where
`budgetIfZero = unassigned + value` is passed in from
`AllocationPanel2.tsx:74` (i.e., "how much would be free if this target were
reset to zero"). Working through the arithmetic: since every other target's
current allocation is subtracted from `total` to get `unassigned`, and a
given target's own max is `unassigned + value`, the *sum* across all targets
is algebraically bounded by `total` no matter which target is being adjusted
— you cannot click/arrow-key your way to over-allocating. Separately, the
store's `confirmAllocation` (`fixturePlayLoopStore.ts:168-183`) independently
re-derives `totalPoints`/`assignedPoints` from the actual roll and allocation
map and does `if (totalPoints !== assignedPoints) return;` (`:174`) before
resolving anything — so even if a caller bypassed the UI and called
`fixture.onAssign` directly with an out-of-range value, resolution simply
cannot proceed until the totals match exactly. The "Confirm allocation"
button is also disabled client-side unless `unassigned === 0`
(`AllocationPanel2.tsx:85`).

**Finding (informational, not a violation of the "illegal choice" question):**
`fixturePlayLoopStore.assign()` (`fixturePlayLoopStore.ts:152-163`) does
*not* itself clamp `points` — it trusts whatever the caller passes and writes
it straight into the allocations map. The only enforcement is at the UI layer
(`AllocationStepper`'s computed `max`) and at confirm time (exact-equality
check above). This means a target's own per-target cap is really just
"whatever's left in the shared budget," not a semantic cap tied to that
target's need — e.g. `AllocationPanel2.tsx:72`
`option={{ ..., maxUses: total }}` passes the *entire* roll total as
`maxUses` for every target, including "Feed," so a player at Blood 9/10 could
allocate 3 points to Feed (only 1 is "needed") if they have the budget; the
excess isn't rejected, it's just absorbed harmlessly by
`resolveAllocation`'s `Math.min(10, blood + points)` clamp
(`fixturePlayLoop.ts:355`). Same shape for "Defend" against
`gmAttackSuccessesRemaining` and for objective/threat damage exceeding the
remaining rating — all of these clamp safely to zero/floor rather than going
negative or crashing. So no illegal *state* is ever reachable, but the
allocation UI doesn't prevent a player from "wasting" points on an option
that's already satisfied; that's a design/efficiency nuance, not a rules
violation, since the option only appears at all when it's still legitimately
selectable (Blood < 10, attack successes > 0, etc.).

### 3.3 Honesty about the fixture-mode limitation

**Finding (verified, positive):** Both `FixtureSessionGateway.ts` and
`fixturePlayLoop.ts` are explicit and unambiguous in their own doc comments
that this is client-only. `FixtureSessionGateway.ts:22-26`: "Explicitly NOT
real: state lives in a module-level object and is lost on page reload ...
there is no rate limiting, no cross-tab sync, and no server-side
authorization." `fixturePlayLoop.ts:9-13`: "This module implements a
simplified but real (not scripted) version of the loop ... entirely
client-side" and lists specific simplifications relative to the rules matrix
(no GM strike-a-claim review is wired to a real server, no SPECIAL-ability
allocation target, etc.), each tagged against `docs/ETR_RULES_MATRIX.md`. I
did not find anywhere in the reviewed source, tests, or the evidence
screenshots that overstates this as server-validated or production-ready.
The disclaimers are accurate: every guard I traced above (item/ability
disabling, target list gating, allocation-sum enforcement) is genuinely
client-side only, exactly as advertised, and none of it should be mistaken
for a security boundary once a real backend exists.

---

## Overall verdict: **approved with non-blocking notes**

The three headline claims I was asked to independently verify all hold up
under direct source inspection and an actual test run: keyboard operability
of the dice allocator is real (if under-tested), the passphrase is never
persisted in plaintext, and illegal allocation/compose choices are genuinely
unreachable through the UI (not just visually discouraged), with correct,
honest disclaimers about fixture-mode's lack of server-side enforcement.

No blocking issues found. The non-blocking items worth tracking, roughly in
priority order:

1. `CorrectionDialog` has no keyboard focus trap — a sighted keyboard-only
   user can Tab/Shift+Tab out of the "modal" into background console controls
   hidden beneath the backdrop (`apps/web/src/gm2/CorrectionDialog.tsx`,
   `apps/web/src/gm2/GmDirectorScreen.tsx:81-89`).
2. The correction dialog is never exercised by `axe()` in any test
   (`apps/web/test/gm2/GmDirectorFlow.a11y.test.tsx`), and the
   `AllocationStepper`'s keyboard path (arrow keys/Home/End) is never
   exercised by an automated keyboard-event test
   (`apps/web/test/player2/PlayerDashboard.a11y.test.tsx:120-136`) — both are
   coverage gaps, not proven defects.
3. `CorrectionDialog.tsx`'s `<label htmlFor="correction-delta">` points at a
   `<span>`, not a real form control — low impact given the buttons' own
   `aria-label`s and the live region, but semantically wrong.
4. The GM/player's one-time recovery code is persisted indefinitely in
   plaintext `localStorage` after the one-time reveal screen closes, unused
   thereafter in this fixture (`FixtureSessionGateway.ts:363`,
   `CreateSessionScreen.tsx:59-67`, `JoinScreen.tsx:40-48`) — a defensible
   design (mirrors a real session-resume token) but worth an explicit design
   decision when the real backend lands, since the join screen's "nobody else
   can see it" copy is about other people, not this device's own storage.

None of the above block merge in my judgment; they're worth a follow-up pass,
particularly #1 and #2 before this dialog pattern gets reused elsewhere in
the app.

---

## Exact commands run to produce this review

```
git -C /Users/john/Documents/ChatGPT/DigiTable/.claude/worktrees/sonnet-c-screens log --oneline -20
git -C /Users/john/Documents/ChatGPT/DigiTable/.claude/worktrees/sonnet-c-screens branch --show-current
git -C /Users/john/Documents/ChatGPT/DigiTable/.claude/worktrees/sonnet-c-screens status

cd /Users/john/Documents/ChatGPT/DigiTable/.claude/worktrees/sonnet-c-screens && npm run check
# -> format: clean, lint: clean, typecheck: clean (5 workspaces),
#    test: 34 test files passed (34), 196 tests passed (196), 0 failures

grep -n "min-height\|min-width\|:focus\|outline" apps/web/src/styles.css
grep -rn "inert\|trapFocus\|focus-trap\|aria-hidden" apps/web/src
grep -rn "localStorage\.\(setItem\|getItem\)" apps/web/src --include="*.tsx" --include="*.ts"
grep -rn "\.recoveryCode\b" apps/web/src --include="*.tsx" --include="*.ts"
grep -rn "recoveryCode\|passphrase\|tableCode" apps/web/src --include="*.tsx" --include="*.ts"
grep -n "axe(" apps/web/test/gm2/GmDirectorFlow.a11y.test.tsx
```

Files read directly (not summarized from docs): `apps/web/src/session/FixtureSessionGateway.ts`,
`apps/web/src/session/fixturePlayLoop.ts`, `apps/web/src/session/fixturePlayLoopStore.ts` (assign/confirmAllocation),
`apps/web/src/player2/AllocationPanel2.tsx`, `apps/web/src/player2/ComposeStep2.tsx`,
`apps/web/src/shared/AllocationStepper.tsx`, `apps/web/src/gm2/CorrectionDialog.tsx`,
`apps/web/src/gm2/GmDirectorScreen.tsx`, `apps/web/src/landing/CreateSessionScreen.tsx`,
`apps/web/src/landing/JoinScreen.tsx`, `apps/web/src/router.tsx`, `apps/web/src/styles.css`,
`apps/web/src/shared/PortraitImage.tsx`, `apps/web/src/shared/SceneArt.tsx`,
`apps/web/test/gm2/GmDirectorFlow.a11y.test.tsx`, `apps/web/test/player2/PlayerDashboard.a11y.test.tsx`,
plus opening `docs/evidence/etr-screens/05-player-dashboard-375x812-noimg.png` and
`docs/evidence/etr-screens/05-player-dashboard-375x812.png` directly with an image reader.

---

## Resolution (author's follow-up, same day)

All four non-blocking findings were addressed on `sonnet-c/c05-accessibility` after this review:

1. **Focus trap (blocking-adjacent, addressed):** `CorrectionDialog.tsx` now traps Tab/Shift+Tab
   within the dialog (cycles between the first and last focusable controls; the initial
   heading-focused state is treated as "before first" so the very first Shift+Tab doesn't
   escape before any real control has been visited). Covered by a new test,
   `apps/web/test/gm2/GmDirectorFlow.a11y.test.tsx` — "traps Tab focus inside the correction
   dialog and is itself axe-clean" — which also runs `axe()` against the open dialog (closing
   finding #2's dialog-axe-coverage gap).
2. **Keyboard-only allocation coverage (addressed):** `apps/web/test/player2/PlayerDashboard.a11y.test.tsx`
   gained "allocates entirely by keyboard (spinbutton + End, then Enter to confirm) with no
   pointer input", driving `AllocationStepper`'s existing keyboard support through the real
   integrated `AllocationPanel2` screen rather than only the component's own isolated unit test.
3. **`<label>` pointing at a non-control `<span>` (fixed):** replaced with `role="group"
   aria-labelledby="correction-delta-label"` wrapping the stepper, labelled by a plain `<span>`
   (not a `<label>`, since it labels a group, not one control) — matches the pattern the
   independent reviewer would expect from `AllocationStepper.tsx`'s own `aria-labelledby` usage.
4. **Recovery code persisted indefinitely in `localStorage` (not changed, by design):** this
   matches A02's own `SessionOwnershipRecord` shape (`packages/contracts/src/session.ts` on
   `origin/sonnet-a/a02`, mirrored locally in `FixtureSessionGateway.ts` pending that merge) —
   a resume token has to persist somewhere client-side to resume without re-entering the
   passphrase. Recorded here as a confirmed, deliberate design decision rather than a defect,
   for A05/A06 to revisit if the real backend wants shorter-lived local credentials.

Verification after the fixes: `npm run check` — **198/198 tests across 34 files** (up from
196/34 at review time), `npm run build` passes. Re-ran the new dialog-trap test and the new
keyboard-allocation test 20+ times each locally (the latter exercises a real random dice roll)
with no flakes.
