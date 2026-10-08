import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SheetDialog } from "../../src/shared/SheetDialog.js";

/** Lets queued `setTimeout(0)` retirement and the async jsdom `history.back()` settle. */
async function settle(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 30));
  });
}

function Harness(): JSX.Element {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button type="button" onClick={() => setOpen(true)}>
        Open sheet
      </button>
      {open && (
        <SheetDialog
          titleId="t"
          title="Correct"
          onClose={() => setOpen(false)}
          footer={
            <button type="button" onClick={() => setOpen(false)}>
              Cancel
            </button>
          }
        >
          <p>body</p>
        </SheetDialog>
      )}
    </div>
  );
}

describe("browser Back while a pop-out is open", () => {
  beforeEach(() => {
    window.location.hash = "#/room/abc/gm";
  });
  afterEach(async () => {
    await settle();
  });

  it("closes the sheet and leaves the route (hash) untouched", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole("button", { name: /open sheet/i }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    act(() => window.history.back());
    await settle();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(window.location.hash).toBe("#/room/abc/gm");
  });

  it("retires its history entry on Cancel so one later Back still leaves the page normally", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole("button", { name: /open sheet/i }));
    expect(window.history.state).toHaveProperty("digitableSheetBackDismiss");
    await user.click(screen.getByRole("button", { name: /cancel/i }));
    await settle();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(window.history.state ?? {}).not.toHaveProperty("digitableSheetBackDismiss");
  });

  it("survives opening again immediately after closing (no stale Back closes the new sheet)", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole("button", { name: /open sheet/i }));
    await user.click(screen.getByRole("button", { name: /cancel/i }));
    await user.click(screen.getByRole("button", { name: /open sheet/i }));
    await settle();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    // And Back still dismisses it.
    act(() => window.history.back());
    await settle();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
