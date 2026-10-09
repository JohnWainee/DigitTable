import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { EXACT_TEXT_ENTRY, ROOM_CODE_ENTRY } from "../../src/shared/textEntry.js";

/**
 * A phone keyboard that capitalises, autocorrects or "spell-checks" a passphrase, recovery code,
 * table code or id silently changes what the person typed, and the join is rejected with no hint
 * why. jsdom has no keyboard, so this pins the *attributes*: the shared sets say what they must,
 * and every code/secret/id field in the app spreads one of them.
 */

const src = join(dirname(fileURLToPath(import.meta.url)), "../../src");

function tsxFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? tsxFiles(path) : path.endsWith(".tsx") ? [path] : [];
  });
}

/** Every `<input … />` opening tag in the app, with the file it came from. */
function inputs(): { file: string; tag: string; id: string | undefined }[] {
  return tsxFiles(src).flatMap((file) =>
    [...readFileSync(file, "utf8").matchAll(/<input\b[\s\S]*?\/>/g)].map((m) => ({
      file,
      tag: m[0],
      id: /\bid="([^"]+)"/.exec(m[0])?.[1],
    })),
  );
}

describe("text-entry hints", () => {
  it("exact entry switches off capitalisation, autocorrect, spell check and autofill", () => {
    expect(EXACT_TEXT_ENTRY).toEqual({
      autoComplete: "off",
      autoCorrect: "off",
      autoCapitalize: "none",
      spellCheck: false,
    });
  });

  it("room codes may be capitalised by the keyboard but are never autocorrected", () => {
    expect(ROOM_CODE_ENTRY.autoCapitalize).toBe("characters");
    expect(ROOM_CODE_ENTRY.autoCorrect).toBe("off");
    expect(ROOM_CODE_ENTRY.spellCheck).toBe(false);
  });

  it("every passphrase, recovery code, table code and id field spreads one of the sets", () => {
    const secretish = /passphrase|recovery-code|table-code|room-code|item-id|member-id/;
    const found = inputs().filter((input) => input.id && secretish.test(input.id));
    // Guard against the scan silently matching nothing (a renamed id or a changed JSX shape).
    expect(found.map((f) => f.id).sort()).toEqual(
      [
        "grant-item-id",
        "join-passphrase",
        "passphrase",
        "recover-room-code",
        "recovery-code",
        "reassign-member-id",
        "room-code",
        "table-code",
        "table-room-code",
      ].sort(),
    );
    const unprotected = found.filter(
      (f) => !/\{\.\.\.(EXACT_TEXT_ENTRY|ROOM_CODE_ENTRY)\}/.test(f.tag),
    );
    expect(unprotected.map((f) => f.id)).toEqual([]);
  });
});
