import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "jest-axe";
import { beforeEach, describe, expect, it } from "vitest";
import { App } from "../../src/App.js";

/**
 * C01/C06: create/join/claim/table-join screens. Drives fixture mode's
 * real in-memory `RoomEngineStore`/`InMemoryRoomRepository` (running the
 * real `eatTheReichTemplate` — see `apps/web/src/session/roomClient.ts`)
 * through full create -> reveal -> claim and join -> claim flows, and
 * checks accessibility at phone and desktop widths (docs/ETR_SESSION_FLOW.md;
 * issue #14 binding invariants).
 *
 * One `<App />` is rendered per test and navigated via hash changes (not
 * re-rendered per screen), matching how a real single-page session behaves
 * and avoiding duplicate DOM from stacking multiple renders.
 */

function setViewport(width: number, height: number): void {
  window.innerWidth = width;
  window.innerHeight = height;
}

function goTo(hash: string): void {
  act(() => {
    window.location.hash = hash;
    window.dispatchEvent(new Event("hashchange"));
  });
}

function renderApp(hash = "#/"): ReturnType<typeof render> {
  window.location.hash = hash;
  return render(<App />);
}

async function createSession(
  user: ReturnType<typeof userEvent.setup>,
  { sessionName = "Rooftop Drop", passphrase = "wolfbane", displayName = "Nadia" } = {},
): Promise<{ roomCode: string; tableCode: string }> {
  goTo("#/create");
  await user.type(screen.getByLabelText(/session name/i), sessionName);
  await user.type(screen.getByLabelText(/^passphrase$/i), passphrase);
  await user.type(screen.getByLabelText(/your display name/i), displayName);
  await user.click(screen.getByRole("button", { name: /^create session$/i }));
  await screen.findByRole("heading", { name: /write these down/i });
  const roomCode = screen.getByText(/^room code$/i).nextElementSibling!.textContent;
  const tableCode = screen.getByText(/^table code$/i).nextElementSibling!.textContent;
  return { roomCode, tableCode };
}

