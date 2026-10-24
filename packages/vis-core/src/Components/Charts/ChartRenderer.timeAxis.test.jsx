import React from "react";
import { render, screen, within } from "@testing-library/react";
import { ChartRenderer } from "./ChartRenderer";

// jsdom has no layout, so give the chart a fixed size to render its SVG.
jest.mock("recharts", () => {
  const actual = jest.requireActual("recharts");
  const { cloneElement } = jest.requireActual("react");
  return {
    ...actual,
    ResponsiveContainer: ({ children }) =>
      cloneElement(children, { width: 800, height: 300 }),
  };
});

beforeAll(() => {
  global.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

/** A 24-hour profile at 15-minute intervals with 10:00–14:00 missing. */
const buildProfile = () => {
  const rows = [];
  for (let i = 0; i < 96; i++) {
    const h = Math.floor(i / 4);
    const m = (i % 4) * 15;
    const label = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
    const missing = h >= 10 && h < 14;
    rows.push({
      label,
      westbound: missing ? null : 100 + i,
      eastbound: missing ? null : 90 + i,
    });
  }
  return rows;
};

const profileConfig = (overrides = {}) => ({
  type: "multiple_line",
  title: "15-minute profile",
  y_axis_title: "Vehicles",
  columns: [
    { key: "westbound", label: "Westbound", colour: "primary" },
    { key: "eastbound", label: "Eastbound", colour: "accent" },
  ],
  xAxis: { type: "time", format: "HH:mm", tickInterval: "3h", domain: ["00:00", "24:00"] },
  connectNulls: false,
  bands: [
    { from: "08:00", to: "09:00", label: "AM peak", tone: "accent" },
    { from: "17:00", to: "18:00", label: "PM peak", tone: "accent" },
  ],
  gaps: [{ from: "10:00", to: "14:00", label: "Counter fault" }],
  ...overrides,
});

const linePaths = (container) =>
  Array.from(container.querySelectorAll("path.recharts-line-curve"));

const moveCount = (path) => (path.getAttribute("d").match(/M/g) || []).length;

describe("ChartRenderer line time axis, gaps and bands", () => {
  it("breaks multiple_line series at null values when connectNulls is false", () => {
    const { container } = render(
      <ChartRenderer charts={[profileConfig()]} data={buildProfile()} />
    );
    const paths = linePaths(container);
    expect(paths).toHaveLength(2);
    paths.forEach((p) => expect(moveCount(p)).toBe(2));
  });

  it("keeps the existing joined line for multiple_line by default", () => {
    const { container } = render(
      <ChartRenderer
        charts={[profileConfig({ connectNulls: undefined, gaps: [], bands: [] })]}
        data={buildProfile()}
      />
    );
    linePaths(container).forEach((p) => expect(moveCount(p)).toBe(1));
  });

  it("breaks a single line chart at nulls and keeps nulls from object data", () => {
    const { container } = render(
      <ChartRenderer
        charts={[
          {
            type: "line",
            title: "Profile",
            xKey: "time",
            xAxis: { type: "time", tickInterval: "1h" },
            connectNulls: false,
          },
        ]}
        data={[
          { time: "00:00", value: 1 },
          { time: "00:15", value: 2 },
          { time: "00:30", value: null },
          { time: "00:45", value: 4 },
          { time: "01:00", value: 5 },
        ]}
      />
    );
    const [path] = linePaths(container);
    expect(moveCount(path)).toBe(2);
  });

  it("places time ticks at the requested interval", () => {
    const { container } = render(
      <ChartRenderer charts={[profileConfig()]} data={buildProfile()} />
    );
    const ticks = Array.from(
      container.querySelectorAll(".recharts-xAxis .recharts-cartesian-axis-tick-value")
    ).map((t) => t.textContent);
    expect(ticks).toEqual([
      "00:00", "03:00", "06:00", "09:00", "12:00", "15:00", "18:00", "21:00", "24:00",
    ]);
  });

  it("spaces points by time, not by index", () => {
    const { container } = render(
      <ChartRenderer
        charts={[
          {
            type: "multiple_line",
            title: "Uneven",
            columns: [{ key: "v", label: "V" }],
            xAxis: { type: "time", tickInterval: "1h" },
          },
        ]}
        data={[
          { label: "00:00", v: 1 },
          { label: "01:00", v: 2 },
          { label: "04:00", v: 3 },
        ]}
      />
    );
    // Each segment of the path ends at a data point: take its last x,y pair.
    const xs = linePaths(container)[0]
      .getAttribute("d")
      .split(/[MLC]/)
      .filter((seg) => seg.trim())
      .map((seg) => {
        const nums = seg.match(/-?[\d.]+(?:e-?\d+)?/g).map(Number);
        return nums[nums.length - 2];
      });
    // Gap 01:00→04:00 is three times the gap 00:00→01:00.
    expect((xs[2] - xs[1]) / (xs[1] - xs[0])).toBeCloseTo(3, 1);
  });

  it("parses ISO datetimes on a time axis", () => {
    render(
      <ChartRenderer
        charts={[
          {
            type: "multiple_line",
            title: "Datetimes",
            columns: [{ key: "v", label: "V" }],
            xAxis: { type: "time", format: "HH:mm", tickInterval: "6h" },
          },
        ]}
        data={[
          { label: "2025-10-06T00:00:00", v: 1 },
          { label: "2025-10-06T12:00:00", v: 2 },
          { label: "2025-10-07T00:00:00", v: 3 },
        ]}
      />
    );
    expect(screen.getByText("06:00")).toBeInTheDocument();
    expect(screen.getByText("18:00")).toBeInTheDocument();
  });

  it("renders labelled bands and gaps, with a hatched gap fill", () => {
    const { container } = render(
      <ChartRenderer charts={[profileConfig()]} data={buildProfile()} />
    );
    const bands = container.querySelectorAll(".vc-line-band");
    const gaps = container.querySelectorAll(".vc-line-gap");
    expect(bands).toHaveLength(2);
    expect(gaps).toHaveLength(1);

    const svg = container.querySelector("svg.recharts-surface");
    expect(within(svg).getByText("AM peak")).toBeInTheDocument();
    expect(within(svg).getByText("PM peak")).toBeInTheDocument();
    expect(within(svg).getByText("Counter fault")).toBeInTheDocument();

    const gapRect = gaps[0].querySelector("path, rect");
    expect(gapRect.getAttribute("fill")).toMatch(/^url\(#.+-hatch\)$/);
    expect(container.querySelector("pattern")).not.toBeNull();
  });

  it("describes bands and gaps in a visually hidden list and names the chart from its title", () => {
    render(<ChartRenderer charts={[profileConfig()]} data={buildProfile()} />);
    const region = screen.getByRole("region", { name: "15-minute profile" });
    const list = within(region).getByRole("list", { name: "Highlighted ranges" });
    const items = within(list).getAllByRole("listitem").map((li) => li.textContent);
    expect(items).toEqual([
      "Shaded band: AM peak, 08:00 to 09:00",
      "Shaded band: PM peak, 17:00 to 18:00",
      "Missing data: Counter fault, 10:00 to 14:00",
    ]);
    expect(region).toHaveAttribute("aria-describedby", list.parentElement.id);
  });

  it("accepts series as an alias of columns with token colours", () => {
    const { container } = render(
      <ChartRenderer
        charts={[
          {
            type: "multiple_line",
            title: "Series alias",
            series: [{ key: "v", label: "V", colour: "warning" }],
          },
        ]}
        data={[
          { label: "a", v: 1 },
          { label: "b", v: 2 },
        ]}
      />
    );
    expect(linePaths(container)[0]).toHaveAttribute("stroke", "#b45309");
  });

  it("supports bands on a category axis without a time axis", () => {
    const { container } = render(
      <ChartRenderer
        charts={[
          {
            type: "line",
            title: "Yearly",
            bands: [{ from: "2028", to: "2030", label: "Scheme", tone: "muted" }],
          },
        ]}
        data={[
          { year: 2026, value: 1 },
          { year: 2028, value: 2 },
          { year: 2030, value: 3 },
        ]}
      />
    );
    expect(container.querySelectorAll(".vc-line-band")).toHaveLength(1);
    expect(screen.getByRole("region", { name: "Yearly" })).toBeInTheDocument();
  });
});
