/**
 * Recovery codes are minted upper-case from an alphabet with no whitespace and the server compares
 * them byte for byte. A phone keyboard can lower-case what it shows, and a pasted code can carry
 * padding, so the client folds only what could never have matched anyway. The server stays exact
 * (folding there would be an architecture decision about code entropy).
 */
export function normalizeRecoveryCodeEntry(entry: string): string {
  return entry.replace(/\s+/gu, "").toUpperCase();
}
