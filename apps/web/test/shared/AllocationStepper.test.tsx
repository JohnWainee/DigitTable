import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "jest-axe";
import { describe, expect, it, vi } from "vitest";
import { AllocationStepper } from "../../src/shared/AllocationStepper.js";

const option = { id: "damage-threat", label: "Wound the Enforcer", costPerUse: 1, maxUses: 3 };

describe("AllocationStepper", () => {
  it("has no accessibility violations", async () => {
    const { container } = render(
      <AllocationStepper option={option} value={0} budgetIfZero={3} onChange={() => {}} />,
    );
    expect(await axe(container)).toHaveNoViolations();
  });

  it("increments and decrements via tap, for players who prefer pointer/touch", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<AllocationStepper option={option} value={1} budgetIfZero={3} onChange={onChange} />);

    await user.click(screen.getByRole("button", { name: /increase/i }));
    expect(onChange).toHaveBeenLastCalledWith(2);

    await user.click(screen.getByRole("button", { name: /decrease/i }));
    expect(onChange).toHaveBeenLastCalledWith(0);
  });

  it("supports full keyboard operation without any pointer input", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<AllocationStepper option={option} value={1} budgetIfZero={3} onChange={onChange} />);

    screen.getByRole("spinbutton").focus();
    await user.keyboard("{ArrowUp}");
    expect(onChange).toHaveBeenLastCalledWith(2);

    await user.keyboard("{ArrowDown}");
    expect(onChange).toHaveBeenLastCalledWith(0);

    await user.keyboard("{ArrowRight}");
    expect(onChange).toHaveBeenLastCalledWith(2);

    await user.keyboard("{ArrowLeft}");
    expect(onChange).toHaveBeenLastCalledWith(0);

    await user.keyboard("{End}");
    expect(onChange).toHaveBeenLastCalledWith(3);

    await user.keyboard("{Home}");
    expect(onChange).toHaveBeenLastCalledWith(0);
  });

  it("exposes its current value and bounds via ARIA, for assistive technology", () => {
    render(<AllocationStepper option={option} value={2} budgetIfZero={5} onChange={() => {}} />);
    const spinbutton = screen.getByRole("spinbutton");
    expect(spinbutton).toHaveAttribute("aria-valuenow", "2");
    expect(spinbutton).toHaveAttribute("aria-valuemin", "0");
    expect(spinbutton).toHaveAttribute("aria-valuemax", String(option.maxUses));
  });

  it("disables decrease at zero and increase at the effective max (maxUses vs. remaining budget)", () => {
    render(<AllocationStepper option={option} value={0} budgetIfZero={3} onChange={() => {}} />);
    expect(screen.getByRole("button", { name: /decrease/i })).toBeDisabled();

    // budgetIfZero=2 means the true ceiling here is 2, below option.maxUses (3).
    render(<AllocationStepper option={option} value={2} budgetIfZero={2} onChange={() => {}} />);
    expect(screen.getAllByRole("button", { name: /increase/i })[1]).toBeDisabled();
  });
});
