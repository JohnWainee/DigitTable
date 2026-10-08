/**
 * Attribute sets for text fields whose exact characters matter. Mobile keyboards otherwise
 * capitalise the first letter, autocorrect, and offer predictive replacements, which silently alters a
 * passphrase, recovery code, room code, or id the person typed correctly. Spread onto an `<input>`;
 * free-text fields (names, reasons) deliberately keep the platform defaults.
 */

/** Case-sensitive secrets and identifiers: no capitalisation, correction, spellcheck, or autofill. */
export const EXACT_TEXT_INPUT = {
  autoCapitalize: "none",
  autoCorrect: "off",
  spellCheck: false,
  autoComplete: "off",
} as const;

/** Codes the app upper-cases itself (room code, table code): show capitals, never autocorrect. */
export const UPPERCASE_CODE_INPUT = {
  autoCapitalize: "characters",
  autoCorrect: "off",
  spellCheck: false,
  autoComplete: "off",
} as const;