describe("Landing / create / join / claim (C01)", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    setViewport(375, 812);
    window.location.hash = "";
  });

  it("shows the fixture-mode label on the landing screen and has no axe violations at 375x812, 1280x800, and 1920x1080", async () => {
    setViewport(375, 812);
    const { container } = renderApp("#/");
    expect(screen.getByText(/local fixture — not a live room/i)).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();

    setViewport(1280, 800);
    expect(await axe(container)).toHaveNoViolations();

    setViewport(1920, 1080);
    expect(await axe(container)).toHaveNoViolations();
  });

  it("creates a session, reveals secrets once, and lets the GM continue to the invite panel", async () => {
    const user = userEvent.setup();
    renderApp("#/");
    await createSession(user);

    // The passphrase is echoed from what the GM typed, not fabricated.
    expect(screen.getByText("wolfbane")).toBeInTheDocument();
    // Table code slot is present even though A03 has not published the real field yet.
    expect(screen.getByText(/table code/i)).toBeInTheDocument();

    const wroteDown = screen.getByLabelText(/i have written these down/i);
    await user.click(wroteDown);
    await user.click(screen.getByRole("button", { name: /i'm ready — continue/i }));

    expect(await screen.findByRole("heading", { name: /invite/i })).toBeInTheDocument();
    // No projection has been fetched yet on the just-created reveal screen
    // (InvitePanel's own doc comment), so no live claimed-count is shown here.
    expect(
      screen.getByText(/share the room code and your passphrase with your players/i),
    ).toBeInTheDocument();
  });

  it("lets a player join by code and passphrase, then claim a character from the full roster", async () => {
    const user = userEvent.setup();
    renderApp("#/");
    const { roomCode } = await createSession(user);

    window.localStorage.clear(); // the joining player is a different browser/identity
    goTo("#/join");
    await user.type(screen.getByLabelText(/room code/i), roomCode);
    await user.type(screen.getByLabelText(/^passphrase$/i), "wolfbane");
    await user.type(screen.getByLabelText(/your display name/i), "Rook's Player");
    await user.click(screen.getByRole("button", { name: /^join session$/i }));

    expect(await screen.findByRole("heading", { name: /your recovery code/i })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /i wrote it down/i }));

    expect(
      await screen.findByRole("heading", { name: /pick your character/i }),
    ).toBeInTheDocument();
    // All six roster fixture characters render (docs/ETR_RULES_MATRIX.md Appendix A).
    for (const name of ["Iryna", "Nicole", "Cosgrave", "Chuck", "Astrid", "Flint"]) {
      expect(screen.getByRole("heading", { name })).toBeInTheDocument();
    }

    const rookCard = screen.getByRole("heading", { name: "Iryna" }).closest("li")!;
    await user.click(within(rookCard).getByRole("button", { name: /claim/i }));

    expect(await within(rookCard).findByText(/^yours$/i)).toBeInTheDocument();
  });

  it("rejects a second claim of the same character (CHARACTER_TAKEN)", async () => {
    const user = userEvent.setup();
    renderApp("#/");
    const { roomCode } = await createSession(user);

    // Player A joins and claims Rook.
    window.localStorage.clear();
    goTo("#/join");
    await user.type(screen.getByLabelText(/room code/i), roomCode);
    await user.type(screen.getByLabelText(/^passphrase$/i), "wolfbane");
    await user.type(screen.getByLabelText(/your display name/i), "Player A");
    await user.click(screen.getByRole("button", { name: /^join session$/i }));
    await screen.findByRole("heading", { name: /your recovery code/i });
    await user.click(screen.getByRole("button", { name: /i wrote it down/i }));
    await screen.findByRole("heading", { name: /pick your character/i });
    const rookCardA = screen.getByRole("heading", { name: "Iryna" }).closest("li")!;
    await user.click(within(rookCardA).getByRole("button", { name: /claim/i }));
    await within(rookCardA).findByText(/^yours$/i);

    // Player B joins as a different identity and tries to claim Rook too.
    window.localStorage.clear();
    goTo("#/join");
    await user.type(screen.getByLabelText(/room code/i), roomCode);
    await user.type(screen.getByLabelText(/^passphrase$/i), "wolfbane");
    await user.type(screen.getByLabelText(/your display name/i), "Player B");
    await user.click(screen.getByRole("button", { name: /^join session$/i }));
    await screen.findByRole("heading", { name: /your recovery code/i });
    await user.click(screen.getByRole("button", { name: /i wrote it down/i }));
    await screen.findByRole("heading", { name: /pick your character/i });

    // The real projection carries no member display name (matrix's
    // `claimedByMemberId` is a bare id) — "claimed" only.
    const rookCardB = screen.getByRole("heading", { name: "Iryna" }).closest("li")!;
    expect(await within(rookCardB).findByText(/^claimed$/i)).toBeInTheDocument();
  });

  it("rejects a bad passphrase with the same message as a bad room code (no oracle)", async () => {
    const user = userEvent.setup();
    renderApp("#/join");
    await user.type(screen.getByLabelText(/room code/i), "NOPE99");
    await user.type(screen.getByLabelText(/^passphrase$/i), "wrongpass");
    await user.type(screen.getByLabelText(/your display name/i), "Someone");
    await user.click(screen.getByRole("button", { name: /^join session$/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /code or passphrase not recognised/i,
    );
  });

  it("joins as the table display with no secrets and no form controls after connecting", async () => {
    const user = userEvent.setup();
    renderApp("#/");
    const { roomCode, tableCode } = await createSession(user);

    goTo("#/table");
    await user.type(screen.getByLabelText(/room code/i), roomCode);
    await user.type(screen.getByLabelText(/table code/i), tableCode);
    await user.click(screen.getByRole("button", { name: /connect display/i }));

    expect(
      await screen.findByRole("button", { name: /open the table display/i }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("offers Resume on the landing screen after joining, and Forget clears it", async () => {
    const user = userEvent.setup();
    renderApp("#/");
    await createSession(user);
    await user.click(screen.getByLabelText(/i have written these down/i));
    await user.click(screen.getByRole("button", { name: /i'm ready — continue/i }));

    goTo("#/");
    expect(await screen.findByRole("heading", { name: /^resume$/i })).toBeInTheDocument();
    expect(screen.getByText(/nadia/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /forget this session/i }));
    expect(screen.queryByRole("heading", { name: /^resume$/i })).not.toBeInTheDocument();
  });

  it("asks the phone keyboard for capitals with no autocorrect, and accepts a code typed in lower case with a space", async () => {
    const user = userEvent.setup();
    renderApp("#/");
    const { roomCode } = await createSession(user);

    window.localStorage.clear();
    goTo("#/join");
    await user.type(screen.getByLabelText(/room code/i), roomCode);
    await user.type(screen.getByLabelText(/^passphrase$/i), "wolfbane");
    await user.type(screen.getByLabelText(/your display name/i), "Rook's Player");
    await user.click(screen.getByRole("button", { name: /^join session$/i }));
    await screen.findByRole("heading", { name: /your recovery code/i });
    const originalCode = screen.getByText(/^[A-Z0-9]{6,}$/).textContent;

    window.localStorage.clear();
    goTo("#/");
    goTo("#/join");
    await user.click(screen.getByRole("button", { name: /lost your browser/i }));

    // The server compares the code case-exactly against an upper-case alphabet, so an iPhone's
    // default first-letter-only capitalisation (or autocorrect) would turn a right code wrong.
    const field = screen.getByLabelText(/recovery code/i);
    expect(field).toHaveAttribute("autocapitalize", "characters");
    expect(field).toHaveAttribute("autocorrect", "off");
    expect(field).toHaveAttribute("spellcheck", "false");

    const typed = `${originalCode.slice(0, 5)} ${originalCode.slice(5)}`.toLowerCase();
    await user.type(screen.getByLabelText(/^room code$/i), roomCode);
    await user.type(field, typed);
    await user.type(screen.getByLabelText(/your display name/i), "Rook's Player");
    await user.click(screen.getByRole("button", { name: /^recover my seat$/i }));
    expect(
      await screen.findByRole("heading", { name: /your new recovery code/i }),
    ).toBeInTheDocument();
  });

  it("leaves passphrases and codes exactly as typed: no auto-capitalisation or autocorrect on a phone keyboard", () => {
    // Passphrases are user-chosen and compared exactly, so an iPhone's default first-letter
    // capital or an autocorrected word would fail a correct entry; codes are upper-case by design.
    const exact = (field: HTMLElement, capitalize: "none" | "characters"): void => {
      expect(field).toHaveAttribute("autocapitalize", capitalize);
      expect(field).toHaveAttribute("autocorrect", "off");
      expect(field).toHaveAttribute("spellcheck", "false");
    };
    renderApp("#/create");
    exact(screen.getByLabelText(/^passphrase$/i), "none");
    goTo("#/join");
    exact(screen.getByLabelText(/^room code$/i), "characters");
    exact(screen.getByLabelText(/^passphrase$/i), "none");
    goTo("#/table");
    exact(screen.getByLabelText(/^room code$/i), "characters");
    exact(screen.getByLabelText(/^table code$/i), "characters");
    // The recovery form's room code (its recovery-code field is asserted below).
    goTo("#/join");
    act(() => screen.getByRole("button", { name: /lost your browser/i }).click());
    exact(screen.getByLabelText(/^room code$/i), "characters");
  });

  it("hands focus to the shown-once secrets and then to the next action when the create form is replaced", async () => {
    const user = userEvent.setup();
    renderApp("#/");
    await createSession(user);
    // The submit button that had focus is gone with its form; focus must not fall to <body>.
    expect(screen.getByRole("heading", { name: /write these down/i })).toHaveFocus();

    await user.click(screen.getByLabelText(/i have written these down/i));
    await user.click(screen.getByRole("button", { name: /i'm ready — continue/i }));
    expect(await screen.findByRole("button", { name: /open the director console/i })).toHaveFocus();
  });

  it("moves focus to the new view's heading on the join/recover switch, the join reveal and the recovery reveal, and never steals it on load", async () => {
    const user = userEvent.setup();
    renderApp("#/");
    const { roomCode } = await createSession(user);

    window.localStorage.clear();
    goTo("#/join");
    expect(screen.getByRole("heading", { level: 1, name: /join a session/i })).not.toHaveFocus();
    await user.type(screen.getByLabelText(/room code/i), roomCode);
    await user.type(screen.getByLabelText(/^passphrase$/i), "wolfbane");
    await user.type(screen.getByLabelText(/your display name/i), "Rook's Player");
    await user.click(screen.getByRole("button", { name: /^join session$/i }));
    expect(await screen.findByRole("heading", { name: /your recovery code/i })).toHaveFocus();
    const originalCode = screen.getByText(/^[A-Z0-9]{6,}$/).textContent;

    window.localStorage.clear();
    goTo("#/");
    goTo("#/join");
    await user.click(screen.getByRole("button", { name: /lost your browser/i }));
    expect(screen.getByRole("heading", { level: 1, name: /recover your seat/i })).toHaveFocus();
    await user.click(screen.getByRole("button", { name: /back to join by code/i }));
    expect(screen.getByRole("heading", { level: 1, name: /join a session/i })).toHaveFocus();

    await user.click(screen.getByRole("button", { name: /lost your browser/i }));
    await user.type(screen.getByLabelText(/^room code$/i), roomCode);
    await user.type(screen.getByLabelText(/recovery code/i), originalCode);
    await user.type(screen.getByLabelText(/your display name/i), "Rook's Player");
    await user.click(screen.getByRole("button", { name: /^recover my seat$/i }));
    expect(await screen.findByRole("heading", { name: /your new recovery code/i })).toHaveFocus();
  });

  it("connects the table display with a code typed in lower case with a stray space, and focuses the one action left", async () => {
    const user = userEvent.setup();
    renderApp("#/");
    const { roomCode, tableCode } = await createSession(user);

    goTo("#/table");
    await user.type(screen.getByLabelText(/^room code$/i), `${roomCode.toLowerCase()} `);
    await user.type(
      screen.getByLabelText(/^table code$/i),
      `${tableCode.slice(0, 5)} ${tableCode.slice(5)}`.toLowerCase(),
    );
    await user.click(screen.getByRole("button", { name: /connect display/i }));
    expect(await screen.findByRole("button", { name: /open the table display/i })).toHaveFocus();
  });

  it("recovers a lost seat, rotates the code, and rejects the spent code", async () => {
    const user = userEvent.setup();
    renderApp("#/");
    const { roomCode } = await createSession(user);

    window.localStorage.clear();
    goTo("#/join");
    await user.type(screen.getByLabelText(/room code/i), roomCode);
    await user.type(screen.getByLabelText(/^passphrase$/i), "wolfbane");
    await user.type(screen.getByLabelText(/your display name/i), "Rook's Player");
    await user.click(screen.getByRole("button", { name: /^join session$/i }));
    await screen.findByRole("heading", { name: /your recovery code/i });
    const originalCode = screen.getByText(/^[A-Z0-9]{6,}$/).textContent;

    window.localStorage.clear();
    goTo("#/");
    goTo("#/join");
    await user.click(screen.getByRole("button", { name: /lost your browser/i }));
    await user.type(screen.getByLabelText(/^room code$/i), roomCode);
    await user.type(screen.getByLabelText(/recovery code/i), originalCode);
    await user.type(screen.getByLabelText(/your display name/i), "Rook's Player");
    await user.click(screen.getByRole("button", { name: /^recover my seat$/i }));

    expect(
      await screen.findByRole("heading", { name: /your new recovery code/i }),
    ).toBeInTheDocument();
    const replacementCode = screen.getByText(/^[A-Z0-9]{6,}$/).textContent;
    expect(replacementCode).not.toBe(originalCode);
    expect(window.localStorage.getItem("digitable.etr.ownership.v2")).not.toContain(
      replacementCode,
    );

    await user.click(screen.getByRole("button", { name: /i wrote it down — continue/i }));
    expect(
      await screen.findByRole("heading", { name: /pick your character/i }),
    ).toBeInTheDocument();

    window.localStorage.clear();
    goTo("#/join");
    await user.click(screen.getByRole("button", { name: /lost your browser/i }));
    await user.type(screen.getByLabelText(/^room code$/i), roomCode);
    await user.type(screen.getByLabelText(/recovery code/i), originalCode);
    await user.type(screen.getByLabelText(/your display name/i), "Someone else");
    await user.click(screen.getByRole("button", { name: /^recover my seat$/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/code not recognised/i);
  });
});
