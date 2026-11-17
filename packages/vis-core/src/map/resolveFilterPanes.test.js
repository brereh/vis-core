import { drawPaneWarnings, legacyTargetingWarnings, resolveFilterPanes } from "./resolveFilterPanes";
import { resolveMapGrid } from "./resolveMapGrid";

const config = {
  layers: [{ name: "Zones" }, { name: "Network" }],
  visualisations: [
    { name: "Accessibility Side", type: "joinDataToMap" },
    { name: "Flows", type: "geojson" },
    { name: "Summary", type: "calloutCard" },
  ],
};
const single = resolveMapGrid({ type: "MapLayout", config });
const dual = resolveMapGrid({ type: "DualMapLayout", config });

/** A dual grid whose right pane alone shows Flows and Network. */
const uneven = {
  ...dual,
  panes: [
    { ...dual.panes[0], visualisations: ["Accessibility Side"], layers: ["Zones"] },
    { ...dual.panes[1], visualisations: ["Accessibility Side", "Flows"], layers: ["Zones", "Network"] },
  ],
};

const resolve = (filter, grid) => {
  const { panes, paneScope, source } = resolveFilterPanes(filter, grid);
  return { panes, paneScope, source };
};

describe("resolveFilterPanes", () => {
  it("targets the only pane on a single-map page", () => {
    expect(resolve({ filterName: "Year Left", visualisations: ["Accessibility Side"] }, single)).toEqual({
      panes: ["main"],
      paneScope: "all",
      source: "default",
    });
  });

  describe("explicit panes", () => {
    it.each([
      [["right"], ["right"], "subset"],
      [["left", "right"], ["left", "right"], "all"],
      ["all", ["left", "right"], "all"],
      [["right", "nowhere"], ["right"], "subset"],
    ])("%j → %j", (panes, expected, scope) => {
      expect(resolve({ panes, filterName: "Year Left", visualisations: ["Accessibility Side"] }, dual)).toEqual({
        panes: expected,
        paneScope: scope,
        source: "panes",
      });
    });

    it("falls back to the default when none of the panes exist", () => {
      expect(resolve({ panes: ["nowhere"], visualisations: ["Flows"] }, uneven)).toMatchObject({
        panes: ["right"],
        source: "default",
      });
    });

    it("keeps grid order", () => {
      expect(resolve({ panes: ["right", "left"] }, dual).panes).toEqual(["left", "right"]);
    });
  });

  describe("legacy side-by-side rules", () => {
    it.each([
      ["left", ["left"]],
      ["right", ["right"]],
      ["both", ["left", "right"]],
    ])("honours sides: %s", (sides, expected) => {
      expect(resolve({ sides, visualisations: ["Flows"] }, dual)).toMatchObject({ panes: expected, source: "sides" });
      expect(resolve({ side: sides, visualisations: ["Flows"] }, dual).panes).toEqual(expected);
    });

    it.each([
      ["Scenario Left", ["left"]],
      ["Scenario Right", ["right"]],
      ["Year", ["left", "right"]],
    ])("reads %s on a 'Side' visualisation as %j", (filterName, expected) => {
      expect(resolve({ filterName, visualisations: ["Accessibility Side"] }, dual)).toMatchObject({
        panes: expected,
        source: "names",
      });
    });

    it("applies the Left/Right rule whatever the visualisation is called", () => {
      expect(resolve({ filterName: "Scenario Left", visualisations: ["Flows"] }, dual)).toMatchObject({
        panes: ["left"],
        source: "names",
      });
      expect(resolve({ filterName: "Right zone", layer: "Zones" }, dual).panes).toEqual(["right"]);
    });

    it("leaves other filters on visualisations without 'Side' to the default", () => {
      expect(resolve({ filterName: "Year", visualisations: ["Flows"] }, dual)).toMatchObject({
        panes: ["left", "right"],
        source: "default",
      });
    });

    it("carries on to the legacy rules when none of the explicit panes exist", () => {
      expect(resolve({ panes: ["nowhere"], filterName: "Scenario Right" }, dual)).toMatchObject({
        panes: ["right"],
        source: "names",
      });
    });

    it("ignores legacy sides on a single-map page", () => {
      expect(resolve({ sides: "right", visualisations: ["Flows"] }, single).panes).toEqual(["main"]);
    });
  });

  describe("default", () => {
    it("targets the panes showing the filter's visualisations", () => {
      expect(resolve({ visualisations: ["Flows"] }, uneven)).toEqual({
        panes: ["right"],
        paneScope: "subset",
        source: "default",
      });
    });

    it("then the panes showing its layer", () => {
      expect(resolve({ layer: "Network" }, uneven).panes).toEqual(["right"]);
      expect(resolve({ visualisations: ["Summary"], layer: "Network" }, uneven).panes).toEqual(["right"]);
    });

    it("then every pane", () => {
      expect(resolve({ visualisations: ["Summary"] }, uneven).panes).toEqual(["left", "right"]);
      expect(resolve({}, uneven).panes).toEqual(["left", "right"]);
    });
  });
});

