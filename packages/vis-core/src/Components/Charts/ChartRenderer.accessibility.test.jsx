import React from "react";
import { render, screen } from "@testing-library/react";
import { axe } from "jest-axe";
import { ThemeProvider } from "styled-components";
import { ChartRenderer } from "./ChartRenderer";
import { brandThemeDefaults } from "defaults";

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

/** WCAG relative luminance contrast ratio between two hex colours. */
const contrastRatio = (a, b) => {
  const luminance = (hex) => {
    const [r, g, bl] = hex
      .replace("#", "")
      .match(/.{2}/g)
      .map((c) => {
        const v = parseInt(c, 16) / 255;
        return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
      });
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

const config = {
  type: "multiple_line",
  title: "15-minute traffic profile",
  y_axis_title: "Vehicles",
  columns: [
    { key: "wb", label: "Westbound", colour: "primary" },
    { key: "eb", label: "Eastbound" },
  ],
  xAxis: { type: "time", format: "HH:mm", tickInterval: "3h", domain: ["00:00", "24:00"] },
  connectNulls: false,
  bands: [{ from: "08:00", to: "09:00", label: "AM peak", tone: "accent" }],
  gaps: [{ from: "10:00", to: "14:00", label: "Counter fault" }],
};

const data = Array.from({ length: 96 }, (_, i) => {
  const h = Math.floor(i / 4);
  const label = `${String(h).padStart(2, "0")}:${String((i % 4) * 15).padStart(2, "0")}`;
  const missing = h >= 10 && h < 14;
  return { label, wb: missing ? null : 100 + i, eb: missing ? null : 80 + i };
});

describe("ChartRenderer line chart accessibility", () => {
  it("has no axe violations with a time axis, bands and gaps", async () => {
    const { container } = render(
      <ThemeProvider theme={brandThemeDefaults}>
        <ChartRenderer charts={[config]} data={data} />
      </ThemeProvider>
    );

    expect(
      screen.getByRole("region", { name: "15-minute traffic profile" })
    ).toBeInTheDocument();
    expect(screen.getByRole("list", { name: "Highlighted ranges" })).toBeInTheDocument();

    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it("uses label and series colours that meet contrast against the surface", () => {
    const { surface, text, warning, primary } = brandThemeDefaults.colors;
    // Band labels use the text token; gap labels use the warning token.
    expect(contrastRatio(text, surface)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(warning, surface)).toBeGreaterThanOrEqual(4.5);
    // Lines are graphical objects: 3:1 against the background (WCAG 1.4.11).
    expect(contrastRatio(primary, surface)).toBeGreaterThanOrEqual(3);
  });
});
