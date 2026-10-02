import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ActionFeedback } from "../../src/shared/ActionFeedback.js";

describe("ActionFeedback", () => {
  it("keeps pending and rejected command feedback in one labelled region", () => {
    render(<ActionFeedback pending error="The round still has open rolls." />);

    const feedback = screen.getByRole("region", { name: /action feedback/i });
    expect(feedback).toHaveClass("action-feedback");
    expect(within(feedback).getByRole("status")).toHaveTextContent(/awaiting confirmation/i);
    expect(within(feedback).getByRole("alert")).toHaveTextContent(/open rolls/i);
  });

  it("does not announce an error while a command is only pending", () => {
    render(<ActionFeedback pending error={null} />);

    const feedback = screen.getByRole("region", { name: /action feedback/i });
    expect(within(feedback).getByRole("status")).toHaveTextContent(/awaiting confirmation/i);
    expect(within(feedback).queryByRole("alert")).not.toBeInTheDocument();
  });

  it("does not announce pending progress after a command has already rejected", () => {
    render(<ActionFeedback pending={false} error="The action is no longer valid." />);

    const feedback = screen.getByRole("region", { name: /action feedback/i });
    expect(within(feedback).getByRole("alert")).toHaveTextContent(/no longer valid/i);
    expect(within(feedback).queryByRole("status")).not.toBeInTheDocument();
  });
});
