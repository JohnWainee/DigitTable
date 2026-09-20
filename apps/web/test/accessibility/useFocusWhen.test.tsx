import { render, screen } from "@testing-library/react";
import { StrictMode, useRef } from "react";
import { describe, expect, it } from "vitest";
import { useFocusWhen } from "../../src/accessibility/useFocusWhen.js";

function Target({ when }: { readonly when: boolean }): JSX.Element {
  const ref = useRef<HTMLHeadingElement>(null);
  useFocusWhen(ref, when);
  return (
    <>
      <button type="button">elsewhere</button>
      <h2 tabIndex={-1} ref={ref}>
        target
      </h2>
    </>
  );
}

describe("useFocusWhen", () => {
  it("focuses the target when the condition turns true, under StrictMode's doubled effects", () => {
    const { rerender } = render(
      <StrictMode>
        <Target when={false} />
      </StrictMode>,
    );
    expect(document.body).toHaveFocus();
    rerender(
      <StrictMode>
        <Target when />
      </StrictMode>,
    );
    expect(screen.getByRole("heading", { name: "target" })).toHaveFocus();
  });

  it("does not take focus when it mounts with the condition already true", () => {
    render(
      <StrictMode>
        <Target when />
      </StrictMode>,
    );
    expect(document.body).toHaveFocus();
  });

  it("does not pull focus back on a re-render while the condition stays true", () => {
    const { rerender } = render(<Target when={false} />);
    rerender(<Target when />);
    screen.getByRole("button", { name: "elsewhere" }).focus();
    rerender(<Target when />);
    expect(screen.getByRole("button", { name: "elsewhere" })).toHaveFocus();
  });

  it("focuses again on a later false-to-true change", () => {
    const { rerender } = render(<Target when />);
    rerender(<Target when={false} />);
    rerender(<Target when />);
    expect(screen.getByRole("heading", { name: "target" })).toHaveFocus();
  });
});
