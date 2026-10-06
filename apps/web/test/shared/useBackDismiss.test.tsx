import { act, render, screen, waitFor } from "@testing-library/react";
import { StrictMode, useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SheetDialog } from "../../src/shared/SheetDialog.js";

/**
 * Back must dismiss an open sheet, not navigate the hash router away from the screen. The sheet is
 * not a route, so `SheetDialog` holds one same-URL history entry while mounted (`useBackDismiss`).
 */

function Harness({ strict = false }: { readonly strict?: boolean }): JSX.Element {
  const [open, setOpen] = useState(false);
  const tree = (
    <div>
      <button type="button" onClick={() => setOpen(true)}>
        Open sheet
      </button>
      {open && (
        <SheetDialog
          titleId="back-sheet-title"
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
  return strict ? <StrictMode>{tree}</StrictMode> : tree;
}

async function tick(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
}

async function goBack(): Promise<void> {
  await act(async () => {
    window.history.back();
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
}

describe("useBackDismiss", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "#/room/r1/gm");
  });
  afterEach(() => {
    window.history.replaceState(null, "", "#/");
  });

  it("pushes a same-URL entry while open and Back closes the sheet without changing the route", async () => {
    const hashChanges: string[] = [];
    const onHash = (): void => void hashChanges.push(window.location.hash);
    window.addEventListener("hashchange", onHash);
    render(<Harness />);
    const before = window.history.length;
    act(() => screen.getByRole("button", { name: "Open sheet" }).click());
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(window.history.length).toBe(before + 1);
    expect(window.location.hash).toBe("#/room/r1/gm");

    await goBack();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(window.location.hash).toBe("#/room/r1/gm");
    expect(hashChanges).toEqual([]);
    window.removeEventListener("hashchange", onHash);
  });

  it("releases its entry when closed by Cancel, so a later Back does not hit a dead duplicate", async () => {
    const back = vi.spyOn(window.history, "back");
    render(<Harness />);
    act(() => screen.getByRole("button", { name: "Open sheet" }).click());
    expect(window.history.state).not.toBeNull();
    act(() => screen.getByRole("button", { name: "Cancel" }).click());
    await tick();
    expect(back).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(window.history.state).toBeNull());
    back.mockRestore();
  });

  it("stays open under StrictMode's mount/unmount/mount and still closes on Back", async () => {
    render(<Harness strict />);
    act(() => screen.getByRole("button", { name: "Open sheet" }).click());
    await tick();
    expect(screen.getByRole("dialog")).toBeTruthy();
    await goBack();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("leaves history alone when something else replaced its entry", async () => {
    const back = vi.spyOn(window.history, "back");
    render(<Harness />);
    act(() => screen.getByRole("button", { name: "Open sheet" }).click());
    window.history.replaceState(null, "", "#/room/r1/player");
    act(() => screen.getByRole("button", { name: "Cancel" }).click());
    await tick();
    expect(back).not.toHaveBeenCalled();
    expect(window.location.hash).toBe("#/room/r1/player");
    back.mockRestore();
  });
});
