import { screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { renderApp } from "../support/flows.js";

/**
 * On-screen keyboards: mobile Safari/Chrome capitalise, autocorrect and "smart punctuate" free text
 * by default, which silently alters a typed passphrase, recovery code or table code (so the right
 * secret is rejected as wrong). Secret-like and code-like fields must switch those off.
 */
describe("text-entry hints for secrets and codes", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  function expectVerbatim(el: HTMLElement): void {
    expect(el).toHaveAttribute("autocorrect", "off");
    expect(el).toHaveAttribute("spellcheck", "false");
  }

  it("passphrase and recovery fields on the join screen are typed verbatim", () => {
    renderApp("#/join");
    const passphrase = screen.getByLabelText(/^passphrase$/i);
    expectVerbatim(passphrase);
    expect(passphrase).toHaveAttribute("autocapitalize", "none");
    const roomCode = screen.getByLabelText(/room code/i);
    expectVerbatim(roomCode);
    expect(roomCode).toHaveAttribute("autocapitalize", "characters");
  });

  it("the create screen's passphrase is typed verbatim", () => {
    renderApp("#/create");
    const passphrase = screen.getByLabelText(/^passphrase$/i);
    expectVerbatim(passphrase);
    expect(passphrase).toHaveAttribute("autocapitalize", "none");
  });

  it("the table-display join fields are typed verbatim", () => {
    renderApp("#/table");
    expectVerbatim(screen.getByLabelText(/room code/i));
    const tableCode = screen.getByLabelText(/table code/i);
    expectVerbatim(tableCode);
    expect(tableCode).toHaveAttribute("autocapitalize", "none");
  });
});
