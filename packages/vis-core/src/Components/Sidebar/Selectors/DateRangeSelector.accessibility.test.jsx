import { fireEvent, render, screen } from "@testing-library/react";
import { axe } from "jest-axe";
import { DateRangeSelector } from "./DateRangeSelector";

const filter = {
  id: "survey-dates",
  filterName: "Survey dates",
  type: "dateRange",
  paramName: ["date_from", "date_to"],
  min: "2025-10-06",
  max: "2025-10-19",
  locale: "en-GB",
  extraToggle: { paramName: "include_excluded", label: "Include excluded days", defaultValue: false },
};

describe("DateRangeSelector accessibility", () => {
  it("labels its controls and has no automated accessibility violations", async () => {
    const { container } = render(
      <DateRangeSelector filter={filter} value={["2025-10-06", "2025-10-19", false]} onChange={jest.fn()} />
    );

    expect(screen.getByRole("group", { name: "Survey dates" })).toBeInTheDocument();
    expect(screen.getByLabelText("From")).toHaveAccessibleDescription("Available 06/10/2025 to 19/10/2025");
    expect(screen.getByRole("checkbox", { name: "Include excluded days" })).toBeInTheDocument();

    expect(await axe(container)).toHaveNoViolations();
  });

  it("announces an invalid range and links it to the inputs", async () => {
    const { container } = render(
      <DateRangeSelector filter={filter} value={["2025-10-06", "2025-10-10", false]} onChange={jest.fn()} />
    );

    fireEvent.change(screen.getByLabelText("From"), { target: { value: "2025-10-12" } });

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent('"From" date (12/10/2025) must be on or before "To" date (10/10/2025).');
    expect(screen.getByLabelText("From")).toHaveAccessibleDescription(
      expect.stringContaining("must be on or before")
    );
    expect(screen.getByLabelText("To")).toHaveAttribute("aria-invalid", "true");

    expect(await axe(container)).toHaveNoViolations();
  });

  it("announces an out-of-range date when the input loses focus", async () => {
    const { container } = render(
      <DateRangeSelector filter={filter} value={["2025-10-06", "2025-10-10", false]} onChange={jest.fn()} />
    );
    const to = screen.getByLabelText("To");
    fireEvent.change(to, { target: { value: "2025-11-30" } });
    fireEvent.blur(to);

    expect(screen.getByRole("alert")).toHaveTextContent("Choose a date between 06/10/2025 and 19/10/2025.");
    expect(to).toHaveAccessibleDescription(expect.stringContaining("Choose a date between"));
    expect(await axe(container)).toHaveNoViolations();
  });
});
