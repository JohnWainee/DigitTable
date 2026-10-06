import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { GmToolsPanel } from "../../src/gm2/GmToolsPanel.js";
import { CODE_TEXT, IDENTIFIER_TEXT, SECRET_TEXT } from "../../src/shared/textEntry.js";
import { renderApp } from "../support/flows.js";

/**
 * A plain `<input type="text">` is treated as prose by the iOS on-screen keyboard: the first letter is
 * capitalised and a word is "corrected" at the next space. Measured in real Mobile Safari (iOS 26.5
 * Simulator, `SafariFlowUITests.testCodeAndSecretFieldsKeepTypedTextVerbatim` and
 * `testGmIdFieldsKeepTypedTextVerbatim`, keys tapped on the soft keyboard): on the baseline the join
 * passphrase "teh river stone" became "The river stone", the create passphrase "Teh river stone", a
 * lowercase recovery code kept only its first capital ("Abcdefghjkmn"; the alphabet is UPPERCASE-only
 * and compared exactly), and the GM item id "cowboyhat" became "Cowboyhat". These tests pin the hints
 * that stop that, field by field, so a restyled form cannot silently drop them. The attributes are
 * keyboard hints only: they change neither what is validated nor what is sent.
 */
function hints(el: HTMLElement): Record<string, string | null> {
  return {
    autocapitalize: el.getAttribute("autocapitalize"),
    autocorrect: el.getAttribute("autocorrect"),
    spellcheck: el.getAttribute("spellcheck"),
    autocomplete: el.getAttribute("autocomplete"),
  };
}

const SECRET = {
  autocapitalize: "none",
  autocorrect: "off",
  spellcheck: "false",
  autocomplete: "off",
};
const CODE = {
  autocapitalize: "characters",
  autocorrect: "off",
  spellcheck: "false",
  autocomplete: "off",
};

describe("text-entry hints for exact-match fields", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    window.location.hash = "";
  });

  it("the presets are what the keyboard needs", () => {
    expect(SECRET_TEXT).toEqual({
      autoCapitalize: "none",
      autoCorrect: "off",
      spellCheck: false,
      autoComplete: "off",
    });
    expect(CODE_TEXT.autoCapitalize).toBe("characters");
    expect(IDENTIFIER_TEXT.autoCapitalize).toBe("none");
    expect(IDENTIFIER_TEXT.autoCorrect).toBe("off");
  });

  it("join: room code stays in capitals, passphrase is left exactly as typed", () => {
    renderApp("#/join");
    expect(hints(screen.getByLabelText("Room code"))).toEqual(CODE);
    expect(hints(screen.getByLabelText("Passphrase"))).toEqual(SECRET);
    // Prose fields keep the platform's normal behaviour.
    expect(screen.getByLabelText("Your display name")).not.toHaveAttribute("autocorrect", "off");
  });

  it("recover: room code and recovery code stay in capitals and are never corrected", async () => {
    renderApp("#/join");
    await userEvent.setup().click(screen.getByRole("button", { name: /recover your seat/i }));
    expect(hints(screen.getByLabelText("Room code"))).toEqual(CODE);
    expect(hints(screen.getByLabelText("Recovery code"))).toEqual(CODE);
  });

  it("create: the passphrase the GM invents is not capitalised or corrected", () => {
    renderApp("#/create");
    expect(hints(screen.getByLabelText("Passphrase"))).toEqual(SECRET);
  });

  it("table display: room code and table code stay in capitals", () => {
    renderApp("#/table");
    expect(hints(screen.getByLabelText("Room code"))).toEqual(CODE);
    expect(hints(screen.getByLabelText("Table code"))).toEqual(CODE);
  });

  it("GM tools: the item id and member id are matched exactly, so they are never altered", () => {
    render(
      <GmToolsPanel
        gmSheets={[]}
        rolls={[]}
        onVoidRoll={() => undefined}
        onGrantItem={() => undefined}
        onUnlockAdvance={() => undefined}
        onReassignCharacter={() => undefined}
      />,
    );
    const identifier = {
      autocapitalize: "none",
      autocorrect: "off",
      spellcheck: "false",
      autocomplete: "off",
    };
    expect(hints(screen.getByLabelText("Item id"))).toEqual(identifier);
    expect(hints(screen.getByLabelText(/new member id/i))).toEqual(identifier);
    // Free-text prose (a reason) is left to the keyboard's normal behaviour.
    expect(document.getElementById("grant-reason")).not.toHaveAttribute("autocorrect", "off");
  });
});
