import { describe, expect, it } from "vitest";
import { validateFields, type FieldRule } from "../../src/landing/inlineValidation.js";

const rules: readonly FieldRule[] = [
  { id: "code", label: "Room code", required: true, pattern: /^[A-Za-z0-9-]+$/ },
  { id: "pass", label: "Passphrase", required: true, minLength: 4 },
  {
    id: "note",
    label: "Note",
    pattern: /^[a-z]+$/,
    patternMessage: "Note must be lower-case letters.",
  },
  { id: "name", label: "Display name", required: true, visible: true },
];

describe("validateFields", () => {
  it("accepts a complete, well-formed set of values", () => {
    expect(validateFields({ code: "AB-12", pass: "wolf", note: "", name: "Ada" }, rules)).toEqual(
      {},
    );
  });

  it("requires a value exactly like the HTML `required` it replaces: empty fails, whitespace is a value", () => {
    expect(validateFields({ code: "", pass: "wolfbane", name: "Ada" }, rules)).toEqual({
      code: "Room code is required.",
    });
    // The browser accepted a whitespace-only value, and so does the server for codes and passphrases
    // (a legacy room's passphrase may be all spaces), so the inline rule must not be stricter.
    expect(validateFields({ code: "A", pass: "    ", name: "Ada" }, rules)).toEqual({});
  });

  it("additionally requires a visible character where the server does (display names)", () => {
    expect(validateFields({ code: "A", pass: "wolfbane", name: "   " }, rules)).toEqual({
      name: "Display name is required.",
    });
    expect(validateFields({ code: "A", pass: "wolfbane", name: "" }, rules).name).toBe(
      "Display name is required.",
    );
    expect(validateFields({ code: "A", pass: "wolfbane", name: " A " }, rules)).toEqual({});
  });

  it("enforces the minimum length with the same off-by-one the browser applies", () => {
    expect(validateFields({ code: "A", pass: "abc" }, rules).pass).toBe(
      "Passphrase needs at least 4 characters.",
    );
    expect(validateFields({ code: "A", pass: "abcd" }, rules).pass).toBeUndefined();
  });

  it("matches the whole value against an anchored pattern, with a field-specific message", () => {
    expect(validateFields({ code: "bad code!", pass: "wolfbane" }, rules).code).toBe(
      "Room code has characters that are not allowed.",
    );
    expect(validateFields({ code: "A", pass: "wolfbane", note: "UPPER" }, rules).note).toBe(
      "Note must be lower-case letters.",
    );
  });

  it("does not pattern-check an optional field that is empty (like the HTML pattern attribute)", () => {
    expect(validateFields({ code: "A", pass: "wolfbane", note: "" }, rules).note).toBeUndefined();
  });

  it("reports the required message first when a value is both empty and too short", () => {
    expect(validateFields({ code: "A", pass: "" }, rules).pass).toBe("Passphrase is required.");
  });

  it("treats a missing key as empty", () => {
    expect(validateFields({}, rules)).toMatchObject({
      code: "Room code is required.",
      pass: "Passphrase is required.",
    });
  });
});
