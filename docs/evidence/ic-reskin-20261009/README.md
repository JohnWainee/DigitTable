# Option-picker pop-out and role-accent evidence (ic reskin, 2026-10-09)

Branch `sonnet/ic-reskin-orchestrated-20261009`, from `origin/main` at `b599abd`. Local Firebase emulators (`demo-digitable`) and local `vite preview` builds only; nothing deployed, staging not contacted.

- `before/` — unmodified `b599abd` (the only edit was the audit script's stale "Rook" lookup, which no longer matched the sourcebook roster). Native `<select>` controls; the OS-owned popup is not capturable, so there are no picker shots.
- `after/` — this branch: 6 phone/tablet/desktop/table state screenshots per surface (`<surface>-<state>-<phone|tablet|desktop|table>.jpg`, 375×812, 768×1024, 1280×800, 1920×1080, downscaled to 800 px), picker screenshots `gm-picker-<id>-<viewport>.jpg` (phone-small 320×568, phone 375×812, phone-landscape 812×375, keyboard-short 360×300, tablet, desktop), correction-sheet shots, and `report.json` (the picker section holds 36 open/close records: 6 pickers × 6 viewports).
- Both `report.json` files come from `scripts/playtest/ui-audit.mjs` (150 states each).

Reproduce: see `docs/evidence/sonnet-d-reskin/README.md`; the only difference is that this run remapped the emulator ports (a peer lane held the defaults) with a throwaway Vite plugin and a `--config` file kept outside the repository.
