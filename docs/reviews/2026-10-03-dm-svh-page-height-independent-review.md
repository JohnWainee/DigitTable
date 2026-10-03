# Independent review: page height under dynamic browser chrome (2026-10-03)

- **Scope:** `body { min-height }` moved from `100vh` to a `100vh` fallback plus `100svh` behind `@supports`, with a contract-test block. Presentation only. Reviewer: a fresh read-only subagent (not the author, Sonnet 5.5), in a separate context.
- **Verdict:** approve. No blockers.

| # | Finding | Severity | Resolution |
| --- | --- | --- | --- |
| 1 | The "no other bare vh" test matched by value only, so a new `height: 100vh`, `calc(100vh - x)` or `max-height: 45vh` elsewhere would pass | Medium | Rewritten to pin every vh-family declaration by property and value (the exact eight in the stylesheet); verified to fail on an injected `height: 100vh` |
| 2 | `html` has its own background, so the body's grain/halftone layers cover only the body box. On a screen shorter than the viewport, once the toolbars collapse past svh, the strip below shows plain `--ink-0` without grain | Low | Accepted: the grain is faint, the gradients are top-anchored and unaffected, and the alternative was a scrollable blank band the height of the toolbars. Moving the texture to `body::before` is a possible follow-up |
| 3 | Test 1 is whitespace-sensitive (`min-height:100vh`) | Low | Accepted (Prettier-formatted source) |

Reviewer also confirmed: svh (not dvh) is right (dvh would re-layout while toolbars animate); sheet backdrop, `html.sheet-open`, sticky dock and fixed `body::before` do not depend on body height; no TS code uses vh; no AGENTS.md boundary touched.
