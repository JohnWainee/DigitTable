# Task: secure-context and hard-coded-host review (code-reader seat)

Scenario: the built web app is served over plain http from a laptop's LAN address (for example http://192.168.1.20:5173) and opened in a PHONE browser. That page is NOT a secure context (only https and localhost are). The Firebase emulators run on the laptop.

Facts about browsers you must apply: `crypto.randomUUID()` and all of `crypto.subtle` exist ONLY in secure contexts (they are undefined on plain-http LAN pages). `crypto.getRandomValues()` works in every context. On the phone, `127.0.0.1` means the phone itself, not the laptop.

For each numbered excerpt below, answer: does it break in this scenario, and why? Then name any excerpt that hard-codes a host that a phone cannot reach.

## Excerpt 1 — apps/web/src/session/roomClient.ts (lines 37-44)
```ts
const USE_EMULATOR = import.meta.env.VITE_FIREBASE_USE_EMULATOR === "true";

const emulatorConfig: SessionEmulatorConfig | undefined = USE_EMULATOR
  ? {
      auth: { url: "http://127.0.0.1:9099" },
      functions: { host: "127.0.0.1", port: 5001 },
      firestore: { host: "127.0.0.1", port: 8080 },
    }
```

## Excerpt 2 — every use of browser crypto/storage APIs found by grep in apps/web/src and packages/engine/src
```
apps/web/src/gm2/GmDirectorScreen.tsx:86:    const result = await dispatch(asCommandId(globalThis.crypto.randomUUID()), payload);
apps/web/src/landing/ClaimCharacterScreen.tsx:33:    const result = await dispatch(asCommandId(globalThis.crypto.randomUUID()), {
apps/web/src/landing/JoinScreen.tsx:26:    const requestId = globalThis.crypto.randomUUID();
apps/web/src/landing/JoinTableScreen.tsx:31:    const requestId = globalThis.crypto.randomUUID();
apps/web/src/repository/InMemoryRoomRepository.ts:138:    const seed = globalThis.crypto.getRandomValues(new Uint8Array(16));
apps/web/src/player2/PlayerDashboardScreen.tsx:116:    const result = await dispatch(asCommandId(globalThis.crypto.randomUUID()), payload);
apps/web/src/session/RoomEngineStore.ts:24:  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(length));
apps/web/src/session/ownership.ts:71:    const minted = globalThis.crypto.randomUUID();
apps/web/src/session/ownership.ts:75:    return globalThis.crypto.randomUUID();
packages/engine/src/secretHash.ts:39:  const keyMaterial = await crypto.subtle.importKey(
packages/engine/src/secretHash.ts:46:  const bits = await crypto.subtle.deriveBits(
packages/engine/src/secretHash.ts:59:  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH_BYTES));
packages/engine/src/secretHash.ts:88:  const bytes = crypto.getRandomValues(new Uint8Array(RECOVERY_CODE_LENGTH));
packages/engine/src/roomCode.ts:23:  const bytes = crypto.getRandomValues(new Uint8Array(totalSymbols));
```

## Excerpt 3 — apps/web/src/firebase/anonymousAuth.ts (lines 31-37)
```ts
  const auth = getAuth(app);
  if (emulator !== undefined && !emulatorConnected.has(auth)) {
    // `disableWarnings`: the emulator banner is developer-facing noise in a
    // headless test run; it changes no security behavior.
    connectAuthEmulator(auth, emulator.url, { disableWarnings: true });
    emulatorConnected.add(auth);
  }
```
