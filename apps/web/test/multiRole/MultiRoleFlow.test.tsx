import { act, render, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { asCommandId, type CommandId } from "@digitable/contracts";
import { describe, expect, it } from "vitest";
import { GmScreen } from "../../src/gm/GmScreen.js";
import { PlayerScreen } from "../../src/player/PlayerScreen.js";
import { InMemoryRoomRepository } from "../../src/repository/InMemoryRoomRepository.js";
import { TableScreen } from "../../src/table/TableScreen.js";

function newCommandId(): CommandId {
  return asCommandId(globalThis.crypto.randomUUID());
}

/**
 * Drives one full opposed action across all three surfaces mounted
 * concurrently against one shared in-memory room (docs/PHASE_1C_PLAN.md,
 * "Multi-role local simulation"), asserting each surface's rendered DOM
 * only ever shows what its own projection contains at each step.
 */
describe("multi-role opposed action (player, GM, table on one shared room)", () => {
  it("resolves BeginAction -> SubmitOpposition -> AllocateResults across three concurrently-rendered surfaces", async () => {
    window.innerWidth = 1280;
    window.innerHeight = 800;
    const user = userEvent.setup();
    const repository = new InMemoryRoomRepository();

    const player = render(<PlayerScreen repository={repository} />);
    const gm = render(<GmScreen repository={repository} />);
    const table = render(<TableScreen repository={repository} />);

    // Before any action, only the GM sees the threat's hidden intel.
    expect(within(gm.container).getByText(/hidden wrist relay/i)).toBeInTheDocument();
    expect(within(player.container).queryByText(/hidden wrist relay/i)).not.toBeInTheDocument();
    expect(within(table.container).queryByText(/hidden wrist relay/i)).not.toBeInTheDocument();

    // Step 1: the player begins the action.
    const beginButton = within(player.container).getByRole("button", {
      name: /strong-arm the enforcer/i,
    });
    beginButton.focus();
    await user.keyboard("{Enter}");

    expect(
      within(player.container).getByRole("heading", { name: /your roll/i }),
    ).toBeInTheDocument();
    // Every surface reflects the same engine-produced status.
    expect(
      within(gm.container).getByRole("button", { name: /submit opposition/i }),
    ).toBeInTheDocument();
    const tableRollSection = within(table.container).getByRole("region", { name: /current roll/i });
    expect(within(tableRollSection).getByText(/waiting on the opposition/i)).toBeInTheDocument();
    // The player's own DOM never renders the GM-only un-redacted difficulty modifier.
    expect(
      within(player.container).queryByText(/hidden difficulty modifier/i),
    ).not.toBeInTheDocument();
    expect(
      within(gm.container).getByText(/hidden difficulty modifier applied/i),
    ).toBeInTheDocument();

    // Step 2: the GM submits the opposition roll.
    const pushDiceInput = within(gm.container).getByRole("spinbutton");
    pushDiceInput.focus();
    await user.keyboard("{ArrowUp}");
    const submitOppositionButton = within(gm.container).getByRole("button", {
      name: /submit opposition/i,
    });
    submitOppositionButton.focus();
    await user.keyboard("{Enter}");

    expect(
      await within(player.container).findByRole("button", { name: /confirm allocation/i }),
    ).toBeInTheDocument();
    expect(
      within(within(table.container).getByRole("region", { name: /current roll/i })).getByText(
        /opposition rolled\. awaiting allocation/i,
      ),
    ).toBeInTheDocument();
    expect(
      within(within(gm.container).getByRole("region", { name: /active roll/i })).getByText(
        /awaiting the player's allocation/i,
      ),
    ).toBeInTheDocument();

    // Step 3: the player allocates their net successes, resolving the action.
    const spinbuttons = within(player.container).queryAllByRole("spinbutton");
    if (spinbuttons.length > 0) {
      const first = spinbuttons[0]!;
      first.focus();
      await user.keyboard("{ArrowUp}");
    }
    const confirmButton = within(player.container).getByRole("button", {
      name: /confirm allocation/i,
    });
    confirmButton.focus();
    await user.keyboard("{Enter}");

    expect(
      await within(player.container).findByRole("heading", { name: /resolved/i }),
    ).toBeInTheDocument();
    expect(within(gm.container).getByText(/no active roll/i)).toBeInTheDocument();
    expect(
      within(table.container).queryByRole("heading", { name: /current roll/i }),
    ).not.toBeInTheDocument();
  });

  it("a table-attributed command is rejected even while a player has an unresolved roll", async () => {
    const repository = new InMemoryRoomRepository();
    await repository.beginAction(newCommandId(), "enforcer", "strong-arm-the-enforcer", []);
    const rollId = repository.getPlayerProjection().view.activeRoll?.rollId;
    if (!rollId) throw new Error("expected an active roll");

    const result = await repository.attemptCommandAsTable(newCommandId(), {
      type: "SubmitOpposition",
      rollId,
      pushDice: 0,
    });

    expect(result.status).toBe("rejected");
    if (result.status !== "rejected") throw new Error("expected rejection");
    expect(result.code).toBe("ROLE_FORBIDDEN");
    expect(repository.getPlayerProjection().view.activeRoll?.status).toBe("awaiting_opposition");
  });

  it("a table/GM surface mounted mid-flow reflects the current state, not a stale initial one", async () => {
    const repository = new InMemoryRoomRepository();
    await repository.beginAction(newCommandId(), "enforcer", "strong-arm-the-enforcer", []);
    const rollId = repository.getPlayerProjection().view.activeRoll?.rollId;
    if (!rollId) throw new Error("expected an active roll");
    await act(async () => {
      await repository.submitOpposition(newCommandId(), rollId, 0);
    });

    const gm = render(<GmScreen repository={repository} />);
    const table = render(<TableScreen repository={repository} />);

    expect(
      within(within(gm.container).getByRole("region", { name: /active roll/i })).getByText(
        /awaiting the player's allocation/i,
      ),
    ).toBeInTheDocument();
    expect(
      within(within(table.container).getByRole("region", { name: /current roll/i })).getByText(
        /opposition rolled\. awaiting allocation/i,
      ),
    ).toBeInTheDocument();
  });
});
