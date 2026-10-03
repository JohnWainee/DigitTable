import { useState } from "react";

/**
 * Inline form validation, used instead of the browser's own constraint-validation bubbles.
 *
 * A native bubble is drawn by the browser or OS, outside the page: unstyled, anchored wherever the
 * engine decides (on a phone often under the on-screen keyboard or the browser chrome), gone after a
 * few seconds, and announced inconsistently by screen readers. These forms therefore carry
 * `noValidate`, and the rules the markup used to hand to the browser (`required`, `pattern`,
 * `minLength`) are checked here and shown in the page: a message under each invalid field
 * (`aria-invalid` + `aria-describedby`), one alert beside the submit button, and focus on the first
 * invalid field. The server still validates everything; this only fails fast and legibly.
 */

export interface FieldRule {
  /** The input's `id`. */
  readonly id: string;
  /** Plain-language field name used in messages ("Room code"). */
  readonly label: string;
  /** Rejects an empty value, exactly like the HTML `required` attribute it replaces (whitespace counts as a value). */
  readonly required?: boolean;
  /** Also rejects a value with no visible character: the server's rule for display names. */
  readonly visible?: boolean;
  /** Whole-value pattern: write it anchored (`^…$`), as the HTML `pattern` attribute is. */
  readonly pattern?: RegExp;
  readonly patternMessage?: string;
  readonly minLength?: number;
}

export type FieldErrors = Readonly<Record<string, string>>;

export function validateFields(
  values: Readonly<Record<string, string>>,
  rules: readonly FieldRule[],
): FieldErrors {
  const errors: Record<string, string> = {};
  for (const rule of rules) {
    const value = values[rule.id] ?? "";
    if ((rule.required && value === "") || (rule.visible && value.trim() === "")) {
      errors[rule.id] = `${rule.label} is required.`;
    } else if (rule.minLength !== undefined && value !== "" && value.length < rule.minLength) {
      errors[rule.id] = `${rule.label} needs at least ${rule.minLength} characters.`;
    } else if (rule.pattern !== undefined && value !== "" && !rule.pattern.test(value)) {
      errors[rule.id] = rule.patternMessage ?? `${rule.label} has characters that are not allowed.`;
    }
  }
  return errors;
}

export interface InlineValidation {
  /** Empty until the first failed submit; after that it tracks the live values. */
  readonly errors: FieldErrors;
  /** An attempt failed and at least one field is still invalid. */
  readonly failed: boolean;
  /** Failed submits so far; changes on every one, so the alert can be re-announced on a repeat. */
  readonly attempts: number;
  /** Call from `onSubmit`: true when the form may proceed, otherwise flags the fields and focuses the first. */
  readonly check: () => boolean;
  /** `aria-invalid` / `aria-describedby` for the input with this id (`hintId`: its permanent hint, if any). */
  readonly field: (
    id: string,
    hintId?: string,
  ) => { "aria-invalid"?: true; "aria-describedby"?: string };
}

export function useInlineValidation(
  rules: readonly FieldRule[],
  values: Readonly<Record<string, string>>,
): InlineValidation {
  const [attempts, setAttempts] = useState(0);
  // Derived at render, never copied into state: once a submit has failed, fixing a field clears its
  // message on the next keystroke and an untouched one keeps its message.
  const errors = attempts > 0 ? validateFields(values, rules) : {};
  const failed = Object.keys(errors).length > 0;

  function check(): boolean {
    const found = validateFields(values, rules);
    const first = rules.find((rule) => found[rule.id] !== undefined);
    if (first === undefined) return true;
    setAttempts((count) => count + 1);
    document.getElementById(first.id)?.focus();
    return false;
  }

  function field(
    id: string,
    hintId?: string,
  ): { "aria-invalid"?: true; "aria-describedby"?: string } {
    const invalid = errors[id] !== undefined;
    const describedBy = [hintId, invalid ? `${id}-error` : undefined].filter(Boolean).join(" ");
    return {
      ...(invalid ? { "aria-invalid": true as const } : {}),
      ...(describedBy ? { "aria-describedby": describedBy } : {}),
    };
  }

  return { errors, failed, attempts, check, field };
}

/** The message for one field, tied to its input by `aria-describedby="<id>-error"`. */
export function FieldError({
  id,
  message,
}: {
  readonly id: string;
  readonly message: string | undefined;
}): JSX.Element | null {
  return message === undefined ? null : (
    <p id={`${id}-error`} className="field-error">
      {message}
    </p>
  );
}

/**
 * One alert beside the submit button, so the failure is announced and seen where the finger is. Keyed on
 * the attempt count so a second failed submit mounts a fresh alert and is announced again (a live region
 * that merely stays mounted with unchanged text is not).
 */
export function FormErrorSummary({
  show,
  attempt,
}: {
  readonly show: boolean;
  readonly attempt: number;
}): JSX.Element | null {
  return show ? (
    <p key={attempt} role="alert" className="error-message">
      Some details need fixing before you can continue.
    </p>
  ) : null;
}
