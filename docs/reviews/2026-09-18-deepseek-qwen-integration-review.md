# DeepSeek/Qwen integration review

- **Date:** 2026-09-18
- **Branch:** `factory/today-integration`
- **Range:** `4406e47..3b907d9`
- **Reviewer:** independent Codex review agent
- **Verdict:** approve after handoff correction; no blocking code or security defect

## Review scope

The review checked conflict resolution, privacy and projection isolation, UUID generation on insecure LAN origins, emulator-host routing, presentation-queue integration, art paths and fallbacks, LAN scripts, tests, and handoff accuracy.

## Finding and resolution

The integrated code was sound, but `CLAUDE_HANDOFF.md` retained historical DeepSeek text saying LAN play was unsupported and that the Qwen prerequisites still needed implementation. That contradicted the integrated `emulatorConfig.ts`, `firebase.lan.json`, `newUuid()`, playtest runbook, and verified test results. The handoff now labels the old section as source-branch history and records the integrated state and next action.

## Positive verification

- Player dashboard conflict resolution preserves the ordered presentation queue and changes only command-ID minting to the LAN-safe helper.
- Projections remain the sole domain-state source; event tails are presentation-only and parsed without actor metadata.
- Emulator routing is enabled only by the explicit emulator flag and defaults to the page hostname for LAN clients.
- UUID fallback uses `crypto.getRandomValues` and sets RFC 4122 version/variant bits.
- LAN emulator exposure is opt-in and documented as trusted-network-only.
- The art manifest covers authored scenes, characters, and threats with tested fallbacks.

## Non-blocking note

`SceneArt` resets fallback state during render when its source identity changes. Current keyed call sites and tests prevent an observed defect, though an effect/key-only design would be more idiomatic in a future cleanup.
