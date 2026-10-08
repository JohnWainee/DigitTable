import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../../src/App.js";
import { GmToolsPanel } from "../../src/gm2/GmToolsPanel.js";

/**
 * Mobile keyboards capitalise, autocorrect and spell-"fix" what is typed. For a passphrase, recovery
 * code, room/table code or id that silently changes the value, so every exact-value field must
 * switch those off (and free-text names/reasons must keep the platform defaults).
 */

function goTo(hash: string): void {
  act(() => {
    window.location.hash = hash;
    window.dispatchEvent(new Event("hashchange"));
  });
}

function expectExact(field: HTMLElement, capitalize: "none" | "characters"): void {
  expect(field).toHaveAttribute("autocapitalize", capitalize);
  expect(field).toHaveAttribute("autocorrect", "off");
  expect(field).toHaveAttribute("spellcheck", "false");
  expect(field).toHaveAttribute("autocomplete", "off");
}

function expectPlatformDefaults(field: HTMLElement): void {
  expect(field).not.toHaveAttribute("autocorrect");
  expect(field).not.toHaveAttribute("spellcheck", "false");
  expect(field).not.toHaveAttribute("autocapitalize", "none");
}

describe("exact-value text entry hints", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    window.location.hash = "";
  });

  it("create: the passphrase is case-exact; names keep platform defaults", () => {
    render(<App />);
    goTo("#/create");
    expectExact(screen.getByLabelText(/^passphrase$/i), "none");
    expectPlatformDefaults(screen.getByLabelText(/session name/i));
    expectPlatformDefaults(screen.getByLabelText(/your display name/i));
  });

  it("join and seat recovery: codes are exact, display names are not", async () => {
    render(<App />);
    goTo("#/join");
    expectExact(screen.getByLabelText(/^room code$/i), "characters");
    expectExact(screen.getByLabelText(/^passphrase$/i), "none");
    expectPlatformDefaults(screen.getByLabelText(/your display name/i));

    await userEvent.click(screen.getByRole("button", { name: /recover your seat/i }));
    expectExact(screen.getByLabelText(/^room code$/i), "characters");
    // Recovery codes are minted from an upper-case-only alphabet and verified without case folding.
    expectExact(screen.getByLabelText(/^recovery code$/i), "characters");
    expectPlatformDefaults(screen.getByLabelText(/your display name/i));
  });

  it("table display: room and table codes are exact capitals", () => {
    render(<App />);
    goTo("#/table");
    expectExact(screen.getByLabelText(/^room code$/i), "characters");
    expectExact(screen.getByLabelText(/^table code$/i), "characters");
  });

  it("GM tools: item id and member id are exact; names and reasons keep defaults", () => {
    render(
      <GmToolsPanel
        gmSheets={[]}
        rolls={[]}
        onVoidRoll={vi.fn()}
        onGrantItem={vi.fn()}
        onUnlockAdvance={vi.fn()}
        onReassignCharacter={vi.fn()}
      />,
    );
    expectExact(screen.getByLabelText(/^item id$/i), "none");
    expectExact(screen.getByLabelText(/new member id/i), "none");
    expectPlatformDefaults(screen.getByLabelText(/^name$/i));
  });
});
