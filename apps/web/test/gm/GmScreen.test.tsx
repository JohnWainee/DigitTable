import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "jest-axe";
import { asCommandId, type CommandId } from "@digitable/contracts";
import { THREAT_ID } from "@digitable/template-eat-the-reich";
import { beforeEach, describe, expect, it } from "vitest";
import { GmScreen } from "../../src/gm/GmScreen.js";
import { InMemoryRoomRepository } from "../../src/repository/InMemoryRoomRepository.js";

const PHONE_WIDTH = 375;
const DESKTOP_WIDTH = 1280;

function newCommandId(): CommandId {
  return asCommandId(globalThis.crypto.randomUUID());
}

function renderGmScreen(
  repository: InMemoryRoomRepository = new InMemoryRoomRepository(),
): { repository: InMemoryRoomRepository } & ReturnType<typeof render> {
  const utils = render(<GmScreen repository={repository} />);
  return { repository, ...utils };
}

describe("GmScreen", () => {
  beforeEach(() => {
    window.innerWidth = PHONE_WIDTH;
    window.innerHeight = 667;
  });

  it("renders the threat's hidden difficulty modifier and hidden intel", () => {
    renderGmScreen();
    expect(screen.getByText(/hidden difficulty modifier: -1/i)).toBeInTheDocument();
    expect(screen.getByText(/hidden wrist relay/i)).toBeInTheDocument();
  });

  it("shows no active-roll section until the player begins an action", () => {
    renderGmScreen();
    expect(screen.getByText(/no active roll/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /submit opposition/i })).not.toBeInTheDocument();
  });

  it("reveals the un-redacted player faces and hidden roll modifier once a roll is active", async () => {
    const repository = new InMemoryRoomRepository();
    await repository.beginAction(newCommandId(), "enforcer", "strong-arm-the-enforcer", []);
    renderGmScreen(repository);

    expect(screen.getByText(/player faces:/i)).toBeInTheDocument();
    expect(
      screen.getByText(/hidden difficulty modifier applied to this roll/i),
    ).toBeInTheDocument();
  });

  it("reflects activeRoll.status from the engine rather than a locally invented state", async () => {
    const repository = new InMemoryRoomRepository();
    await repository.beginAction(newCommandId(), THREAT_ID, "strong-arm-the-enforcer", []);
    const { rerender, repository: sameRepository } = renderGmScreen(repository);

    expect(screen.getByRole("button", { name: /submit opposition/i })).toBeInTheDocument();

    const rollId = sameRepository.getGmProjection().view.activeRoll?.rollId;
    if (!rollId) throw new Error("expected an active roll");
    await sameRepository.submitOpposition(newCommandId(), rollId, 0);
    rerender(<GmScreen repository={sameRepository} />);

    expect(screen.queryByRole("button", { name: /submit opposition/i })).not.toBeInTheDocument();
    const rollSection = screen.getByRole("region", { name: /active roll/i });
    expect(within(rollSection).getByText(/awaiting the player's allocation/i)).toBeInTheDocument();
  });

  it("submits opposition through the shared dispatch path using only the keyboard", async () => {
    const user = userEvent.setup();
    const repository = new InMemoryRoomRepository();
    await repository.beginAction(newCommandId(), THREAT_ID, "strong-arm-the-enforcer", []);
    renderGmScreen(repository);

    const spinbutton = screen.getByRole("spinbutton");
    spinbutton.focus();
    await user.keyboard("{ArrowUp}");
    expect(spinbutton).toHaveAttribute("aria-valuenow", "1");

    const submitButton = screen.getByRole("button", { name: /submit opposition/i });
    submitButton.focus();
    await user.keyboard("{Enter}");

    await waitFor(() =>
      expect(repository.getGmProjection().view.activeRoll?.status).toBe("awaiting_allocation"),
    );
    expect(repository.getGmProjection().view.activeRoll?.pushDice).toBe(1);
  });

  it("announces pending opposition via a polite live region", async () => {
    const repository = new InMemoryRoomRepository();
    await repository.beginAction(newCommandId(), THREAT_ID, "strong-arm-the-enforcer", []);
    renderGmScreen(repository);

    const liveRegion = screen.getByRole("status");
    expect(liveRegion).toHaveAttribute("aria-live", "polite");
    expect(liveRegion).toHaveTextContent(/waiting on your opposition roll/i);
  });

  it("has no detectable accessibility violations at phone width", async () => {
    const repository = new InMemoryRoomRepository();
    await repository.beginAction(newCommandId(), THREAT_ID, "strong-arm-the-enforcer", []);
    const { container } = renderGmScreen(repository);
    expect(await axe(container)).toHaveNoViolations();
  });

  it("has no detectable accessibility violations at desktop width", async () => {
    window.innerWidth = DESKTOP_WIDTH;
    window.innerHeight = 800;
    const repository = new InMemoryRoomRepository();
    await repository.beginAction(newCommandId(), THREAT_ID, "strong-arm-the-enforcer", []);
    const { container } = renderGmScreen(repository);
    expect(await axe(container)).toHaveNoViolations();
  });
});
