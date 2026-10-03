import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CommandAlert } from "../../src/shared/CommandAlert.js";

/**
 * The long screens (GM console, character claim, player dashboard) render a rejected command's message
 * near the top of the page while the control that was pressed sits far below it, so the message has to
 * come to the person. jsdom cannot lay anything out, so whether it lands on screen is proved in a real
 * browser by `scripts/playtest/ui-audit.mjs` ("command feedback"); this suite proves the behaviour: when
 * it scrolls, how, and that it never steals focus.
 */
describe("CommandAlert", () => {
  // jsdom implements no scrollIntoView, so a spy is installed and removed (nothing to restore).
  const scrollIntoView = vi.fn();

  beforeEach(() => {
    scrollIntoView.mockReset();
    Object.defineProperty(Element.prototype, "scrollIntoView", {
      configurable: true,
      writable: true,
      value: scrollIntoView,
    });
  });

  afterEach(() => {
    Reflect.deleteProperty(Element.prototype, "scrollIntoView");
  });

  it("renders nothing, and scrolls nothing, while there is no message", () => {
    const { container } = render(<CommandAlert error={null} failure={null} />);
    expect(container).toBeEmptyDOMElement();
    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it("announces a rejected command and scrolls it into view only as far as needed, instantly", () => {
    render(<CommandAlert error="Resolve or void: roll-1" failure={null} />);

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Resolve or void: roll-1");
    expect(alert).toHaveClass("error-message");
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    expect(scrollIntoView.mock.contexts[0]).toBe(alert);
    // "nearest" leaves the page alone when the message is already on screen; no `behavior` means an
    // instant scroll, so there is no motion to suppress for visitors who ask for less.
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest", inline: "nearest" });
  });

  it("shows a failure the room session reports on its own account, without scrolling the page", () => {
    // A queued command replayed after reconnecting, or a lost connection: not something the person just did,
    // so it must not move the page (they may be typing lower down with the keyboard up).
    render(
      <CommandAlert error={null} failure={{ message: "Your seat is on another identity." }} />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("Your seat is on another identity.");
    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it("prefers the screen's own error over the session's failure", () => {
    render(<CommandAlert error="Own error" failure={{ message: "Session failure" }} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Own error");
  });

  it("scrolls again when the same rejection is repeated after the message was cleared", () => {
    const { rerender } = render(<CommandAlert error="Resolve or void: roll-1" failure={null} />);
    expect(scrollIntoView).toHaveBeenCalledTimes(1);

    // The next press clears the message first (the screens call setError(null) before sending)...
    rerender(<CommandAlert error={null} failure={null} />);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(scrollIntoView).toHaveBeenCalledTimes(1);

    // ...and an identical rejection must still come into view, not be mistaken for "no change".
    rerender(<CommandAlert error="Resolve or void: roll-1" failure={null} />);
    expect(scrollIntoView).toHaveBeenCalledTimes(2);
  });

  it("does not scroll when only the session's failure changes, however often", () => {
    const { rerender } = render(<CommandAlert error={null} failure={{ message: "Offline" }} />);
    rerender(<CommandAlert error={null} failure={{ message: "Offline" }} />);
    rerender(<CommandAlert error={null} failure={{ message: "Reconnecting" }} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Reconnecting");
    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it("does not scroll again when a re-render changes nothing", () => {
    const { rerender } = render(<CommandAlert error="Resolve or void: roll-1" failure={null} />);
    rerender(<CommandAlert error="Resolve or void: roll-1" failure={null} />);
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
  });

  it("does not scroll again when a new failure object arrives while the same error is showing", () => {
    const { rerender } = render(
      <CommandAlert error="Resolve or void: roll-1" failure={{ message: "Offline" }} />,
    );
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    // The session reports another failure on its own account; the person's message has not changed.
    rerender(
      <CommandAlert error="Resolve or void: roll-1" failure={{ message: "Reconnecting" }} />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("Resolve or void: roll-1");
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
  });

  it("shows a message that arrives while a sheet is open, but leaves the page where it is", () => {
    // SheetDialog makes everything outside it inert. Its scroll lock does not stop a programmatic scroll, and
    // closing the sheet scrolls back to its trigger anyway, so scrolling here would only disturb the sheet.
    const inertPage = document.body.appendChild(document.createElement("div"));
    inertPage.setAttribute("inert", "");
    try {
      render(<CommandAlert error="Resolve or void: roll-1" failure={null} />, {
        container: inertPage,
      });
      expect(inertPage.querySelector('[role="alert"]')).toHaveTextContent(
        "Resolve or void: roll-1",
      );
      expect(scrollIntoView).not.toHaveBeenCalled();
    } finally {
      inertPage.remove();
    }
  });

  it("scrolls when the person's own error replaces a failure that was already showing", () => {
    const failure = { message: "Offline" };
    const { rerender } = render(<CommandAlert error={null} failure={failure} />);
    expect(scrollIntoView).not.toHaveBeenCalled();
    rerender(<CommandAlert error="Resolve or void: roll-1" failure={failure} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Resolve or void: roll-1");
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
  });

  it("never moves focus: the control that was pressed keeps it", () => {
    function Screen({ error }: { readonly error: string | null }): JSX.Element {
      return (
        <main>
          <CommandAlert error={error} failure={null} />
          <button type="button">End round</button>
        </main>
      );
    }
    const { rerender } = render(<Screen error={null} />);
    const button = screen.getByRole("button", { name: /end round/i });
    button.focus();

    rerender(<Screen error="Resolve or void: roll-1" />);
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(button).toHaveFocus();
  });

  it("still renders where scrollIntoView does not exist", () => {
    Reflect.deleteProperty(Element.prototype, "scrollIntoView");
    expect(() => render(<CommandAlert error="Nope" failure={null} />)).not.toThrow();
    expect(screen.getByRole("alert")).toHaveTextContent("Nope");
  });
});
