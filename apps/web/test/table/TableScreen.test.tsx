import { render, screen, within } from "@testing-library/react";
import { axe } from "jest-axe";
import { THREAT_ID } from "@digitable/template-eat-the-reich";
import { beforeEach, describe, expect, it } from "vitest";
import { TableScreen } from "../../src/table/TableScreen.js";
import { InMemoryRoomRepository } from "../../src/repository/InMemoryRoomRepository.js";

const PHONE_WIDTH = 375;
const DESKTOP_WIDTH = 1280;

describe("TableScreen", () => {
  beforeEach(() => {
    window.innerWidth = PHONE_WIDTH;
    window.innerHeight = 667;
  });

  it("renders public location, objective, character, and threat summaries only", () => {
    const repository = new InMemoryRoomRepository();
    const { container } = render(<TableScreen repository={repository} />);

    expect(screen.getByText("Abandoned Métro Platform")).toBeInTheDocument();
    expect(screen.getByText("Rook — 0/3 wounds")).toBeInTheDocument();
    expect(container.textContent).toMatch(/The Enforcer/);
  });

  it("never renders the threat's hidden difficulty modifier or hidden intel", () => {
    const repository = new InMemoryRoomRepository();
    repository.beginAction(THREAT_ID, "strong-arm-the-enforcer", []);
    const { container } = render(<TableScreen repository={repository} />);

    expect(container.textContent).not.toMatch(/hidden difficulty modifier/i);
    expect(container.textContent).not.toMatch(/hidden wrist relay/i);
  });

  it("renders no interactive controls (no buttons or inputs)", () => {
    const repository = new InMemoryRoomRepository();
    repository.beginAction(THREAT_ID, "strong-arm-the-enforcer", []);
    render(<TableScreen repository={repository} />);

    expect(screen.queryAllByRole("button")).toHaveLength(0);
    expect(screen.queryAllByRole("spinbutton")).toHaveLength(0);
    expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
    expect(screen.queryAllByRole("textbox")).toHaveLength(0);
  });

  it("never renders Pause, Fade/Veil, or Skip safety controls", () => {
    const repository = new InMemoryRoomRepository();
    render(<TableScreen repository={repository} />);
    expect(screen.queryByText(/pause/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/fade/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/veil/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/skip/i)).not.toBeInTheDocument();
  });

  it("reflects the current roll status via a polite live region announced once", () => {
    const repository = new InMemoryRoomRepository();
    repository.beginAction(THREAT_ID, "strong-arm-the-enforcer", []);
    render(<TableScreen repository={repository} />);

    const liveRegion = screen.getByRole("status");
    expect(liveRegion).toHaveAttribute("aria-live", "polite");
    expect(liveRegion).toHaveTextContent(/waiting on the opposition/i);
  });

  it("reflects state committed before mount, not a stale snapshot", () => {
    const repository = new InMemoryRoomRepository();
    repository.beginAction(THREAT_ID, "strong-arm-the-enforcer", []);
    const rollId = repository.getPlayerProjection().view.activeRoll?.rollId;
    if (!rollId) throw new Error("expected an active roll");
    repository.submitOpposition(rollId, 0);

    // Mounted only after both BeginAction and SubmitOpposition have already been accepted.
    render(<TableScreen repository={repository} />);

    const rollSection = screen.getByRole("region", { name: /current roll/i });
    expect(
      within(rollSection).getByText(/opposition rolled\. awaiting allocation/i),
    ).toBeInTheDocument();
  });

  it("has no detectable accessibility violations at phone width", async () => {
    const repository = new InMemoryRoomRepository();
    repository.beginAction(THREAT_ID, "strong-arm-the-enforcer", []);
    const { container } = render(<TableScreen repository={repository} />);
    expect(await axe(container)).toHaveNoViolations();
  });

  it("has no detectable accessibility violations at desktop width", async () => {
    window.innerWidth = DESKTOP_WIDTH;
    window.innerHeight = 800;
    const repository = new InMemoryRoomRepository();
    repository.beginAction(THREAT_ID, "strong-arm-the-enforcer", []);
    const { container } = render(<TableScreen repository={repository} />);
    expect(await axe(container)).toHaveNoViolations();
  });
});
