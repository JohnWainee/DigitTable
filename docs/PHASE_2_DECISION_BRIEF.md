# Phase 2 decision brief — for John

Three decisions block parts of Phase 2 (`docs/PHASE_2_PLAN.md`); none blocks starting Phase 2. This brief lays out the options, tradeoffs, and a recommendation for each, plus what stays unblocked while you decide.

## What does not need to wait

`docs/PHASE_2_PLAN.md`'s **PR 1** (repository interface + Firebase emulator harness) and **PR 2** (Firestore data model and security rules) need none of these three decisions. Both run entirely against the local Emulator Suite with a placeholder project ID; nothing in either PR's design branches on region, join policy, or retention values. **Work can start on those two PRs today.** PR 3 onward — anything that creates a real Firebase project or implements the actual join flow — waits on the decisions below.

---

## Decision 1: Firebase region and project separation

**What's being decided:** which Firebase region to run in, and whether staging and production are separate Firebase projects.

**Why it matters:** `docs/ARCHITECTURE.md` section 12 says "co-locate Functions, Firestore, and RTDB where supported" — region is effectively a one-time choice; migrating a live Firestore database to a different region later means exporting and re-importing data, not a config flip. Section 14 requires distinct staging/production environments with different data-retention rules.

**Options:**

| Option | Tradeoff |
|---|---|
| **Single region, two projects (staging + production)** *(recommended)* | Standard Firebase practice; clean credential/data separation; slightly more setup (two projects to configure, two sets of secrets to manage). |
| Single region, single project with environment prefixing (e.g. `staging-` collection prefixes) | Less setup, but staging and production data live in the same project — a staging bug or a mis-scoped query can touch production data, and IAM can't cleanly separate who can touch which environment. Architecture doesn't recommend this and neither do I. |
| Multi-region (e.g. `nam5` multi-region Firestore) | Better availability, meaningfully higher latency variance and cost for a 3–8-person-per-room app with no stated multi-region user base yet. Nothing in the quality targets (section 3) asks for this. |

**Recommendation:** a single regional Firestore location close to your actual player base (for example `us-central1` for US-based play or `europe-west1` for EU-based play — pick based on where you and your playtesters actually are, not a default), with two separate Firebase projects for staging and production. This matches section 14's environment table without over-provisioning for scale the app isn't targeting.

**What I need from you:** confirm (a) two projects, and (b) which region — I don't have visibility into where your playtesters are, so I can't pick the region for you.

---

## Decision 2: Room join policy

**What's being decided:** how a player gets into a room — open code, code + passphrase, or explicit invites.

**Why it matters:** `docs/ARCHITECTURE.md` section 16 lists this as a required "before realtime implementation" decision because it changes the admission-check logic in Phase 2 PR 3 directly (`docs/PHASE_2_PLAN.md`). Section 11's threat model already assumes *some* form of throttled code-based join ("Rotatable codes, admission policy, App Check, IP/room throttles" mitigates "room-code guessing"), so this decision is really "which admission layer sits on top of that baseline," not whether the baseline exists.

**Options:**

| Option | Tradeoff |
|---|---|
| **Open code** *(a short, human-shareable code is sufficient to join)* | Lowest friction — matches Signal Bleed's reference behavior (room codes) and the "3–8 clients... optionally one shared display" assumption in section 2. Relies entirely on code entropy + rotation + rate limiting (already specified) to prevent guessing; anyone who has the code can join up to capacity. |
| Code + passphrase | Adds a second shared secret the GM must distribute alongside the code — meaningfully reduces "someone found/guessed the code" risk, at the cost of a second thing to communicate and remember, which cuts against the product's low-friction, phone-first join goal. |
| Explicit invites (GM pre-registers seats/identities) | Strongest access control, but requires a durable-identity or pre-registration system this architecture explicitly defers (section 16: "Decide whether durable account linking should replace recovery codes" is an *after* the local slice question, not a Phase 2 one). Building invites now would pull that forward. |

**Recommendation:** open code, matching Signal Bleed's reference behavior and the architecture's existing threat-model assumptions (rotatable codes, per-room/IP throttling, capacity caps at 8 participants + 1 table seat, App Check monitoring). Revisit if playtesting surfaces actual unwanted joins — the code-rotation and kick commands already planned (`docs/PHASE_2_PLAN.md` PR 3/PR 6) are the intended remedy, not a stronger join policy.

**What I need from you:** confirm open code, or pick one of the alternatives — this is a product-feel decision (friction vs. control) I can't make for you.

---

## Decision 3: Retention, export, and deletion

**What's being decided:** how long campaign data lives, what "archived" means concretely, and whether/how a user can export or delete their data.

**Why it matters:** `docs/ARCHITECTURE.md` section 8 already proposes specific values "for review" but explicitly says "Do not automate deletion until product approves values and recovery behavior." Section 16 lists this as a "before realtime implementation" gate. Because players are anonymous (no email/contact channel), any retention prompt has to be in-app on next visit — there's no way to notify someone out of band before their data ages out, which raises the stakes of picking reasonable values.

**Proposed values (from `docs/ARCHITECTURE.md`, restated for your approval):**

| Data | Proposed retention |
|---|---|
| Active campaign events | Campaign lifetime (no automatic expiry while the room is active) |
| Archived campaign (room explicitly closed/inactive) | Readable for 90 days, then an in-app prompt to export/delete/extend |
| Presence (RTDB) | Expires on disconnect/TTL — not a policy question, already implemented as ephemeral by design |
| Diagnostic/application logs | Shortest practical retention; never contain narrative/private payloads (section 15) |

**Open questions only you can answer:**
1. Is 90 days the right archive grace period, or should it be shorter/longer given anonymous users can't be reminded out of band?
2. After the 90-day prompt, if nobody responds, what's the default — auto-delete, or extend indefinitely? Architecture's default assumption is that this must remain a human-approved action, not an automated deletion, until you say otherwise.
3. Does export mean a downloadable JSON/event-log dump the GM can request, or something narrower (e.g. character sheets only)? Nothing in the architecture defines export's shape yet — that's a product decision, not just a values decision.

**Recommendation:** accept the proposed values, with deletion staying **manual/GM-initiated** (not automatic) until at least one real campaign has gone through the archive/export flow once and you've seen what "nobody responded to the prompt" actually looks like in practice.

**What I need from you:** approve, adjust, or reject the proposed values, and answer the three open questions above — particularly the auto-delete-after-silence question, since building automated deletion versus a manual-only flow changes what Phase 2 PR 6 has to implement.

---

## Summary for quick reply

If you're comfortable with the recommendations above, a one-line "go with your recommendations on all three" is enough to unblock Phase 2 PR 3 onward. If you want to change any of them, tell me which and how — each is independent of the others.
