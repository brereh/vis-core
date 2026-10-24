import {
  parseTimeValue,
  parseTickInterval,
  formatTimeValue,
  buildTimeTicks,
  isClockTime,
  resolveColourToken,
  bandToneColour,
  normaliseRanges,
} from "./lineChartTime";
import { brandTokens } from "defaults";

const HOUR = 60 * 60 * 1000;

describe("lineChartTime helpers", () => {
  it("parses clock times as offsets from midnight, including 24:00", () => {
    expect(parseTimeValue("00:00")).toBe(0);
    expect(parseTimeValue("08:15")).toBe(8 * HOUR + 15 * 60 * 1000);
    expect(parseTimeValue("24:00")).toBe(24 * HOUR);
    expect(isClockTime("08:15")).toBe(true);
    expect(isClockTime("2025-10-06T08:15:00")).toBe(false);
  });

  it("parses ISO datetimes and rejects junk", () => {
    expect(parseTimeValue("2025-10-06T08:00:00Z")).toBe(Date.UTC(2025, 9, 6, 8));
    expect(parseTimeValue("not a time")).toBeNull();
    expect(parseTimeValue(null)).toBeNull();
    expect(parseTimeValue("")).toBeNull();
  });

  it("parses tick intervals", () => {
    expect(parseTickInterval("3h")).toBe(3 * HOUR);
    expect(parseTickInterval("15m")).toBe(15 * 60 * 1000);
    expect(parseTickInterval("90min")).toBe(90 * 60 * 1000);
    expect(parseTickInterval("1d")).toBe(24 * HOUR);
    expect(parseTickInterval("soon")).toBeNull();
  });

  it("formats clock values and shows the end of day as 24:00", () => {
    expect(formatTimeValue(9 * HOUR, "HH:mm", { clock: true })).toBe("09:00");
    expect(formatTimeValue(24 * HOUR, "HH:mm", { clock: true })).toBe("24:00");
    expect(
      formatTimeValue(Date.UTC(2025, 9, 6, 17, 30), "DD/MM/YYYY HH:mm", { utc: true })
    ).toBe("06/10/2025 17:30");
  });

  it("builds ticks at the requested interval aligned to midnight", () => {
    expect(buildTimeTicks(0, 24 * HOUR, 3 * HOUR)).toEqual(
      [0, 3, 6, 9, 12, 15, 18, 21, 24].map((h) => h * HOUR)
    );
    // A domain starting mid-interval starts at the next aligned tick.
    expect(buildTimeTicks(HOUR, 7 * HOUR, 3 * HOUR)).toEqual([3 * HOUR, 6 * HOUR]);
    expect(buildTimeTicks(0, HOUR, 0)).toEqual([]);
  });

  it("resolves theme and palette token names to colours", () => {
    const theme = { colors: { accent: "#123456" } };
    expect(resolveColourToken("accent", theme)).toBe("#123456");
    expect(resolveColourToken("accent", {})).toBe(brandTokens.palette.teal);
    expect(resolveColourToken("warning", {})).toBe(brandTokens.palette.warning);
    expect(resolveColourToken("navy")).toBe(brandTokens.palette.navy);
    expect(resolveColourToken("#abcdef")).toBe("#abcdef");
    expect(bandToneColour("unknown", theme)).toBe("#123456");
  });

  it("normalises ranges for time and category axes", () => {
    expect(
      normaliseRanges([{ from: "08:00", to: "09:00", label: "AM" }, { from: "x" }], true)
    ).toEqual([{ from: "08:00", to: "09:00", label: "AM", x1: 8 * HOUR, x2: 9 * HOUR }]);
    expect(normaliseRanges([{ from: "2026", to: "2030" }], false)[0]).toMatchObject({
      x1: "2026",
      x2: "2030",
    });
    expect(normaliseRanges(undefined, true)).toEqual([]);
  });
});
