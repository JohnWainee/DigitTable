# Option-row semantics browser evidence — 2026-10-06

This evidence covers the player compose screen’s only item row with an independent utility action: **Mark and regain Blood**. It uses a throwaway local Vite harness which renders the real `ComposeStep2` component with an otherwise-valid original placeholder character whose utility item is usable. No Firebase project, emulator, credentials, or deployed environment is involved.

## Coverage

`node scripts/playtest/option-row-probe.mjs --out docs/evidence/fh-reskin/final`

The automated Chrome audit drives phone (375×812 and 320×568), tablet (768×1024), desktop (1280×800), and table (1920×1080) viewports at 100%, 150%, and 200% root text. It checks that:

- an option label contains no nested button, link, select, textarea, or summary;
- the row, label, action, and disclosure are horizontally contained with no horizontal overflow;
- label, action, and disclosure retain practical 44 px targets;
- action text is not clipped or split mid-word;
- in this deliberately usable-item fixture, tapping the label only toggles its checkbox, while tapping the action fires only that action;
- opening the disclosure adds no overflow; and

## Result

| Source | Checks | Failures |
| --- | ---: | ---: |
| Before (`f3fc981`) | 150 | 15 — one nested interactive per viewport/text-size scenario |
| Final after | 150 | 0 |

The current probe intentionally omits a text-field check because this component has no text-entry control, and scopes containment to the horizontal axis. `baseline-current/` and `final/` contain comparable phone, tablet, desktop, and table screenshots at 100% and 200% text. The raw JSON reports are deterministic audit output; no room code, account, or player data is present.

## Second-pass additions (lane `sonnet-fh`)

- After the Reveal-row correction (see the review file) the same probe re-ran: 150 checks, 0 failures; final screenshots refreshed.
- Emulator suites in a port-remapped APFS clone: 18 + 86 + 4 passed. Local `two-device-smoke.mjs --reload` against that build: 17/17 steps passed.
- **Not completed:** the whole-app `ui-audit.mjs` sweep stalled (no emulator traffic for 25 minutes at the GM flow, killed) on this machine, so no all-control audit was recorded for this change; the parent `sonnet-fg` audits remain the all-control evidence. The probe does not exercise the GM "Reveal" row in a browser; it is protected by the restored (unchanged) CSS rules and a contract test. Real Safari, physical devices and screen readers were not exercised.
