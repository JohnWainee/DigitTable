import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "jest-axe";
import { beforeEach, describe, expect, it } from "vitest";
import { renderApp, setViewport } from "../support/flows.js";

/**
 * The signed-out forms used to lean on the browser's constraint validation (`required`, `pattern`,
 * `minLength`), whose bubble is a browser-drawn pop-out: unstyled, anchored wherever the engine puts
 * it (on a phone often under the on-screen keyboard), gone after a few seconds, and announced
 * inconsistently. They now carry `noValidate` and show their own inline errors; these tests pin the
 * behaviour a real browser cannot be asked about from jsdom (the real-browser audit,
 * `scripts/playtest/ui-audit.mjs`, checks the same contract live at phone sizes).
 */

type User = ReturnType<typeof userEvent.setup>;

function field(label: RegExp | string): HTMLInputElement {
  return screen.getByLabelText<HTMLInputElement>(label);
}

function describedBy(input: HTMLElement): string {
  return (input.getAttribute("aria-describedby") ?? "")
    .split(/\s+/)
    .filter(Boolean)
    .map((id) => document.getElementById(id)?.textContent ?? "")
    .join(" ");
}

function expectInvalid(input: HTMLElement, message: RegExp): void {
  expect(input).toHaveAttribute("aria-invalid", "true");
  expect(describedBy(input)).toMatch(message);
}

function expectValid(input: HTMLElement): void {
  expect(input).not.toHaveAttribute("aria-invalid");
}

