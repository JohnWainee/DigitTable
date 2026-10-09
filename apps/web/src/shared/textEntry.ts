/**
 * Attribute sets for text fields whose value is a code, secret or identifier rather than prose.
 * Mobile keyboards otherwise "help" by capitalising the first letter, autocorrecting to a dictionary
 * word, or underlining it as misspelt, which silently alters a passphrase, recovery code or id the
 * person typed exactly. Spread onto the `<input>`; presentation/input behaviour only.
 */
export const EXACT_TEXT_ENTRY = {
  autoComplete: "off",
  autoCorrect: "off",
  autoCapitalize: "none",
  spellCheck: false,
} as const;

/** Room codes are printed upper case; the keyboard may capitalise them but never autocorrect them. */
export const ROOM_CODE_ENTRY = {
  autoComplete: "off",
  autoCorrect: "off",
  autoCapitalize: "characters",
  spellCheck: false,
} as const;
