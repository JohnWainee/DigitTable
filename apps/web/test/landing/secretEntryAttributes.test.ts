import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Physical-phone keyboard contract for every field whose exact characters matter. The server
 * compares the room passphrase, table code, recovery code and room code byte for byte, so an iOS
 * keyboard that capitalises the first letter, autocorrects a word or underlines it as a typo
 * silently turns a correct entry into "wrong passphrase". Chrome device emulation never applies
 * those behaviours, so the real-browser audit cannot see them; this static pin keeps the attributes
 * from being dropped. (jsdom does not model them either.)
 */

const here = dirname(fileURLToPath(import.meta.url));
const src = (file: string): string => readFileSync(join(here, "../../src", file), "utf8");

/** The full opening `<input ... />` element that carries `id="<id>"`. */
function inputElement(source: string, id: string): string {
  const at = source.indexOf(`id="${id}"`);
  expect(at, `input #${id} not found`).toBeGreaterThan(-1);
  const start = source.lastIndexOf("<input", at);
  const end = source.indexOf("/>", at);
  return source.slice(start, end + 2);
}

const NO_MANGLING = ['autoCorrect="off"', "spellCheck={false}"];

const EXACT_CASE_SECRETS = [
  { file: "landing/JoinScreen.tsx", id: "join-passphrase" },
  { file: "landing/CreateSessionScreen.tsx", id: "passphrase" },
];
// Identifiers whose case is significant and that are typed by hand.
const EXACT_CASE_IDENTIFIERS = [
  { file: "gm2/GmToolsPanel.tsx", id: "grant-item-id" },
  { file: "gm2/GmToolsPanel.tsx", id: "reassign-member-id" },
];
// Minted from an upper-case alphabet, so the keyboard should start in capitals.
const UPPERCASE_CODES = [
  { file: "landing/JoinScreen.tsx", id: "room-code" },
  { file: "landing/JoinScreen.tsx", id: "recover-room-code" },
  { file: "landing/JoinScreen.tsx", id: "recovery-code" },
  { file: "landing/JoinTableScreen.tsx", id: "table-room-code" },
  { file: "landing/JoinTableScreen.tsx", id: "table-code" },
];

describe("secret and identifier entry fields on a phone keyboard", () => {
  it.each([...EXACT_CASE_SECRETS, ...EXACT_CASE_IDENTIFIERS])(
    "never capitalises, autocorrects or spell-checks #$id",
    ({ file, id }) => {
      const element = inputElement(src(file), id);
      expect(element).toContain('autoCapitalize="none"');
      for (const attribute of NO_MANGLING) expect(element).toContain(attribute);
    },
  );

  it.each(UPPERCASE_CODES)(
    "starts #$id in capitals and never autocorrects or spell-checks it",
    ({ file, id }) => {
      const element = inputElement(src(file), id);
      expect(element).toContain('autoCapitalize="characters"');
      for (const attribute of NO_MANGLING) expect(element).toContain(attribute);
    },
  );

  it("normalises a typed recovery code to the upper-case alphabet it was minted in", () => {
    // A lower-case or padded entry (hardware keyboard, paste) could never match the exact-compare
    // server hash, so it is normalised before the request.
    expect(src("landing/JoinScreen.tsx")).toMatch(
      /recoveryCode:\s*recoveryCode\.trim\(\)\.toUpperCase\(\)/,
    );
  });
});
