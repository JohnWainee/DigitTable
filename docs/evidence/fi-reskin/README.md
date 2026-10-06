# Mobile text-entry audit (lane `sonnet-fi`)

Branch `sonnet-fi/reskin-orchestrated-20261006`, from `f0e5d7c` (the reviewed `sonnet-fh` tip). Everything ran against a **local** Firebase emulator stack (`demo-digitable`, ports 63xxx; emulator suites on 56xxx in an APFS clone) and local `vite preview` builds, plus **real Mobile Safari** in dedicated iOS Simulators (`fi-iPhone17Pro-26` iOS 26.5, `fi-iPadMini-27` iOS 27.0). Nothing was deployed, no production resource or secret was used, staging was not contacted, and no merge was made. Presentation attributes only: no engine, contract, template, rules, projection, authorization, privacy or submitted-value change.

> **Integration note (2026-10-06):** These screenshots, audit reports and
> Safari-rig logs were produced on the source lane above, not on the divergent
> `factory/today-integration` follow-on. That integration imports the web
> attribute and unit-test change, but does not contain the source lane's iOS
> simulator rig; treat the Safari results here as historical source-lane
> evidence, not a reproducible result for the integration candidate.

## Result: one evidenced defect class, fixed

The pop-out inventory (one `SheetDialog` correction sheet, six native `<select>`, one `<details>`, option rows, allocation radios) was re-audited at phone/tablet/desktop/table sizes at 100/150/200% text and forced colors. The Chrome audits found **nothing new** (below), consistent with `sonnet-fg`/`fh`. The new defect was found by reading the fields' exact-match semantics and then measuring them on the real iOS soft keyboard, which the Chrome audits cannot reproduce:

| Field (all `<input type="text">`) | Baseline on real Safari (keys tapped on the soft keyboard) | After |
| --- | --- | --- |
| Join passphrase (case-sensitive, compared exactly) | typed `teh river stone` → **`The river stone`** (auto-capitalised and auto-corrected) | `teh river stone` |
| Create passphrase | → **`Teh river stone`** | `teh river stone` |
| Recovery code (UPPERCASE-only alphabet, hash-compared exactly) | typed `abcdefghjkmn` → **`Abcdefghjkmn`** | `ABCDEFGHJKMN` |
| Table-display room code / table code | `Tehabc` / `Abcdefg` (cosmetic: submit upper-cases them) | `TEHABC` / `ABCDEFG` |
| GM "Item id" (engine matches exactly) | typed `cowboyhat` → **`Cowboyhat`** | `cowboyhat` |
| GM "New member id" | `teh member` → **`Teh member`** | `teh member` |

The server compares the passphrase and recovery code exactly (`verifySecret`, no trimming or case folding), so on a phone a correctly remembered passphrase is silently altered and the player only sees "Code or passphrase not recognised." Fix: `apps/web/src/shared/textEntry.ts` presets (`autoCapitalize`/`autoCorrect`/`spellCheck`/`autoComplete`) applied to those fields only; prose fields (names, reasons) are unchanged. Measured only for letters and the space bar (the rig has no digit/punctuation layer); rejection of the old values by the server was inferred from the code, not exercised.

## Regression coverage

- `apps/web/test/shared/TextEntryHints.test.tsx` (6 tests): per-screen attribute contract. **5 fail on the `f0e5d7c` component source**, pass after.
- `SafariFlowUITests.testCodeAndSecretFieldsKeepTypedTextVerbatim` and `testGmIdFieldsKeepTypedTextVerbatim` (new, real Safari, key taps; also assert the keyboard's auto-shift state and that a below-the-fold field is above the keyboard after focus). Baseline iPhone: **both fail (11 assertion failures)**; after: iPhone **pass**, iPad mini **pass**. `reports/safari-ios/before-iphone17pro` vs `after-*` hold the logs and screenshots (`reports/ios-rig-verdicts.txt` lists verdicts in run order: after-iPhone, before-iPhone, after-iPad).
- `testCorrectionSheetWithKeyboardAndPicker` re-run: iPad mini pass (the iPhone first-run of the final set aborted mid-run on a keyboard-timing flake in the new GM test; the rig was hardened with a retry and the two new tests re-run green on iPhone; the sheet test passed on iPhone in that same aborted run).
- An early rig attempt used `typeText`; it **passed on the baseline** because `typeText` bypasses auto-capitalisation/correction. That is why the tests tap keys.

## Chrome audits (`ui-audit.mjs`, final tree)

| Run | States | Controls | Control issues | Overflow | axe violations | Failures |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Baseline `f0e5d7c`, 100% | 150 | 1,470 | 0 | 0 | 0 | 0 |
| After, 100% | 150 | 1,434 | 0 | 0 | 0 | 0 |
| After, 150% text | 150 | 1,470 | 0 | 0 | 0 | 0 |
| After, 200% text | 150 | 1,530 | 0 | 0 | 0 | 0 |
| After, forced colors (emulated) | 150 | 1,566 | 0 | 0 | 61 `color-contrast` | 61 |

The control counts vary because the random roll in the audited flow changes the number of dice rows; no DOM structure or CSS changed. The 61 forced-colors findings are the same tool artefact recorded by `sonnet-fc`/`fg` (Chrome 154's axe against a white backdrop that forced colors replaces), identical count, 0 other failures. Local `two-device-smoke.mjs --reload`: 17/17 + reload step passed on the final build.

## Gates

`npm run check` (format, lint, typecheck, tests): exit 0, 725 passed, 11 todo (baseline 719 + 6). `npm run build`: exit 0. Emulator suites in an APFS clone with every port remapped to 56xxx (including the three hard-coded in the harness, patched in the clone only): **18 + 86 + 4 passed**.

## Files

`before/` and `after/`: JPEGs of the landing, create, join, GM console and correction-sheet states at phone 375×812, tablet 768×1024, desktop 1280×800, table 1920×1080 (identical layout: no CSS touched). `reports/`: audit JSON, smoke log, Safari logs/verdicts.

## Not done / limits

A Simulator is not a physical device. Not exercised: physical iPhone/iPad/Android (Android keyboards honour these hints differently and were not tested), VoiceOver/TalkBack/NVDA, real Windows High Contrast, password managers, Safari swipe-back. `type="number"` GM fields (bonus plus, max uses) were left alone: `inputmode="numeric"` can remove the Return key on iOS and was not measured. A pasted lowercase recovery code is still rejected (hints do not rewrite pasted text; folding it would change the submitted value and is a follow-up for John). No staging playthrough: this branch is unmerged and undeployed.
