import { resolveFilterPanes } from "./resolveFilterPanes";
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

    it("ignores the name rules for visualisations without 'Side' in their name", () => {
      expect(resolve({ filterName: "Scenario Left", visualisations: ["Flows"] }, dual)).toMatchObject({
        panes: ["left", "right"],
        source: "default",
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
