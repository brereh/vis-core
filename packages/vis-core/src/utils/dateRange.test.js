import {
  clampIsoDate,
  formatDateForLocale,
  getDateBoundsFromRows,
  getDefaultDateRangeValue,
  normaliseDateRangeValue,
  toIsoDate,
} from "./dateRange";
import { expandFilterParamValues, filterHasParam, getFilterParamNames } from "./filterParams";
import { getInitialFilterValue, saveFilterState } from "./filterPersistence";

const filter = {
  filterName: "Survey dates",
  type: "dateRange",
  paramName: ["date_from", "date_to"],
  min: "2025-10-06",
  max: "2025-10-19",
  defaultValue: ["min", "max"],
  locale: "en-GB",
};

describe("toIsoDate", () => {
  it.each([
    ["2025-10-06", "2025-10-06"],
    ["2025-10-06T13:45:00Z", "2025-10-06"],
    [new Date(2025, 9, 6), "2025-10-06"],
    ["2025-02-30", null],
    ["06/10/2025", null],
    ["", null],
    [null, null],
  ])("converts %p to %p", (input, expected) => {
    expect(toIsoDate(input)).toBe(expected);
  });
});

describe("date range helpers", () => {
  it("formats dates for the configured locale", () => {
    expect(formatDateForLocale("2025-10-06", "en-GB")).toBe("06/10/2025");
    expect(formatDateForLocale("2025-10-06", "en-US")).toBe("10/06/2025");
  });

  it("clamps to the bounds", () => {
    expect(clampIsoDate("2025-10-01", "2025-10-06", "2025-10-19")).toBe("2025-10-06");
    expect(clampIsoDate("2025-10-30", "2025-10-06", "2025-10-19")).toBe("2025-10-19");
    expect(clampIsoDate("2025-10-10", null, null)).toBe("2025-10-10");
  });

  it("finds bounds in metadata rows, from one column or two", () => {
    const rows = [
      { day: "2025-10-08", start: "2025-10-07", end: "2025-10-12" },
      { day: "2025-10-06", start: "2025-10-06", end: "2025-10-19T00:00:00" },
      { day: null, start: "bad", end: null },
    ];
    expect(getDateBoundsFromRows(rows, "day")).toEqual({ min: "2025-10-06", max: "2025-10-08" });
    expect(getDateBoundsFromRows(rows, "start", "end")).toEqual({ min: "2025-10-06", max: "2025-10-19" });
    expect(getDateBoundsFromRows([], "day")).toEqual({ min: null, max: null });
  });

  it("normalises a value, clamping it and rejecting a reversed range", () => {
    expect(normaliseDateRangeValue(filter, ["2025-10-01", "2025-10-30"])).toEqual(["2025-10-06", "2025-10-19"]);
    expect(normaliseDateRangeValue(filter, ["2025-10-12", "2025-10-08"])).toBeNull();
    expect(normaliseDateRangeValue(filter, ["2025-10-12", ""])).toBeNull();
    expect(normaliseDateRangeValue(filter, "2025-10-12")).toBeNull();
  });

  it("adds the extra toggle's default to the value", () => {
    const withToggle = { ...filter, extraToggle: { paramName: "include_excluded", defaultValue: false } };
    expect(normaliseDateRangeValue(withToggle, ["2025-10-07", "2025-10-08"])).toEqual(["2025-10-07", "2025-10-08", false]);
    expect(normaliseDateRangeValue(withToggle, ["2025-10-07", "2025-10-08", true])).toEqual(["2025-10-07", "2025-10-08", true]);
  });

  it("resolves min and max keywords and explicit dates in the default", () => {
    expect(getDefaultDateRangeValue(filter)).toEqual(["2025-10-06", "2025-10-19"]);
    expect(getDefaultDateRangeValue({ ...filter, defaultValue: undefined })).toEqual(["2025-10-06", "2025-10-19"]);
    expect(getDefaultDateRangeValue({ ...filter, defaultValue: ["2025-10-13", "max"] })).toEqual(["2025-10-13", "2025-10-19"]);
  });
});

describe("multi-parameter filter helpers", () => {
  const withToggle = { ...filter, extraToggle: { paramName: "include_excluded", defaultValue: false } };

  it("lists and finds every parameter", () => {
    expect(getFilterParamNames(withToggle)).toEqual(["date_from", "date_to", "include_excluded"]);
    expect(filterHasParam(withToggle, "date_to")).toBe(true);
    expect(filterHasParam(withToggle, "date")).toBe(false);
    expect(getFilterParamNames({ paramName: "year" })).toEqual(["year"]);
  });

  it("expands a value to one entry per parameter", () => {
    expect(expandFilterParamValues(withToggle, ["2025-10-06", "2025-10-19", true])).toEqual({
      date_from: "2025-10-06",
      date_to: "2025-10-19",
      include_excluded: true,
    });
    expect(expandFilterParamValues(withToggle, ["2025-10-06", "2025-10-19"])).toEqual({
      date_from: "2025-10-06",
      date_to: "2025-10-19",
      include_excluded: false,
    });
    expect(expandFilterParamValues(withToggle, undefined)).toEqual({
      date_from: undefined,
      date_to: undefined,
      include_excluded: undefined,
    });
  });

  it("leaves single-parameter filters unchanged", () => {
    expect(expandFilterParamValues({ paramName: "year" }, [2025, 2026])).toEqual({ year: [2025, 2026] });
  });
});

describe("date range persistence", () => {
  const persisted = { ...filter, persistState: true };

  beforeEach(() => {
    localStorage.clear();
    jest.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    console.log.mockRestore();
  });

  it("uses the default when nothing is persisted", () => {
    expect(getInitialFilterValue(persisted)).toEqual(["2025-10-06", "2025-10-19"]);
  });

  it("restores a persisted range", () => {
    saveFilterState(persisted, ["2025-10-08", "2025-10-10"]);
    expect(getInitialFilterValue(persisted)).toEqual(["2025-10-08", "2025-10-10"]);
  });

  it("clamps a persisted range to the current bounds", () => {
    saveFilterState(persisted, ["2025-09-01", "2025-10-10"]);
    expect(getInitialFilterValue(persisted)).toEqual(["2025-10-06", "2025-10-10"]);
  });

  it("falls back to the default for an invalid persisted range", () => {
    saveFilterState(persisted, ["2025-10-12", "2025-10-08"]);
    expect(getInitialFilterValue(persisted)).toEqual(["2025-10-06", "2025-10-19"]);
  });

  it("ignores persisted values when persistState is off", () => {
    saveFilterState(persisted, ["2025-10-08", "2025-10-10"]);
    expect(getInitialFilterValue(filter)).toEqual(["2025-10-06", "2025-10-19"]);
  });
});
