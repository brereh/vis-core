import { fireEvent, render, screen } from "@testing-library/react";
import { DateRangeSelector } from "./DateRangeSelector";

const baseFilter = {
  id: "survey-dates",
  filterName: "Survey dates",
  type: "dateRange",
  paramName: ["date_from", "date_to"],
  min: "2025-10-06",
  max: "2025-10-19",
  defaultValue: ["min", "max"],
  locale: "en-GB",
};

const toggleFilter = {
  ...baseFilter,
  extraToggle: { paramName: "include_excluded", label: "Include excluded days", defaultValue: false },
};

const renderSelector = (props = {}) => {
  const onChange = jest.fn();
  const utils = render(
    <DateRangeSelector filter={baseFilter} value={undefined} onChange={onChange} {...props} />
  );
  return { onChange, ...utils };
};

describe("DateRangeSelector", () => {
  it("renders two labelled date inputs with the default range and bounds", () => {
    renderSelector({ value: ["2025-10-06", "2025-10-19"] });

    const from = screen.getByLabelText("From");
    const to = screen.getByLabelText("To");
    expect(from).toHaveAttribute("type", "date");
    expect(from).toHaveValue("2025-10-06");
    expect(to).toHaveValue("2025-10-19");
    expect(from).toHaveAttribute("min", "2025-10-06");
    expect(to).toHaveAttribute("max", "2025-10-19");
    expect(screen.getByRole("group", { name: "Survey dates" })).toHaveAttribute("lang", "en-GB");
  });

  it("shows the available range in the configured locale", () => {
    renderSelector();
    expect(screen.getByText("Available 06/10/2025 to 19/10/2025")).toBeInTheDocument();
  });

  it("sends both ISO dates when either input changes", () => {
    const { onChange } = renderSelector({ value: ["2025-10-06", "2025-10-19"] });

    fireEvent.change(screen.getByLabelText("From"), { target: { value: "2025-10-08" } });
    expect(onChange).toHaveBeenLastCalledWith(baseFilter, ["2025-10-08", "2025-10-19"]);

    fireEvent.change(screen.getByLabelText("To"), { target: { value: "2025-10-12" } });
    expect(onChange).toHaveBeenLastCalledWith(baseFilter, ["2025-10-08", "2025-10-12"]);
  });

  it("blocks a range where from is after to and shows an error", () => {
    const { onChange } = renderSelector({ value: ["2025-10-06", "2025-10-10"] });
    const from = screen.getByLabelText("From");

    fireEvent.change(from, { target: { value: "2025-10-15" } });

    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(
      '"From" date (15/10/2025) must be on or before "To" date (10/10/2025).'
    );
    expect(from).toHaveAttribute("aria-invalid", "true");

    fireEvent.change(screen.getByLabelText("To"), { target: { value: "2025-10-16" } });
    expect(onChange).toHaveBeenLastCalledWith(baseFilter, ["2025-10-15", "2025-10-16"]);
    expect(screen.getByRole("alert")).toBeEmptyDOMElement();
    expect(from).toHaveAttribute("aria-invalid", "false");
  });

  it("blocks an empty date", () => {
    const { onChange } = renderSelector({ value: ["2025-10-06", "2025-10-10"] });
    fireEvent.change(screen.getByLabelText("To"), { target: { value: "" } });
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent('Enter a valid "To" date.');
  });

  it("clamps dates outside min and max", () => {
    const { onChange } = renderSelector({ value: ["2025-10-06", "2025-10-10"] });
    fireEvent.change(screen.getByLabelText("From"), { target: { value: "2025-09-01" } });
    expect(onChange).toHaveBeenLastCalledWith(baseFilter, ["2025-10-06", "2025-10-10"]);

    fireEvent.change(screen.getByLabelText("To"), { target: { value: "2026-01-01" } });
    expect(onChange).toHaveBeenLastCalledWith(baseFilter, ["2025-10-06", "2025-10-19"]);
    expect(screen.getByLabelText("To")).toHaveValue("2025-10-19");
  });

  it("follows value changes from outside, such as a persisted restore", () => {
    const { rerender } = renderSelector({ value: ["2025-10-06", "2025-10-19"] });
    rerender(<DateRangeSelector filter={baseFilter} value={["2025-10-08", "2025-10-09"]} onChange={jest.fn()} />);
    expect(screen.getByLabelText("From")).toHaveValue("2025-10-08");
    expect(screen.getByLabelText("To")).toHaveValue("2025-10-09");
  });

  it("sets the extra toggle parameter", () => {
    const { onChange } = renderSelector({
      filter: toggleFilter,
      value: ["2025-10-06", "2025-10-19", false],
    });
    const checkbox = screen.getByRole("checkbox", { name: "Include excluded days" });
    expect(checkbox).not.toBeChecked();

    fireEvent.click(checkbox);
    expect(onChange).toHaveBeenLastCalledWith(toggleFilter, ["2025-10-06", "2025-10-19", true]);
  });

  it("keeps the toggle value when dates change", () => {
    const { onChange } = renderSelector({
      filter: toggleFilter,
      value: ["2025-10-06", "2025-10-19", true],
    });
    expect(screen.getByRole("checkbox")).toBeChecked();
    fireEvent.change(screen.getByLabelText("From"), { target: { value: "2025-10-07" } });
    expect(onChange).toHaveBeenLastCalledWith(toggleFilter, ["2025-10-07", "2025-10-19", true]);
  });

  it("uses custom input labels", () => {
    renderSelector({ filter: { ...baseFilter, labels: { from: "Start", to: "End" } } });
    expect(screen.getByLabelText("Start")).toBeInTheDocument();
    expect(screen.getByLabelText("End")).toBeInTheDocument();
  });

  it("disables every control", () => {
    const { onChange } = renderSelector({ filter: toggleFilter, disabled: true });
    expect(screen.getByLabelText("From")).toBeDisabled();
    expect(screen.getByLabelText("To")).toBeDisabled();
    expect(screen.getByRole("checkbox")).toBeDisabled();
    fireEvent.change(screen.getByLabelText("From"), { target: { value: "2025-10-07" } });
    expect(onChange).not.toHaveBeenCalled();
  });
});