describe("legacyTargetingWarnings", () => {
  const dualWithGrid = resolveMapGrid({
    type: "DualMapLayout",
    config: { ...config, grid: { columns: 2, rows: 1, cells: [{ id: "left" }, { id: "right", column: 2 }] } },
  });

  it("names filters a side-by-side page targets by their names", () => {
    expect(
      legacyTargetingWarnings(
        [
          { filterName: "Year Left" },
          { filterName: "Mode", visualisations: ["Accessibility Side"] },
          { filterName: "Year Right", panes: ["right"] },
          { filterName: "Scenario", sides: "left" },
          { filterName: "Metric", visualisations: ["Flows"] },
        ],
        dual,
        "DualMapLayout"
      )
    ).toEqual([expect.stringContaining('"Year Left" picks its panes from its name'), expect.stringContaining('"Mode"')]);
  });

  it("names filters relying on sides or names on a side-by-side page with a grid", () => {
    expect(
      legacyTargetingWarnings(
        [{ filterName: "Year Left" }, { filterName: "Scenario", sides: "left" }, { filterName: "Metric" }, { filterName: "Year Right", panes: ["right"] }],
        dualWithGrid,
        "DualMapLayout"
      )
    ).toEqual([expect.stringContaining('"Year Left"'), expect.stringContaining('"Scenario"')]);
  });

  it("says nothing on single-map pages or grids on other pages", () => {
    expect(legacyTargetingWarnings([{ filterName: "Year Left", sides: "left" }], single, "MapLayout")).toEqual([]);
    expect(legacyTargetingWarnings([{ filterName: "Year Left" }], dualWithGrid, "MapLayout")).toEqual([]);
  });
});

describe("drawPaneWarnings", () => {
  const types = ["mapFeatureSelect"];
  const custom = { preset: "custom" };

  it("warns when feature-select filters on a configured grid target different panes", () => {
    const filters = [
      { type: "mapFeatureSelect", panes: ["a"] },
      { type: "mapFeatureSelect", panes: ["b", "a"] },
      { type: "dropdown", panes: ["c"] },
    ];
    expect(drawPaneWarnings(filters, types, custom)).toEqual([expect.stringContaining('select on "a"')]);
  });

  it("says nothing when they agree, or on a preset page", () => {
    expect(drawPaneWarnings([{ type: "mapFeatureSelect", panes: ["a"] }, { type: "mapFeatureSelect", panes: ["a", "b"] }], types, custom)).toEqual([]);
    expect(drawPaneWarnings([{ type: "mapFeatureSelect", panes: ["left"] }, { type: "mapFeatureSelect", panes: ["right"] }], types, dual)).toEqual([]);
  });
});
