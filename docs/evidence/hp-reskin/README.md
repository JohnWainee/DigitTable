# HP reskin evidence (2026-10-08)

Curated subset of the real-Chrome `scripts/playtest/ui-audit.mjs` runs against a local Firebase-emulator
stack (live mode, remapped ports). `before/` is origin/main `b599abd`, `after/` is this branch.
Viewports: phone 375x812, tablet 768x1024, desktop 1280x800, table 1920x1080 (the full audit also
covers 320x568, 812x375 landscape and 667x375). `*-fold.jpg` are viewport-only shots with the step scrolled
into view, showing the sticky action dock. The complete sets (168 / 150+ screenshots each), run logs, the
smoke log and the emulator-suite log are in `/private/tmp/hp-evidence/full/` (not committed: ~50 MB).

Not physical-device, assistive-technology, Windows High Contrast or staging evidence.
