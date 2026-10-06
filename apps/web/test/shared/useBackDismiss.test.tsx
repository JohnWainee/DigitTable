import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SheetDialog } from "../../src/shared/SheetDialog.js";

/**
 * Back with a pop-out open must close the pop-out, not leave the screen (the app routes by URL hash,
 * so without a history entry of its own an open sheet was lost to Android Back / Safari Back along
 * with whatever had been typed into it). jsdom implements `history.pushState/back` and fires
 * `popstate`, so the real mechanism is exercised here, not a stub.
 */

function Harness({ onClosed }: { readonly onClosed?: () => void }): JSX.Element {
  const [open, setOpen] = useState(false);
  const close = (): void => {
    onClosed?.();
    setOpen(false);
  };
  return (
    <div>
      <button type="button" onClick={() => setOpen(true)}>
        Open sheet
      </button>
      {open && (
        <SheetDialog
          titleId="back-sheet-title"
          title="Correct Iryna"
          onClose={close}
          footer={
            <button type="button" onClick={close}>
              Cancel
            </button>
          }
        >
          <label htmlFor="why">Reason</label>
          <input id="why" type="text" />
        </SheetDialog>
      )}
    </div>
  );
}

function isSheetEntry(state: unknown): boolean {
  return (
    typeof state === "object" &&
    state !== null &&
    typeof (state as { digitableSheet?: unknown }).digitableSheet === "number"
  );
}

/** Lets the hook's deferred (setTimeout 0) cleanup run. */
async function tick(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
}

describe("useBackDismiss (through SheetDialog)", () => {
  beforeEach(() => {
    window.location.hash = "#/room/abc/gm";
  });

  afterEach(async () => {
    // Unmount now (not in RTL's own later hook) so the hook's deferred history clean-up runs inside
    // this test's tick instead of leaking into the next test.
    cleanup();
    await tick();
    vi.restoreAllMocks();
  });

  it("pushes exactly one same-URL history entry while a sheet is open", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const before = window.history.length;
    const urlBefore = window.location.href;

    await user.click(screen.getByRole("button", { name: /open sheet/i }));

    expect(window.history.length).toBe(before + 1);
    expect(isSheetEntry(window.history.state)).toBe(true);
    expect(window.location.href).toBe(urlBefore);
  });

  it("Back closes the sheet and leaves the route (and the page) where it was", async () => {
    const user = userEvent.setup();
    const onClosed = vi.fn();
    render(<Harness onClosed={onClosed} />);
    await user.click(screen.getByRole("button", { name: /open sheet/i }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    act(() => {
      window.history.back();
    });

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(onClosed).toHaveBeenCalledTimes(1);
    expect(window.location.hash).toBe("#/room/abc/gm");
    expect(screen.getByRole("button", { name: /open sheet/i })).toBeInTheDocument();
  });

  it("closing with Cancel removes the entry again, so no stray Back press is needed later", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole("button", { name: /open sheet/i }));
    expect(isSheetEntry(window.history.state)).toBe(true);

    await user.click(screen.getByRole("button", { name: /cancel/i }));
    await waitFor(() => expect(isSheetEntry(window.history.state)).toBe(false));
    expect(window.location.hash).toBe("#/room/abc/gm");
  });

  it("closing with Escape removes the entry too", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole("button", { name: /open sheet/i }));
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await waitFor(() => expect(isSheetEntry(window.history.state)).toBe(false));
  });

  it("does not pop anything when the visitor already navigated elsewhere", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole("button", { name: /open sheet/i }));
    const back = vi.spyOn(window.history, "back");

    // Something else pushed a new entry on top of ours, then the sheet closed.
    act(() => {
      window.history.pushState({ elsewhere: true }, "", "#/create");
    });
    await user.click(screen.getByRole("button", { name: /cancel/i }));
    await tick();

    expect(back).not.toHaveBeenCalled();
    expect(window.location.hash).toBe("#/create");
  });

  it("still pops its entry when history.state is a structured clone, as in every real browser", async () => {
    const descriptor = Object.getOwnPropertyDescriptor(History.prototype, "state")!;
    vi.spyOn(window.history, "state", "get").mockImplementation(() => {
      const real: unknown = descriptor.get!.call(window.history);
      return real === null || real === undefined ? real : structuredClone(real);
    });
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole("button", { name: /open sheet/i }));
    expect(isSheetEntry(window.history.state)).toBe(true);

    await user.click(screen.getByRole("button", { name: /cancel/i }));
    await waitFor(() => expect(isSheetEntry(window.history.state)).toBe(false));
  });

  it("reopening after a Back works and pushes a fresh entry", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole("button", { name: /open sheet/i }));
    act(() => {
      window.history.back();
    });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: /open sheet/i }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(isSheetEntry(window.history.state)).toBe(true);
  });
});
