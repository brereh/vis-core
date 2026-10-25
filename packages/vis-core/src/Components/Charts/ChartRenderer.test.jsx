import React from "react";
import { render, screen } from "@testing-library/react";
import { ChartRenderer, ChartTooltip, wrapLabel, COMPACT_CHART_HEIGHT } from "./ChartRenderer";

beforeAll(() => {
  global.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

describe("ChartRenderer", () => {
  it("renders a line chart with axis title and unit on separate lines", () => {
    const charts = [
      {
        type: "line",
        title: "Income Over Time",
        x_axis_title: "Year",
        y_axis_title: "Income Per Household (Difference)",
        units: "£/week",
      },
    ];

    const data = [
      { year: 2026, value: 500 },
      { year: 2030, value: 650 },
    ];

    render(<ChartRenderer charts={charts} data={data} />);

    expect(screen.getByText("Income Over Time")).toBeInTheDocument();
    expect(screen.getByText("Income Per Household (Difference)")).toBeInTheDocument();
    expect(screen.getByText("/ £/week")).toBeInTheDocument();
    expect(screen.getByText("Year")).toBeInTheDocument();
  });

  describe("compact (docked layout)", () => {
    const data = [
      { year: 2026, value: 500 },
      { year: 2030, value: 650 },
    ];
    const chartHeights = (container) =>
      Array.from(container.querySelectorAll("div[style]"))
        .map((el) => el.style.height)
        .filter(Boolean);

    it("keeps the default chart height when not compact", () => {
      const { container } = render(
        <ChartRenderer charts={[{ type: "line", title: "Flow", y_axis_title: "Count", units: "veh" }]} data={data} />
      );
      expect(chartHeights(container)).toContain("220px");
    });

    it("uses the compact height and at least 11px axis text", () => {
      const { container } = render(
        <ChartRenderer
          compact
          charts={[{ type: "line", title: "Flow", y_axis_title: "Count", units: "veh" }]}
          data={data}
        />
      );
      expect(chartHeights(container)).toContain(`${COMPACT_CHART_HEIGHT}px`);
      expect(chartHeights(container)).not.toContain("220px");
      expect(window.getComputedStyle(screen.getByText("/ veh")).fontSize).toBe("11px");
    });

    it("respects a chart's own height", () => {
      const { container } = render(
        <ChartRenderer compact charts={[{ type: "line", title: "Flow", height: 260 }]} data={data} />
      );
      expect(chartHeights(container)).toContain("260px");
    });
  });

  it("does not duplicate unit if already in the axis title", () => {
    const charts = [
      {
        type: "line",
        title: "Percentage Change Over Time",
        x_axis_title: "Year",
        y_axis_title: "Income Per Household (% Difference)",
        units: "%",
      },
    ];

    const data = [
      { year: 2026, value: 5 },
      { year: 2030, value: 10 },
    ];

    render(<ChartRenderer charts={charts} data={data} />);

    expect(screen.getByText("Income Per Household (% Difference)")).toBeInTheDocument();
    expect(screen.queryByText("/ %")).not.toBeInTheDocument();
  });

  it("renders vertical bar chart with dynamic height and axis unit", () => {
    const charts = [
      {
        type: "bar_vertical",
        title: "Sectors Breakdown",
        x_axis_title: "Floorspace",
        y_axis_title: "Sector Type",
        units: "sqm",
        columns: [
          { key: "Retail", label: "Retail" },
          { key: "Office", label: "Office" },
        ],
      },
    ];

    const data = {
      Retail: 12000,
      Office: 25000,
    };

    render(<ChartRenderer charts={charts} data={data} />);

    expect(screen.getByText("Sectors Breakdown")).toBeInTheDocument();
    expect(screen.getByText("Floorspace")).toBeInTheDocument();
    expect(screen.getByText("/ sqm")).toBeInTheDocument();
  });

  it("renders ranking chart with value header including unit", () => {
    const charts = [
      {
        type: "ranking",
        title: "Top 5 Zones",
        units: "gen mins",
        columns: [
          { key: "Manchester City Centre", label: "Manchester City Centre" },
          { key: "Leeds South", label: "Leeds South" },
        ],
        ranks: {
          "Manchester City Centre": 1,
          "Leeds South": 2,
        },
        ids: {
          "Manchester City Centre": 101,
          "Leeds South": 102,
        },
      },
    ];

    const data = {
      "Manchester City Centre": 14.5,
      "Leeds South": 18.2,
    };

    render(<ChartRenderer charts={charts} data={data} />);

    expect(screen.getByText("Value (gen mins)")).toBeInTheDocument();
    expect(screen.getByText("Manchester City Centre")).toBeInTheDocument();
    expect(screen.getByText("Leeds South")).toBeInTheDocument();
  });

  it("renders a line chart with comparator scenario name and unit on the right axis", () => {
    const charts = [
      {
        type: "line",
        title: "Income Comparison",
        x_axis_title: "Year",
        y_axis_title: "Income Per Household (% Difference)",
        units: "%",
        comparatorLabel: "Scenario OE",
        comparatorUnits: "£/week",
        comparatorKey: "dmValue",
      },
    ];

    const data = [
      { year: 2026, value: 5.2, dmValue: 520 },
      { year: 2030, value: 12.1, dmValue: 580 },
    ];

    render(<ChartRenderer charts={charts} data={data} />);

    expect(screen.getByText("Income Comparison")).toBeInTheDocument();
    expect(screen.getByText("Income Per Household (% Difference)")).toBeInTheDocument();
    expect(screen.getByText("Scenario OE")).toBeInTheDocument();
    expect(screen.getByText("/ £/week")).toBeInTheDocument();
  });

  it("formats comparator series in ChartTooltip with data unit instead of % during %difference mode", () => {
    const config = {
      units: "%",
      comparatorUnits: "£/week",
      comparatorLabel: "Do Minimum",
      comparatorKey: "dmValue",
    };

    const payload = [
      {
        name: "% Difference (left)",
        dataKey: "value",
        value: 4.5,
        color: "#277a8c",
      },
      {
        name: "Do Minimum (right)",
        dataKey: "dmValue",
        value: 540,
        color: "#ff8800",
      },
    ];

    render(
      <ChartTooltip
        active={true}
        payload={payload}
        label="2030"
        config={config}
      />
    );

    expect(screen.getByText("2030")).toBeInTheDocument();
    expect(screen.getByText("% Difference (left)")).toBeInTheDocument();
    expect(screen.getByText("4.5%")).toBeInTheDocument();

    expect(screen.getByText("Do Minimum (right)")).toBeInTheDocument();
    // Must be formatted with data unit £/week, NOT %!
    expect(screen.getByText("£540/week")).toBeInTheDocument();
  });

  it("renders ChartTooltip without infinite re-render loop when bounding box extends past viewport", () => {
    const config = {
      units: "£/week",
    };

    const payload = [
      {
        name: "Value",
        dataKey: "value",
        value: 650,
        color: "#277a8c",
      },
    ];

    // Mock getBoundingClientRect to trigger clamping
    const originalGetBoundingClientRect = Element.prototype.getBoundingClientRect;
    Element.prototype.getBoundingClientRect = () => ({
      left: 1000,
      right: 1500, // extends past window.innerWidth
      top: 50,
      bottom: 200,
      width: 500,
      height: 150,
    });

    const { rerender } = render(
      <ChartTooltip
        active={true}
        payload={payload}
        label="2035"
        config={config}
      />
    );

    // Re-rendering multiple times should be fast and NEVER throw "Maximum update depth exceeded"
    rerender(
      <ChartTooltip
        active={true}
        payload={payload}
        label="2035"
        config={config}
      />
    );

    expect(screen.getByText("£650/week")).toBeInTheDocument();

    Element.prototype.getBoundingClientRect = originalGetBoundingClientRect;
  });

  it("wraps long labels at 26 characters into natural lines without premature wrapping", () => {
    expect(wrapLabel("Office Floorspace")).toBe("Office Floorspace");
    expect(wrapLabel("Access to employment")).toBe("Access to employment");

    const wrapped = wrapLabel("Destination accessibility by car");
    expect(wrapped).toBe("Destination accessibility\nby car");
    expect(wrapped.split("\n").length).toBe(2);
  });

  it("renders ChartTooltip into a portal attached to document.body", () => {
    const config = { units: "sqm" };
    const payload = [{ name: "Retail", dataKey: "Retail", value: 1200, color: "#333" }];

    const { unmount } = render(
      <div id="test-card-container" style={{ overflow: "hidden" }}>
        <ChartTooltip active={true} payload={payload} label="Floorspace" config={config} />
      </div>
    );

    const tooltipText = screen.getByText("1,200 sqm");
    expect(tooltipText).toBeInTheDocument();

    const tooltipContainer = tooltipText.closest("div[style*='position: fixed']");
    expect(tooltipContainer).not.toBeNull();
    expect(document.body.contains(tooltipContainer)).toBe(true);
    expect(document.getElementById("test-card-container").contains(tooltipContainer)).toBe(false);

    unmount();
    expect(screen.queryByText("1,200 sqm")).not.toBeInTheDocument();
  });

  it("dynamically updates tooltip transform position based on coordinate", () => {
    const config = { units: "sqm" };
    const payload = [{ name: "Retail", dataKey: "Retail", value: 1200, color: "#333" }];

    const { rerender, unmount } = render(
      <div className="recharts-wrapper">
        <ChartTooltip
          active={true}
          payload={payload}
          label="Floorspace"
          config={config}
          coordinate={{ x: 100, y: 50 }}
        />
      </div>
    );

    const tooltipEl = screen.getByText("1,200 sqm").closest("div[style*='position: fixed']");
    expect(tooltipEl).not.toBeNull();

    // Re-render with new coordinates as cursor moves
    rerender(
      <div className="recharts-wrapper">
        <ChartTooltip
          active={true}
          payload={payload}
          label="Floorspace"
          config={config}
          coordinate={{ x: 250, y: 80 }}
        />
      </div>
    );

    expect(tooltipEl.style.transform).toContain("px");

    unmount();
  });

  it("renders a multiple_line chart with sector series and legend", () => {
    const charts = [
      {
        type: "multiple_line",
        title: "Floorspace Over Time",
        x_axis_title: "Year",
        y_axis_title: "Floorspace",
        units: "sqm",
        columns: [
          { key: "Retail", label: "Retail" },
          { key: "Office", label: "Office" },
        ],
      },
    ];

    const data = [
      { label: "2023", Retail: 15000, Office: 25000 },
      { label: "2028", Retail: 16000, Office: 28000 },
    ];

    render(<ChartRenderer charts={charts} data={data} />);

    expect(screen.getByRole("region", { name: "Multiple Line chart" })).toBeInTheDocument();
    expect(screen.getByText("Floorspace Over Time")).toBeInTheDocument();
    expect(screen.getByText("Floorspace")).toBeInTheDocument();
    expect(screen.getByText("/ sqm")).toBeInTheDocument();
    expect(screen.getByText("Year")).toBeInTheDocument();
  });

  it("renders multiple_line chart when all values are zero (e.g. difference mode zero change)", () => {
    const charts = [
      {
        type: "multiple_line",
        title: "Floorspace Difference Over Time",
        x_axis_title: "Year",
        y_axis_title: "Floorspace (Difference)",
        units: "sqm",
        columns: [
          { key: "Retail", label: "Retail" },
          { key: "Office", label: "Office" },
        ],
      },
    ];

    const data = [
      { label: "2023", Retail: 0, Office: 0 },
      { label: "2028", Retail: 0, Office: 0 },
    ];

    render(<ChartRenderer charts={charts} data={data} />);

    expect(screen.getByRole("region", { name: "Multiple Line chart" })).toBeInTheDocument();
    expect(screen.getByText("Floorspace Difference Over Time")).toBeInTheDocument();
    expect(screen.getByText("Floorspace (Difference)")).toBeInTheDocument();
    expect(screen.getByText("/ sqm")).toBeInTheDocument();
  });

  it("returns null when multiple_line data only has label keys and no metric series", () => {
    const charts = [
      {
        type: "multiple_line",
        title: "Floorspace Over Time",
        columns: [],
      },
    ];

    const data = [
      { label: "2023" },
      { label: "2028" },
    ];

    const { container } = render(<ChartRenderer charts={charts} data={data} />);
    expect(container.firstChild).toBeNull();
  });
});

