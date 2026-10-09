import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "jest-axe";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { OptionPicker } from "../../src/shared/OptionPicker.js";

const OPTIONS = [
  { value: "a", label: "Opening scene" },
  { value: "b", label: "A deliberately very long option title that must wrap inside the sheet" },
  { value: "c", label: "Third" },
];

function Harness({ initial = "a" }: { initial?: string }): JSX.Element {
  const [value, setValue] = useState(initial);
  return (
    <main>
      <h1>Page</h1>
      <OptionPicker id="p" label="Scene" value={value} options={OPTIONS} onChange={setValue} />
    </main>
  );
}

describe("OptionPicker", () => {
  it("shows the field name and current choice on the closed control", () => {
    render(<Harness />);
    const trigger = screen.getByRole("button", { name: "Scene Opening scene" });
    expect(trigger).toHaveAttribute("aria-haspopup", "dialog");
    expect(trigger.dataset.value).toBe("a");
  });

  it("opens a dialog titled with the field, repeating the current choice and marking it", () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: /^Scene/ }));
    const dialog = screen.getByRole("dialog", { name: "Scene" });
    expect(within(dialog).getByText(/Current:/).textContent).toContain("Opening scene");
    const current = within(dialog)
      .getAllByRole("button")
      .filter((b) => b.getAttribute("aria-current") === "true");
    expect(current).toHaveLength(1);
    expect(current[0]).toHaveTextContent("Opening scene");
  });

  it("commits the choice, closes, and returns focus to the control", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const trigger = screen.getByRole("button", { name: /^Scene/ });
    await user.click(trigger);
    await user.click(screen.getByRole("button", { name: "Third" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(trigger.dataset.value).toBe("c");
    expect(trigger).toHaveFocus();
  });

  it("Escape and Cancel close without changing the value", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const trigger = screen.getByRole("button", { name: /^Scene/ });
    await user.click(trigger);
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    await user.click(trigger);
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(trigger.dataset.value).toBe("a");
  });

  it("falls back to the placeholder when the value matches no option", () => {
    render(<Harness initial="" />);
    expect(screen.getByRole("button", { name: /^Scene/ })).toHaveTextContent("Choose one");
  });

  it("offers a clearing entry first when emptyLabel is given, and choosing it reports the empty value", async () => {
    const user = userEvent.setup();
    const seen: string[] = [];
    render(
      <OptionPicker
        id="e"
        label="Target"
        value="a"
        options={OPTIONS}
        emptyLabel="Choose one…"
        onChange={(v) => seen.push(v)}
      />,
    );
    await user.click(screen.getByRole("button", { name: /^Target/ }));
    const rows = within(screen.getByRole("dialog")).getAllByRole("button");
    expect(rows[0]).toHaveTextContent("Choose one…");
    await user.click(rows[0]!);
    expect(seen).toEqual([""]);
  });

  it("makes the page behind the open list inert", async () => {
    const user = userEvent.setup();
    const { container } = render(<Harness />);
    await user.click(screen.getByRole("button", { name: /^Scene/ }));
    expect(container).toHaveAttribute("inert");
  });

  it("has no axe violations closed or open", async () => {
    const user = userEvent.setup();
    const { container } = render(<Harness />);
    expect(await axe(container)).toHaveNoViolations();
    await user.click(screen.getByRole("button", { name: /^Scene/ }));
    expect(await axe(document.body)).toHaveNoViolations();
  });
});
