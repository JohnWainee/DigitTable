# FW reskin evidence

This directory records the before/after visual evidence for
`sonnet-fw/reskin-orchestrated-20261007` (`ccb9f2d..97cc9c7`). It is a local
candidate only: nothing here was deployed.

The lane fixes three related 320px / 200%-text defects: nested option rows
could create horizontal page overflow; a short visual viewport could clip a
sheet's action row behind a nested scroller; and the scene select could hide
its chosen value. The implementation caps non-text gutters and decorative
controls at small viewport widths, selects between measured pinned and
single-scroller sheet layouts, and echoes the selected scene title.

`before/` and `after/` contain matching phone, tablet, desktop, and table
captures. `large-text/` and `sheet-keyboard/` cover the reported mobile
failure family. `reports/ui-audit-after.json` records 150 states, 1,434
controls, zero control or overflow failures, and zero hard axe violations;
the 200% default-font run reports the same outcome. `ios/` contains simulator
keyboard frames (not physical-device evidence).

Known evidence limits: no physical Android/iPhone pass, no assistive-technology
or Windows High Contrast pass, and no deployed-candidate staging playthrough.
The default-port emulator suite was occupied during the independent recovery
attempt; see the review record for the exact verification status.
