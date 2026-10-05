import { act, fireEvent, render, screen } from "@testing-library/react";
import { StrictMode, useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SheetDialog } from "../../src/shared/SheetDialog.js";

/**
 * Browser Back (the Android system Back button, an iOS edge swipe) must dismiss an open sheet instead
 * of leaving the screen. Measured in real Chrome before the fix: with the GM correction sheet open and a
 * reason typed, Back went from `#/room/<id>/gm` to `#/create`, losing the sheet, the text and the
 * director console at once. jsdom implements `pushState`/`back()`/`popstate`, so the behaviour is
 * provable here; `scripts/playtest/sheet-history-probe.mjs` proves it in a real browser.
 */

const ROUTE = "#/room/r1/gm";

function Sheet({
  onClose,
  label = "Sheet",
}: {
  readonly onClose?: () => void;
  readonly label?: string;
}): JSX.Element {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button type="button" onClick={() => setOpen(true)}>
        Open {label}
      </button>
      {open && (
        <SheetDialog
          titleId={`${label}-title`}
          title={label}
          onClose={() => {
            onClose?.();
            setOpen(false);
          }}
          footer={
            <button type="button" onClick={() => setOpen(false)}>
              Cancel {label}
            </button>
          }
        >
          <p>body</p>
        </SheetDialog>
      )}
    </div>
  );
}

/** Lets jsdom's asynchronous history traversal and the hook's deferred release run. */
const settle = (): Promise<void> =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 40));
  });

describe("browser Back with a sheet open", () => {
  const hashChanges = vi.fn();

  beforeEach(() => {
    window.history.replaceState(null, "", `/${ROUTE}`);
    hashChanges.mockReset();
    window.addEventListener("hashchange", hashChanges);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    window.removeEventListener("hashchange", hashChanges);
    await settle(); // let any release from the previous test finish before the next one starts
    document.documentElement.classList.remove("sheet-open");
  });

  function open(label = "Sheet"): void {
    act(() => screen.getByRole("button", { name: `Open ${label}` }).click());
  }

  it("holds exactly one same-URL history entry while open, and the router sees no route change", async () => {
    const push = vi.spyOn(window.history, "pushState");
    render(<Sheet />);
    open();
    await settle();

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(push).toHaveBeenCalledTimes(1);
    expect(push.mock.calls[0]?.[2]).toBeUndefined(); // same URL: no hash change
    expect(window.location.hash).toBe(ROUTE);
    expect(window.history.state).not.toBeNull();
    expect(hashChanges).not.toHaveBeenCalled();
  });

  it("closes the sheet (and runs onClose once) on Back, staying on the same route", async () => {
    const onClose = vi.fn();
    render(<Sheet onClose={onClose} />);
    open();
    await settle();

    act(() => window.history.back());
    await settle();

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(window.location.hash).toBe(ROUTE); // the page was NOT navigated away
    expect(window.history.state).toBeNull(); // our marker entry is gone
    expect(hashChanges).not.toHaveBeenCalled();
  });

  it("drops its entry when closed any other way, so a later Back is not swallowed", async () => {
    const back = vi.spyOn(window.history, "back");
    const onClose = vi.fn();
    render(<Sheet onClose={onClose} />);
    open();
    await settle();

    act(() => screen.getByRole("button", { name: "Cancel Sheet" }).click());
    await settle();

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(back).toHaveBeenCalledTimes(1); // released exactly once
    expect(window.history.state).toBeNull();
    expect(onClose).not.toHaveBeenCalled(); // the pop it caused must not re-close anything
    back.mockRestore();
  });

  it("releases its entry after Escape too, running onClose exactly once", async () => {
    const back = vi.spyOn(window.history, "back");
    const onClose = vi.fn();
    render(<Sheet onClose={onClose} />);
    open();
    await settle();

    act(() => {
      fireEvent.keyDown(document, { key: "Escape" });
    });
    await settle();

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(onClose).toHaveBeenCalledTimes(1); // Escape's own close; the release's pop must not add another
    expect(back).toHaveBeenCalledTimes(1);
    expect(window.history.state).toBeNull();
    back.mockRestore();
  });

  it("does not mistake a marker left by a previous page life (reload) for its own entry", async () => {
    // A reload with a sheet open keeps the marker in `history.state`; ids restart on every page life.
    window.history.replaceState({ digitableSheet: "sheet-1" }, "", `/${ROUTE}`);
    const push = vi.spyOn(window.history, "pushState");
    const onClose = vi.fn();
    render(<Sheet onClose={onClose} />);
    open();
    await settle();

    expect(push).toHaveBeenCalledTimes(1); // a fresh entry, not "already there"
    act(() => window.history.back());
    await settle();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(window.location.hash).toBe(ROUTE);
  });

  it("stays open under React StrictMode's mount/unmount/mount, with a single entry", async () => {
    const push = vi.spyOn(window.history, "pushState");
    render(
      <StrictMode>
        <Sheet />
      </StrictMode>,
    );
    open();
    await settle();

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(push).toHaveBeenCalledTimes(1);
    expect(window.history.state).not.toBeNull();
  });

  it("leaves history alone when something else already replaced the entry", async () => {
    const back = vi.spyOn(window.history, "back");
    render(<Sheet />);
    open();
    await settle();

    // What `replaceRoute` does for an automatic redirect while the sheet is open.
    window.history.replaceState(null, "", "#/join");
    act(() => screen.getByRole("button", { name: "Cancel Sheet" }).click());
    await settle();

    expect(back).not.toHaveBeenCalled();
    expect(window.location.hash).toBe("#/join");
    back.mockRestore();
  });

  it("with two sheets stacked, Back closes only the top one", async () => {
    const closed: string[] = [];
    function Two(): JSX.Element {
      const [a, setA] = useState(true);
      const [b, setB] = useState(true);
      return (
        <div>
          {a && (
            <SheetDialog
              titleId="a-title"
              title="First"
              onClose={() => {
                closed.push("first");
                setA(false);
              }}
              footer={null}
            >
              <p>a</p>
            </SheetDialog>
          )}
          {b && (
            <SheetDialog
              titleId="b-title"
              title="Second"
              onClose={() => {
                closed.push("second");
                setB(false);
              }}
              footer={null}
            >
              <p>b</p>
            </SheetDialog>
          )}
        </div>
      );
    }
    render(<Two />);
    await settle();

    act(() => window.history.back());
    await settle();

    expect(closed).toEqual(["second"]);
    expect(screen.getByRole("dialog", { name: "First" })).toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "Second" })).not.toBeInTheDocument();
  });
});
