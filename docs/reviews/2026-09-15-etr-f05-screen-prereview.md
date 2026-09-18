# F05 pre-review: Eat the Reich screens (C01–C05) against F01–F03

- **Reviewer:** Fable (issue #14, task F05, first pass). Independent of the author (Sonnet C).
- **Reviewed:** branch `sonnet-c/c05-accessibility` @ `50825b3` (PRs #20, #22, #24, #26, #31), its rendered evidence under `docs/evidence/etr-screens/` (12 of the 60 PNGs opened at native size), the author's independent review record `docs/reviews/2026-09-15-etr-screens-independent-review.md`, and the fixture engine `apps/web/src/session/fixturePlayLoop.ts`.
- **Scope of this pass:** art, readability, and flow conformance to `docs/ETR_SESSION_FLOW.md` and `docs/ETR_ART_BRIEF.md`. **Not** a rules or multiplayer acceptance: every screen reviewed here runs on the author's TEMPORARY fixture engine, not on B03–B05's template or A05's live repository. The final F05 pass (`docs/reviews/2026-09-17-etr-session-rehearsal.md`) runs `docs/ETR_PLAYTEST.md` S01–S10 against the integrated candidate. Nothing below is approval of unseen or un-integrated behaviour.

## Verdict

**Readable and on-direction; not yet acceptable as a play candidate** because the engine behind the screens is a stand-in. Two P0 items are rules-visible gaps the integration slice must close; the rest are P1 polish.

## What passes

- All six original roster portraits, four scene backgrounds, threat tokens, icon sprite, and route map exist as specified; art direction matches the brief (bone paper, charcoal, crimson primary, cyan status, amber pending). No readable text, insignia, or licensed material in any image reviewed.
- Phone compose (375×812) shows stat radios with ratings, item uses `n/m`, abilities with cost and disabled reason ("not enough Blood"), SPECIALs listed read-only, engaged-threat selection, pool line with the 4+/6 rule, and the "Why?" disclosure. Matches flow §6.1.
- GM pending-review card shows stat, items, bonus claims (approve/strike), engaged threats, resulting dice count, "Roll it". Matches §6.2.
- Allocation shows kept dice chips (critical in crimson, success in cyan outline) and discarded chips greyed, opposition successes, points remaining, per-target steppers, Defend with remaining attack successes, Feed with Blood. Confirm disabled until fully assigned. Matches §6.3 except the P0 items below.
- Resolved step reports objective delta and injury; party strip updates (Blood 0/10, Injuries 1/6). The worked example in the captures (6+5 → 3 points to the Objective, 1 attack success through → one injury) is arithmetically correct per F01 D1/A2/I1.
- No-image variants: scene-card fallback, threat glyph, and monogram render; every play value remains text. Passes brief §5.
- Secrets reveal card shows room code, passphrase echo, table code, GM recovery code once behind an "I have written these down" gate. Matches §3. Invite panel shows only a passphrase hint (first character + length). Matches §4.1.
- Table (1920×1080): no controls; route map, scene, objective, threats, party strip, recent list. Matches §10.

## Findings

| # | Severity | Where | Finding | Required |
|---|---|---|---|---|
| F05-1 | **P0** (rules-visible) | `AllocationPanel2` / fixture `validAllocationTargets` | No **SPECIAL** target is offered even when a critical is rolled and the character has a SPECIAL ("Blackout Drop" listed at compose). F01 A6 requires `special:{abilityId}` as a target accepting only a critical die. | Integration slice: derive targets from B03's `validAllocations`; add a SPECIAL row per eligible ability that accepts only critical chips; reject success chips in the UI as well as the engine. |
| F05-2 | **P0** (rules-visible) | same | Only **engaged** threats are allocation targets; F01 A8 (p. 37) lets the player split points across every present Objective/Threat with rating > 0. In the capture, the second Station Patrol is absent from the target list. | Integration slice: list every revealed scene entity with rating > 0 as a target; keep engaged threats first. |
| F05-3 | P1 | `AllocationPanel2` | Allocation is points-as-currency via steppers rather than die → target assignment (flow §6.3). Acceptable only if F05-1 is solved with explicit critical-chip handling; otherwise the "critical only" rule cannot be expressed. | Either add a die-chip → target interaction or keep steppers plus a dedicated critical-only SPECIAL control. |
| F05-4 | P1 | `ConfirmStep` (resolved) | Injury line says "one injury marked (1/6)" without the category/box name or the penalty text that F02 §6.4 requires. | Show injury name and, on a second box, the penalty text. |
| F05-5 | P1 | `PortraitImage.initials` | Monogram takes the first character of each whitespace-split token, so `Grigor "Tallow" Belyakov` renders `G"`. | Strip non-letters before taking initials (expect `GB` or `GT`). |
| F05-6 | P1 (capture) | `04-claim-375x812.png` | Tallow's portrait shows the monogram while images are enabled. The asset exists (`apps/web/public/etr/tallow-256.webp`); the full-page capture likely fired before the lazy-loaded off-screen image resolved. | Re-capture after `img.decode()`/load, or eager-load roster portraits above a small count. Confirm it is not a mapping bug. |
| F05-7 | P1 | `RouteMap` | Route map is a straight diagonal with numbered circles; the brief §3.6 asks for a river band, three sector rings, grease-pencil route, and stamped cleared nodes. Readable, but not yet the specified artifact; at 1920 wide the map occupies a third of the width with empty space beside it. | Add river/sector rings and a "CLEARED" stamp state; give the table a two-column layout (map | scene) at ≥1280. |
| F05-8 | P1 | Scene director (fixture) | "Scene switching arrives with B04" placeholder text. Expected in fixture mode; must not survive integration. | Wire `LoadScene`/`NextScene`/`EndRound`/`EndMission`/`SetSceneRules` from B04. |
| F05-9 | P1 | Compose | Default stat is Brawl rather than the character's highest stat; pool shows 2 dice for a SNEAK-4 courier until the player changes it. | Default to the highest stat (ties: first in sheet order). |
| F05-10 | P2 | Threat list | Both patrols use the same token; fine. Attack icon (`⚔`-style figure) reads as "person" at phone size. | Consider the `attack` glyph from the sprite with a text label "Attack 2" on first render. |
| F05-11 | P2 | Evidence | Three PNGs exceed the 300 KB guidance (largest 342 KB). Documented honestly; not blocking. | Optional recompress when a tool is available. |

## Independent-review record check

The author's independent review (`2026-09-15-etr-screens-independent-review.md`) ran the suite itself (196/196 at review time, 198/198 after fixes), traced keyboard operability by hand, and found four non-blocking items that the author resolved same day. It is a genuine second pass, not a self-certification. It did not, and could not, assess rules fidelity because the engine is a stand-in; that gap is this pre-review's F05-1/F05-2.

## Next

1. Sonnet C's integration slice (`sonnet-c/c06-integration`) closes F05-1, F05-2, F05-8 by construction and should pick up F05-4/5/6/9 while touching those files.
2. Final F05 runs against the integrated, emulator-backed candidate with three devices per `docs/ETR_PLAYTEST.md`. Pass/fail is recorded there; this document is superseded by it.