describe("inline form validation (no native bubbles)", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    setViewport(375, 812);
    window.location.hash = "";
  });

  it.each([
    ["#/create", "create session"],
    ["#/join", "join session"],
    ["#/table", "connect display"],
  ])("%s: the form opts out of native validation so no browser bubble can appear", (hash) => {
    renderApp(hash);
    const form = document.querySelector("form")!;
    expect(form).toHaveAttribute("novalidate");
    // The semantics the browser used to enforce stay on the inputs for assistive technology.
    expect(form.querySelector("[required]")).not.toBeNull();
  });

  describe("create session", () => {
    async function submit(user: User): Promise<void> {
      await user.click(screen.getByRole("button", { name: /^create session$/i }));
    }

    it("flags every empty required field, announces one alert, and focuses the first", async () => {
      const user = userEvent.setup();
      renderApp("#/create");
      expect(screen.queryByRole("alert")).toBeNull();
      await submit(user);

      expectInvalid(field(/session name/i), /session name is required/i);
      expectInvalid(field(/^passphrase$/i), /passphrase is required/i);
      expectInvalid(field(/your display name/i), /display name is required/i);
      expect(screen.getByRole("alert")).toHaveTextContent(/need fixing/i);
      expect(field(/session name/i)).toHaveFocus();
      // Nothing was sent: still on the form, no secrets card.
      expect(screen.queryByRole("heading", { name: /write these down/i })).toBeNull();
    });

    it("keeps the passphrase hint in the field's description alongside its error", async () => {
      const user = userEvent.setup();
      renderApp("#/create");
      expect(describedBy(field(/^passphrase$/i))).toMatch(/never shown again/i);
      await submit(user);
      const description = describedBy(field(/^passphrase$/i));
      expect(description).toMatch(/never shown again/i);
      expect(description).toMatch(/passphrase is required/i);
    });

    it("clears a field's error as it is corrected and keeps the others until they are", async () => {
      const user = userEvent.setup();
      renderApp("#/create");
      await submit(user);
      await user.type(field(/session name/i), "Rooftop Drop");
      expectValid(field(/session name/i));
      expect(document.getElementById("session-name-error")).toBeNull();
      expectInvalid(field(/^passphrase$/i), /required/i);

      await user.type(field(/^passphrase$/i), "abc");
      expectInvalid(field(/^passphrase$/i), /at least 4 characters/i);
      await user.type(field(/^passphrase$/i), "d");
      expectValid(field(/^passphrase$/i));
    });

    it("moves focus to the first still-invalid field on a second failed submit, then proceeds once valid", async () => {
      const user = userEvent.setup();
      renderApp("#/create");
      await user.type(field(/session name/i), "Rooftop Drop");
      await user.type(field(/^passphrase$/i), "abc");
      await user.type(field(/your display name/i), "Nadia");
      await submit(user);
      expect(field(/^passphrase$/i)).toHaveFocus();
      expectInvalid(field(/^passphrase$/i), /at least 4 characters/i);
      expect(screen.getByRole("alert")).toBeInTheDocument();

      await user.type(field(/^passphrase$/i), "d");
      expect(screen.queryByRole("alert")).toBeNull();
      await submit(user);
      expect(await screen.findByRole("heading", { name: /write these down/i })).toBeInTheDocument();
    });

    it("announces a second failed submit again: the alert is a fresh node, not the one already mounted", async () => {
      const user = userEvent.setup();
      renderApp("#/create");
      await submit(user);
      const first = screen.getByRole("alert");
      await submit(user);
      const second = screen.getByRole("alert");
      expect(second).not.toBe(first);
      expect(first.isConnected).toBe(false);
    });

    it("requires a visible display name but, like the browser's `required`, lets a whitespace passphrase through to the server", async () => {
      const user = userEvent.setup();
      renderApp("#/create");
      await user.type(field(/session name/i), "Rooftop Drop");
      await user.type(field(/^passphrase$/i), "    ");
      await user.type(field(/your display name/i), "   ");
      await submit(user);
      expectInvalid(field(/your display name/i), /display name is required/i);
      expectValid(field(/^passphrase$/i));
      expectValid(field(/session name/i));
    });

    it("has no axe violations while errors are shown", async () => {
      const user = userEvent.setup();
      renderApp("#/create");
      await submit(user);
      expect(await axe(document.body)).toHaveNoViolations();
    });
  });

  describe("join session", () => {
    it("no longer carries the native `pattern` attribute (Chrome rejected its `[A-Za-z0-9-]+` under the v flag)", () => {
      renderApp("#/join");
      expect(document.querySelector("[pattern]")).toBeNull();
      expect(document.querySelector("form")).toHaveAttribute("novalidate");
    });

    it("rejects characters outside letters, digits and dashes in the room code, inline", async () => {
      const user = userEvent.setup();
      renderApp("#/join");
      await user.type(field(/room code/i), "bad code!");
      await user.type(field(/^passphrase$/i), "wolfbane");
      await user.type(field(/your display name/i), "Ada");
      await user.click(screen.getByRole("button", { name: /^join session$/i }));

      expectInvalid(field(/room code/i), /letters, numbers and dashes/i);
      expectValid(field(/^passphrase$/i));
      expectValid(field(/your display name/i));
      expect(field(/room code/i)).toHaveFocus();
      expect(screen.queryByRole("heading", { name: /your recovery code/i })).toBeNull();
    });

    it("requires a visible display name here too (the server rejects a blank one), but lets whitespace through elsewhere", async () => {
      const user = userEvent.setup();
      renderApp("#/join");
      await user.type(field(/room code/i), "ABCD-1234");
      await user.type(field(/^passphrase$/i), "    ");
      await user.type(field(/your display name/i), "   ");
      await user.click(screen.getByRole("button", { name: /^join session$/i }));
      expectInvalid(field(/your display name/i), /display name is required/i);
      expectValid(field(/^passphrase$/i));
      expectValid(field(/room code/i));
    });

    it("flags all three empty fields and has no axe violations", async () => {
      const user = userEvent.setup();
      renderApp("#/join");
      await user.click(screen.getByRole("button", { name: /^join session$/i }));
      expectInvalid(field(/room code/i), /room code is required/i);
      expectInvalid(field(/^passphrase$/i), /passphrase is required/i);
      expectInvalid(field(/your display name/i), /display name is required/i);
      expect(await axe(document.body)).toHaveNoViolations();
    });
  });

  describe("recover your seat", () => {
    it("flags empty fields and a malformed room code inline, never as a native bubble", async () => {
      const user = userEvent.setup();
      renderApp("#/join");
      await user.click(screen.getByRole("button", { name: /lost your browser/i }));
      expect(document.querySelector("form")).toHaveAttribute("novalidate");

      await user.click(screen.getByRole("button", { name: /^recover my seat$/i }));
      expectInvalid(field(/^room code$/i), /room code is required/i);
      expectInvalid(field(/recovery code/i), /recovery code is required/i);
      expectInvalid(field(/your display name/i), /display name is required/i);
      expect(field(/^room code$/i)).toHaveFocus();

      await user.type(field(/^room code$/i), "no good");
      expectInvalid(field(/^room code$/i), /letters, numbers and dashes/i);
      expect(await axe(document.body)).toHaveNoViolations();
    });
  });

  describe("recover: the display name is local only", () => {
    it("keeps the browser's semantics for it (empty fails, whitespace is a value), since the recover callable never sees it", async () => {
      const user = userEvent.setup();
      renderApp("#/join");
      await user.click(screen.getByRole("button", { name: /lost your browser/i }));
      await user.type(field(/^room code$/i), "ABCD-1234");
      await user.type(field(/recovery code/i), "CODE-1234");
      await user.type(field(/your display name/i), "   ");
      await user.click(screen.getByRole("button", { name: /^recover my seat$/i }));
      expectValid(field(/your display name/i));
    });
  });

  describe("join as the table display", () => {
    it("flags both empty fields inline and focuses the first", async () => {
      const user = userEvent.setup();
      renderApp("#/table");
      await user.click(screen.getByRole("button", { name: /connect display/i }));
      expectInvalid(field(/room code/i), /room code is required/i);
      expectInvalid(field(/table code/i), /table code is required/i);
      expect(field(/room code/i)).toHaveFocus();
      expect(await axe(document.body)).toHaveNoViolations();
    });
  });
});
