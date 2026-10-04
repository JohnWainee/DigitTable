// The verdict of scripts/playtest/option-row-stress.mjs, kept free of any browser so a unit test can drive it with
// synthetic frames (apps/web/test/playtest/optionRowStressRules.test.ts). The probe measures every width x text-scale
// frame in Chrome; this decides what counts as a failure.
//
// A frame is { width, results: [{ scale, pageOverflow, rows: [row] }] }, a row is
//   { where: "checkbox" | "radio" | "gm-card" | "action" | "stress", rowW, rowH, rowScrollOver, textOverRight, boxOutside,
//     buttonOver, stacked, textW, words: [{ word, broken, need }] }
// ("action" is the GM's Reveal row, a div with its own button, which drops its button under the label at the default
// size on a phone, and "stress" is a row deliberately given a label too long to sit beside its box and icon, so both
// are exempt from the "never stacks at the default size" rule).

/** The supported range: a word cut here is a hard failure; beyond it a cut word is a note. */
export const SUPPORTED_MAX_SCALE = 2;
export const SUPPORTED_MIN_WIDTH = 320;
export const MIN_ROW_HEIGHT = 47.5;

/** @returns {{ failures: string[], notes: string[], besideBoxFailures: number }} */
export function evaluateStress(byWidth) {
  const failures = [];
  const notes = [];
  let besideBoxFailures = 0;
  for (const { width, results } of byWidth) {
    for (const { scale, pageOverflow, rows } of results) {
      const at = `${width}px @ ${scale * 100}%`;
      const supported = scale <= SUPPORTED_MAX_SCALE && width >= SUPPORTED_MIN_WIDTH;
      if (pageOverflow > 0) failures.push(`${at}: page overflows by ${pageOverflow}px`);
      for (const row of rows) {
        const id = `${at} ${row.where} row (${row.rowW}px)`;
        if (row.rowScrollOver > 0)
          failures.push(`${id}: row scrolls sideways by ${row.rowScrollOver}px`);
        if (row.textOverRight > 0)
          failures.push(`${id}: text overruns the row by ${row.textOverRight}px`);
        if (row.boxOutside > 0) failures.push(`${id}: box outside the row by ${row.boxOutside}px`);
        if (row.buttonOver > 0)
          failures.push(`${id}: its action button overruns the row by ${row.buttonOver}px`);
        if (row.rowH < MIN_ROW_HEIGHT) failures.push(`${id}: row is ${row.rowH}px tall (< 48)`);
        if (
          scale === 1 &&
          width >= SUPPORTED_MIN_WIDTH &&
          row.stacked &&
          row.where !== "action" &&
          row.where !== "stress"
        ) {
          failures.push(`${id}: stacked at the default text size`);
        }
        for (const word of row.words) {
          if (!word.broken) continue;
          const message = `${id}: "${word.word}" (needs ${word.need}px, text column ${row.textW}px) is cut`;
          if (!row.stacked) {
            besideBoxFailures += 1;
            failures.push(`${message} while still beside its box`);
          } else if (supported) failures.push(`${message} inside the supported range`);
          else notes.push(message);
        }
      }
    }
  }
  return { failures, notes, besideBoxFailures };
}
