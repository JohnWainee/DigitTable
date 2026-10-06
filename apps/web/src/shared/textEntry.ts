/**
 * Attribute presets for text fields whose content is matched EXACTLY by a server or the engine.
 *
 * iOS Safari's keyboard (measured; other mobile keyboards are not verified) treats a plain `<input type="text">` as prose: they capitalise the first
 * letter, auto-correct on the next space and underline "misspelt" words. For a passphrase, a recovery
 * or room code, or an id typed by the GM that alters a correct entry (measured on the baseline:
 * "teh river stone" -> "The river stone"; a recovery code from an UPPERCASE-only alphabet typed in
 * lowercase -> only its first letter capital; "cowboyhat" -> "Cowboyhat"), and the failure message
 * ("Code or passphrase not recognised.") would give no hint why. Spread one of these onto the input; they are presentation hints only and never change
 * what is validated or sent.
 *
 * `autoCapitalize` is a hint to the on-screen keyboard (it does not rewrite pasted text), so a value
 * that must be case-folded for the request is still folded in its submit handler (room and table codes).
 */
export interface TextEntryHints {
  readonly autoCapitalize: "none" | "characters";
  readonly autoCorrect: "off";
  readonly spellCheck: false;
  readonly autoComplete: "off";
}

/** A case-sensitive secret typed from memory (the session passphrase): exactly what was keyed. */
export const SECRET_TEXT: TextEntryHints = {
  autoCapitalize: "none",
  autoCorrect: "off",
  spellCheck: false,
  autoComplete: "off",
};

/** A code shown in capitals (room, table, recovery): the keyboard stays in capitals. */
export const CODE_TEXT: TextEntryHints = {
  autoCapitalize: "characters",
  autoCorrect: "off",
  spellCheck: false,
  autoComplete: "off",
};

/** An identifier the engine matches exactly (item id, member id): never capitalised or corrected. */
export const IDENTIFIER_TEXT: TextEntryHints = {
  autoCapitalize: "none",
  autoCorrect: "off",
  spellCheck: false,
  autoComplete: "off",
};
