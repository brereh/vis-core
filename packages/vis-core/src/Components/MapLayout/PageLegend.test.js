import { classificationGroups, legendPaneId } from "./PageLegend";
import { resolveMapGrid } from "../../map/resolveMapGrid";

const visualisations = {
  Card: { type: "calloutCard" },
  Zones: { type: "joinDataToMap" },
};
const config = {
  visualisations: [
    { name: "Card", type: "calloutCard" },
    { name: "Zones", type: "joinDataToMap" },
  ],
  layers: [{ name: "Zones" }],
};

describe("legendPaneId", () => {
  it("on a side-by-side page, checks the first visualisation whatever its type, as before", () => {
    const grid = resolveMapGrid({ type: "DualMapLayout", config });
    // Only the left pane has map data; the first visualisation (a callout card) has none,
    // so the right pane is chosen, as before panes had their own legends.
    const state = { visualisations, paneData: { left: { Zones: [{ id: 1 }] } } };
    expect(legendPaneId(state, grid, grid.paneIds)).toBe("right");
  });

  it("on a side-by-side page, picks the left pane when only it has data for the first visualisation", () => {
    const grid = resolveMapGrid({ type: "DualMapLayout", config });
    const state = { visualisations, paneData: { left: { Card: [{ id: 1 }] } } };
    expect(legendPaneId(state, grid, grid.paneIds)).toBe("left");
  });

  it("on a configured grid, checks the first map visualisation the group shows", () => {
    const grid = resolveMapGrid({
      type: "MapLayout",
      config: { ...config, grid: { columns: 2, rows: 1, cells: [{ id: "a" }, { id: "b", column: 2 }] } },
    });
    const state = { visualisations, paneData: { a: { Zones: [{ id: 1 }] } } };
    expect(legendPaneId(state, grid, grid.paneIds)).toBe("a");
  });
});

describe("classificationGroups", () => {
  it("keys own-classification panes apart from the shared group, and heads only titled groups", () => {
    const grid = resolveMapGrid({
      type: "MapLayout",
      config: {
        ...config,
        grid: { columns: 2, rows: 1, cells: [{ id: "a" }, { id: "shared", column: 2, classification: "own" }] },
      },
    });
    expect(classificationGroups(grid)).toEqual([
      { id: "shared", paneIds: ["a"], title: undefined },
      { id: "pane:shared", paneIds: ["shared"], title: undefined },
    ]);
  });
});
