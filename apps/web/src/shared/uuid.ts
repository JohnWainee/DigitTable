/**
 * RFC 4122 v4 UUID that also works on a plain-http LAN page. `crypto.randomUUID`
 * exists only in secure contexts (https/localhost), so a phone opening the app at
 * `http://<laptop-ip>:5173` for a two-device playtest would otherwise throw on
 * every command, join, and create. `crypto.getRandomValues` works everywhere.
 */
export function newUuid(): string {
  const webCrypto = globalThis.crypto;
  if (typeof webCrypto.randomUUID === "function") return webCrypto.randomUUID();
  const bytes = webCrypto.getRandomValues(new Uint8Array(16));
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0"));
  return [
    hex.slice(0, 4).join(""),
    hex.slice(4, 6).join(""),
    hex.slice(6, 8).join(""),
    hex.slice(8, 10).join(""),
    hex.slice(10, 16).join(""),
  ].join("-");
}
