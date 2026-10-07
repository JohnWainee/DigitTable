import type { JSX } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { SelectField } from "../../src/shared/SelectField.js";

const LONG = "The Abandoned Métro Platform, beneath the Gare des Ombres";
const OPTIONS = [
  { value: "", label: "Choose one…" },
  { value: "a", label: LONG },
  { value: "b", label: "Short" },
];

function Harness({ initial = "a" }: { initial?: string }): JSX.Element {
  const [value, setValue] = useState(initial);
  return (
    <SelectField
      id="pick"
      label="Scene"
      value={value}
      onChange={(e) => setValue(e.target.value)}
      options={OPTIONS}
    />
  );
}

describe("SelectField", () => {
  it("is a labelled native select (the OS owns the option popup)", () => {
    render(<Harness />);
    const select = screen.getByLabelText("Scene");
    expect(select.tagName).toBe("SELECT");
    expect(screen.getAllByRole("option")).toHaveLength(3);
  });

  it("echoes the full selected label, associated through aria-describedby", () => {
    render(<Harness />);
    const select = screen.getByLabelText("Scene");
    const echo = document.getElementById(select.getAttribute("aria-describedby") ?? "");
    expect(echo).not.toBeNull();
    expect(echo?.textContent).toContain(LONG);
    expect(echo).toBeVisible();
  });

  it("updates the echo on change and hides it for the empty placeholder", async () => {
    render(<Harness />);
    const select = screen.getByLabelText("Scene");
    const echo = document.getElementById("pick-selected")!;
    await userEvent.selectOptions(select, "b");
    expect(echo.textContent).toContain("Short");
    expect(echo.textContent).not.toContain("Abandoned");
    await userEvent.selectOptions(select, "");
    expect(echo).not.toBeVisible();
  });

  it("hides the echo when the value matches no option", () => {
    render(<Harness initial="zzz" />);
    expect(document.getElementById("pick-selected")).not.toBeVisible();
  });
});
