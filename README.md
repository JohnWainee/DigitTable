# DigiTable

DigiTable is a template-driven digital play surface for narrative tabletop RPGs.

- **Platform:** sessions, roles, realtime state, dice, encounters, maps, broadcasts, journals, accessibility, and offline recovery.
- **First template:** *Eat the Reich*.
- **Reference implementation:** [Signal Bleed](https://github.com/JohnWainee/signal-bleed), used to identify proven interaction and operations patterns—not copied as a framework constraint.

The product should foreground fiction and spectacle while keeping calculation inspectable but quiet. Players get a mobile-first character/action surface; the GM gets a director console; shared events can temporarily turn every connected screen into one synchronized presentation.

Start with [CLAUDE_HANDOFF.md](CLAUDE_HANDOFF.md). The canonical technical proposal is [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md); the remaining documents in [`docs/`](docs/) provide focused product and UX detail.

## Proposed stack

- React, TypeScript, and Vite for the application shell
- Firebase Anonymous Auth, Functions, and Firestore for authoritative rooms and live state
- Realtime Database for ephemeral presence
- SVG for interactive maps
- PixiJS later for template-specific 2D effects after the core flow is proven
- React Three Fiber deferred until after the core flow is proven
- A service worker and local persistence for resilient PWA behavior

No copyrighted game text or art should be committed unless its use and distribution are authorized. Rules/content packs must remain separable from the platform.
