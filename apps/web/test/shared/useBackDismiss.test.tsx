import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StrictMode, useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { SheetDialog } from "../../src/shared/SheetDialog.js";

/**
 * Android Back / Safari Back with a pop-out open must dismiss the pop-out, not navigate the hash
 * router away (which destroyed the sheet and the reason typed into it). jsdom implements
 * history.pushState/back and fires popstate asynchronously, which is all this needs.
 */

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

const tick = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 20));

async function backAndSettle(): Promise<void> {
  await act(async () => {
    window.history.back();
    await tick();
  });
}

afterEach(() => {
  window.location.hash = "";
});

describe("useBackDismiss", () => {
  it("closes the sheet on Back and stays on the same route", async () => {
    window.location.hash = "#/room/abc/gm";
    const lengthBefore = window.history.length;
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole("button", { name: "Open sheet" }));
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(window.history.length).toBe(lengthBefore + 1);

    await backAndSettle();

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(window.location.hash).toBe("#/room/abc/gm");
  });

  it("leaves the history as it found it when closed by Cancel", async () => {
    window.location.hash = "#/room/abc/gm";
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole("button", { name: "Open sheet" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await act(async () => {
      await tick();
    });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(window.location.hash).toBe("#/room/abc/gm");
    // The entry we pushed was popped again: one more Back leaves this route's predecessor, i.e. the
    // current entry is no longer a sheet entry.
    expect(
      (window.history.state as Record<string, unknown> | null)?.digitableSheet,
    ).toBeUndefined();
  });

  it("survives React StrictMode's mount/unmount/mount probe with exactly one entry", async () => {
    window.location.hash = "#/room/abc/gm";
    const lengthBefore = window.history.length;
    const user = userEvent.setup();
    render(
      <StrictMode>
        <Harness />
      </StrictMode>,
    );
    await user.click(screen.getByRole("button", { name: "Open sheet" }));
    await act(async () => {
      await tick();
    });
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(window.history.length).toBe(lengthBefore + 1);
    await backAndSettle();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(window.location.hash).toBe("#/room/abc/gm");
  });
});
