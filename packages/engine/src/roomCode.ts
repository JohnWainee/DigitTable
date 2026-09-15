/**
 * Room codes are short, unpredictable, human-typeable locators
 * (docs/ARCHITECTURE.md section 8), minted at room creation (board task
 * A03) from the same unambiguous alphabet `secretHash.ts` uses for recovery
 * codes. A generated code is not itself the room's secret (the creator's
 * passphrase is, and the separate table code) — collision-safety (no two
 * live rooms sharing a code) is the caller's job, checking `roomCodes/{code}`
 * inside the creation transaction and regenerating on a hit, not this
 * function's. Ten symbols from a 31-symbol alphabet is ~49.5 bits of
 * entropy: short enough to read aloud and type, far beyond what the
 * admission throttle's 100-per-minute-per-IP enumeration bound makes
 * practically guessable.
 */
const ROOM_CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
const ROOM_CODE_GROUP_LENGTH = 5;
const ROOM_CODE_GROUPS = 2;

/** Matches `apps/functions`/`admission.ts`'s room-code validation: letters, digits, and hyphens only. */
export const ROOM_CODE_PATTERN = /^[A-Za-z0-9-]+$/;

export function generateRoomCode(): string {
  const totalSymbols = ROOM_CODE_GROUP_LENGTH * ROOM_CODE_GROUPS;
  const bytes = crypto.getRandomValues(new Uint8Array(totalSymbols));
  let symbols = "";
  for (const byte of bytes) {
    symbols += ROOM_CODE_ALPHABET[byte % ROOM_CODE_ALPHABET.length];
  }
  const groups: string[] = [];
  for (let group = 0; group < ROOM_CODE_GROUPS; group += 1) {
    groups.push(
      symbols.slice(group * ROOM_CODE_GROUP_LENGTH, (group + 1) * ROOM_CODE_GROUP_LENGTH),
    );
  }
  return groups.join("-");
}
