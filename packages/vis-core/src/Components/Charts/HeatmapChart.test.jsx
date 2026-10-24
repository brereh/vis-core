import React from "react";
import { act, render, screen, within, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "jest-axe";
import { HeatmapChart, buildHeatmapModel, formatColumnLabel, getHeatmapColours } from "./HeatmapChart";
import { ChartRenderer } from "./ChartRenderer";
import { FilterContext } from "contexts/FilterContext";
import { MapContext } from "contexts/MapContext";
import { mergeThemeWithBrandDefaults } from "defaults";

const config = {
  type: "heatmap",
  title: "Every hour of the survey",
  rowKey: "date",
  rowLabel: "date_label",
  columnKey: "hour",
  columnLabels: { every: 3, format: "HH:00" },
  valueKey: "value",
  missingKey: "is_missing",
  rowMarkers: [
    { key: "is_excluded", tone: "warning", symbol: "✕", strike: true },
    { key: "is_flagged", tone: "accent", symbol: "!" },
  ],
  colourScheme: "sequential",
  legend: { minLabel: "Fewer", maxLabel: "More vehicles per hour" },
  onRowSelect: "day",
};

// Three days: a normal day (24 hours), a 23-hour clock-change day with two
// missing hours and an exclusion, and a flagged 25-hour day.
const makeData = () => {
  const rows = [];
  for (let hour = 0; hour < 24; hour += 1) {
    rows.push({ date: "2025-10-06", date_label: "Mon 6 Oct", hour, value: hour * 10 });
  }
  for (let hour = 0; hour < 23; hour += 1) {
    rows.push({
      date: "2026-03-29",
      date_label: "Sun 29 Mar",
      hour,
      value: hour === 10 || hour === 11 ? null : hour * 5,
      is_missing: hour === 10 || hour === 11,
      is_excluded: true,
    });
  }
  for (let hour = 0; hour < 25; hour += 1) {
    rows.push({ date: "2025-10-26", date_label: "Sun 26 Oct", hour, value: 100, is_flagged: hour === 3 });
  }
  return rows;
};

const renderWithFilters = (ui, { state = {}, dispatch = jest.fn(), mapState, mapDispatch } = {}) =>
  render(
    <MapContext.Provider value={mapState ? { state: mapState, dispatch: mapDispatch } : undefined}>
      <FilterContext.Provider value={{ state, dispatch }}>{ui}</FilterContext.Provider>
    </MapContext.Provider>
  );

describe("HeatmapChart", () => {
  it("renders one cell per data row, including rows of different lengths", () => {
    render(<HeatmapChart config={config} data={makeData()} />);
    expect(screen.getAllByTestId("heatmap-cell")).toHaveLength(24 + 23 + 25);
    // 25 columns overall, labelled every third column
    expect(screen.getAllByTestId("heatmap-column-label").map((n) => n.textContent)).toEqual([
      "00:00", "03:00", "06:00", "09:00", "12:00", "15:00", "18:00", "21:00", "24:00",
    ]);
  });

  it("hatches missing cells", () => {
    const { container } = render(<HeatmapChart config={config} data={makeData()} />);
    const missing = container.querySelectorAll('[data-missing="true"]');
    expect(missing).toHaveLength(2);
    const patternId = container.querySelector("pattern").getAttribute("id");
    missing.forEach((cell) => expect(cell.getAttribute("fill")).toBe(`url(#${patternId})`));
    expect(screen.getByText("No data")).toBeInTheDocument();
  });

  it("renders row markers with symbols and strikes through excluded rows", () => {
    render(<HeatmapChart config={config} data={makeData()} />);
    const markers = screen.getAllByTestId("heatmap-marker").map((n) => n.textContent);
    expect(markers).toEqual(["✕", "!"]);
    expect(screen.getAllByTestId("heatmap-row-outline")).toHaveLength(2);
    const excluded = screen.getByRole("button", { name: /Sun 29 Mar \(Excluded\)/ });
    expect(excluded).toHaveStyle("text-decoration: line-through");
    expect(screen.getByRole("button", { name: /Sun 26 Oct \(Flagged\)/ })).toBeInTheDocument();
  });

  it("shows the value in a cell tooltip", () => {
    render(<HeatmapChart config={config} data={makeData()} />);
    fireEvent.mouseEnter(screen.getAllByTestId("heatmap-cell")[5]);
    expect(screen.getByRole("tooltip")).toHaveTextContent("Mon 6 Oct 05:00: 50");
  });

  it("selects a row with the keyboard and updates the named filter", async () => {
    const user = userEvent.setup();
    const dispatch = jest.fn();
    const mapDispatch = jest.fn();
    const filter = { id: "day", actions: [{ action: "UPDATE_QUERY_PARAMS", payload: { foo: 1 } }] };
    renderWithFilters(<HeatmapChart config={config} data={makeData()} />, {
      dispatch,
      mapState: { filters: [filter] },
      mapDispatch,
    });

    const first = screen.getByRole("button", { name: /Mon 6 Oct/ });
    const second = screen.getByRole("button", { name: /Sun 29 Mar/ });
    expect(first).toHaveAttribute("tabindex", "0");
    expect(second).toHaveAttribute("tabindex", "-1");

    act(() => first.focus());
    await user.keyboard("{ArrowDown}");
    expect(second).toHaveFocus();
    await user.keyboard("{Enter}");

    expect(dispatch).toHaveBeenCalledWith({
      type: "SET_FILTER_VALUE",
      payload: { filterId: "day", value: "2026-03-29", filter },
    });
    expect(mapDispatch).toHaveBeenCalledWith({
      type: "UPDATE_QUERY_PARAMS",
      payload: { filter, value: "2026-03-29", foo: 1 },
    });
  });

  it("highlights the row the filter has selected", () => {
    renderWithFilters(<HeatmapChart config={config} data={makeData()} />, {
      state: { day: "2025-10-26" },
    });
    expect(screen.getByRole("button", { name: /Sun 26 Oct/ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: /Mon 6 Oct/ })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getAllByTestId("heatmap-selected-row")).toHaveLength(1);
  });

  it("selects a row by clicking a cell and calls a function handler", async () => {
    const onRowSelect = jest.fn();
    render(<HeatmapChart config={{ ...config, onRowSelect }} data={makeData()} />);
    fireEvent.click(screen.getAllByTestId("heatmap-cell")[30]);
    expect(onRowSelect).toHaveBeenCalledWith("2026-03-29", expect.objectContaining({ label: "Sun 29 Mar" }));
    expect(screen.getByRole("button", { name: /Sun 29 Mar/ })).toHaveAttribute("aria-pressed", "true");
  });

  it("renders plain row labels when rows are not selectable", () => {
    const { onRowSelect, ...rest } = config;
    render(<HeatmapChart config={rest} data={makeData()} />);
    expect(screen.queryByRole("button", { name: /Mon 6 Oct/ })).not.toBeInTheDocument();
    expect(screen.getByText("Mon 6 Oct")).toBeInTheDocument();
  });

  it("offers a table alternative that matches the data", async () => {
    const user = userEvent.setup();
    const data = makeData();
    render(<HeatmapChart config={config} data={data} />);
    const toggle = screen.getByRole("button", { name: "Show as table" });
    expect(toggle).toHaveAttribute("aria-pressed", "false");
    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-pressed", "true");

    const table = screen.getByRole("table");
    const headers = within(table).getAllByRole("columnheader").map((h) => h.textContent);
    expect(headers[0]).toBe("Date label");
    expect(headers.slice(1, 26)).toEqual(
      Array.from({ length: 25 }, (_, h) => `${String(h).padStart(2, "0")}:00`)
    );
    expect(headers[26]).toBe("Notes");

    const bodyRows = within(table).getAllByRole("row").slice(1);
    expect(bodyRows).toHaveLength(3);
    bodyRows.forEach((tr, ri) => {
      const label = within(tr).getByRole("rowheader").textContent;
      const cells = within(tr).getAllByRole("cell").map((c) => c.textContent);
      const records = data.filter((d) => d.date_label === label);
      expect(records.length).toBeGreaterThan(0);
      records.forEach((d) => {
        expect(cells[d.hour]).toBe(d.is_missing ? "No data" : String(d.value));
      });
      // Hours a row does not have are left blank
      for (let h = records.length; h < 25; h += 1) expect(cells[h]).toBe("");
      expect(ri).toBeLessThan(3);
    });
    expect(within(bodyRows[1]).getAllByRole("cell")[25]).toHaveTextContent("Excluded");
    expect(within(bodyRows[2]).getAllByRole("cell")[25]).toHaveTextContent("Flagged");
  });

  it("has no detectable accessibility violations in chart and table views", async () => {
    const user = userEvent.setup();
    const { container } = renderWithFilters(<HeatmapChart config={config} data={makeData()} />, {
      state: { day: "2025-10-06" },
    });
    expect(await axe(container)).toHaveNoViolations();
    await user.click(screen.getByRole("button", { name: "Show as table" }));
    expect(await axe(container)).toHaveNoViolations();
  });

  it("is available through ChartRenderer", () => {
    render(<ChartRenderer charts={[config]} data={makeData()} />);
    expect(screen.getByText("Every hour of the survey")).toBeInTheDocument();
    expect(screen.getAllByTestId("heatmap-cell")).toHaveLength(72);
  });
});

describe("heatmap helpers", () => {
  it("formats column labels from a pattern or function", () => {
    expect(formatColumnLabel(7, "HH:00")).toBe("07:00");
    expect(formatColumnLabel(7, "H h")).toBe("7 h");
    expect(formatColumnLabel(7, (v) => `hour ${v}`)).toBe("hour 7");
    expect(formatColumnLabel("a")).toBe("a");
  });

  it("uses a labels key and sorts numeric columns", () => {
    const model = buildHeatmapModel(
      { rowKey: "r", columnKey: "c", columnLabels: { key: "c_label" } },
      [
        { r: 1, c: 2, c_label: "two", value: 5 },
        { r: 1, c: 1, c_label: "one", value: "x" },
      ]
    );
    expect(model.columns.map((c) => c.label)).toEqual(["one", "two"]);
    expect(model.rows[0].cells.get("1").missing).toBe(true);
    expect(model.min).toBe(5);
    expect(model.max).toBe(5);
  });

  it("resolves brewer schemes, colour arrays and the token default", () => {
    const theme = mergeThemeWithBrandDefaults();
    expect(getHeatmapColours("blues", 4, theme)).toHaveLength(4);
    expect(getHeatmapColours(["#ffffff", "#000000"], 2, theme)).toEqual(["#ffffff", "#000000"]);
    const fallback = getHeatmapColours("sequential", 3, theme);
    expect(fallback[0]).toBe(theme.colors.muted);
    expect(fallback[2]).toBe(theme.colors.primary);
  });
});
