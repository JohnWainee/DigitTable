import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StrictMode, useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SheetDialog } from "../../src/shared/SheetDialog.js";

/**
 * Browser/Android Back with a pop-out open must dismiss the pop-out, not leave the screen behind it
 * (the app routes by `location.hash`, so an unguarded Back navigates away and discards the sheet and
 * whatever was typed into it). jsdom implements `pushState`/`history.go`/`popstate`, so the whole
 * mechanism is exercised here; the same scenario in real Chrome is `sheet-back-*` in
 * `scripts/playtest/ui-audit.mjs`.
 */

function Harness({ onClose = () => {} }: { readonly onClose?: () => void }): JSX.Element {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button type="button" onClick={() => setOpen(true)}>
        Open sheet
      </button>
      {open && (
        <SheetDialog
          titleId="back-sheet-title"
          title="Correct Iryna"
          onClose={() => {
            onClose();
            setOpen(false);
          }}
          footer={
            <button type="button" onClick={() => setOpen(false)}>
              Cancel
            </button>
          }
        >
          <p>Body</p>
        </SheetDialog>
      )}
    </div>
  );
}

/** `history.length` is capped and forward entries are dropped, so track the entry by its state. */
function entryIsSheet(): boolean {
  const state: unknown = window.history.state;
  return typeof state === "object" && state !== null && "digitableSheetEntry" in state;
}

async function settleHistory(): Promise<void> {
  // The cleanup pops its entry in a microtask and jsdom delivers `popstate` on a timer.
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
}

describe("useBackDismiss (through SheetDialog)", () => {
  beforeEach(() => {
    window.location.hash = "#/room/ABC/gm";
  });
  afterEach(() => {
    window.history.replaceState(null, "", "#/");
  });

  it("adds exactly one same-URL history entry while open and none before or after", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    expect(entryIsSheet()).toBe(false);
    await user.click(screen.getByRole("button", { name: "Open sheet" }));
    expect(entryIsSheet()).toBe(true);
    expect(window.location.hash).toBe("#/room/ABC/gm");
  });

  it("closes the sheet on Back and stays on the same route", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    const hashChanges = vi.fn();
    // Let the beforeEach hash assignment's own (asynchronous) hashchange pass before listening.
    await settleHistory();
    window.addEventListener("hashchange", hashChanges);
    render(<Harness onClose={onClose} />);
    await user.click(screen.getByRole("button", { name: "Open sheet" }));
    expect(screen.getByRole("dialog")).toBeTruthy();

    act(() => {
      window.history.back();
    });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await settleHistory();
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(window.location.hash).toBe("#/room/ABC/gm");
    expect(hashChanges).not.toHaveBeenCalled();
    window.removeEventListener("hashchange", hashChanges);
  });

  it("pops its own entry when closed by Cancel, so the next Back leaves nothing stale", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole("button", { name: "Open sheet" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await settleHistory();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(entryIsSheet()).toBe(false);
  });

  it("pops its own entry when closed by Escape", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole("button", { name: "Open sheet" }));
    await user.keyboard("{Escape}");
    await settleHistory();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(entryIsSheet()).toBe(false);
  });

  it("does not stack entries across open/close cycles (a Back press after reopening still closes it)", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    for (let cycle = 0; cycle < 3; cycle += 1) {
      await user.click(screen.getByRole("button", { name: "Open sheet" }));
      await user.click(screen.getByRole("button", { name: "Cancel" }));
      await settleHistory();
    }
    await user.click(screen.getByRole("button", { name: "Open sheet" }));
    act(() => {
      window.history.back();
    });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await settleHistory();
    expect(entryIsSheet()).toBe(false);
    expect(window.location.hash).toBe("#/room/ABC/gm");
  });

  it("survives React StrictMode's mount/unmount/remount without losing or doubling the entry", async () => {
    const user = userEvent.setup();
    render(
      <StrictMode>
        <Harness />
      </StrictMode>,
    );
    await user.click(screen.getByRole("button", { name: "Open sheet" }));
    await settleHistory();
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(entryIsSheet()).toBe(true);
    act(() => {
      window.history.back();
    });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await settleHistory();
    expect(entryIsSheet()).toBe(false);
  });

  it("does not walk the history back after a route change pushed a foreign entry above it", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole("button", { name: "Open sheet" }));
    // The page navigates elsewhere while the sheet is still mounted, then the sheet unmounts.
    act(() => {
      window.history.pushState(null, "", "#/room/ABC/table");
    });
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await settleHistory();
    expect(window.location.hash).toBe("#/room/ABC/table");
  });
});
