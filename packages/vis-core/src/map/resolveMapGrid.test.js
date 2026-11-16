import {
  FALLBACK_GRID,
  LEFT_PANE_ID,
  paneShows,
  panesShowing,
  resolveMapGrid,
  RIGHT_PANE_ID,
  SINGLE_PANE_ID,
} from "./resolveMapGrid";

const config = {
  layers: [{ name: "Zones" }, { name: "Network" }],
  visualisations: [
    { name: "Accessibility", type: "joinDataToMap" },
    { name: "Flows", type: "geojson" },
    { name: "Summary", type: "calloutCard" },
  ],
};

describe("resolveMapGrid presets", () => {
  it("gives a MapLayout page one pane showing every map visualisation and layer", () => {
    const grid = resolveMapGrid({ type: "MapLayout", config });
    expect(grid).toMatchObject({ columns: 1, rows: 1, preset: "single", primaryPaneId: SINGLE_PANE_ID });
    expect(grid.paneIds).toEqual([SINGLE_PANE_ID]);
    expect(grid.panes[0]).toEqual({
      id: SINGLE_PANE_ID,
      type: "map",
      column: 1,
      row: 1,
      columnSpan: 1,
      rowSpan: 1,
      title: undefined,
      visualisations: ["Accessibility", "Flows"],
      layers: ["Zones", "Network"],
      syncGroup: "default",
      classification: "shared",
    });
  });

  it("gives a DualMapLayout page two synced panes side by side, showing the same content", () => {
    const grid = resolveMapGrid({ type: "DualMapLayout", config });
    expect(grid).toMatchObject({ columns: 2, rows: 1, preset: "dual", primaryPaneId: LEFT_PANE_ID });
    expect(grid.paneIds).toEqual([LEFT_PANE_ID, RIGHT_PANE_ID]);
    expect(grid.panes.map((p) => p.column)).toEqual([1, 2]);
    grid.panes.forEach((pane) => {
      expect(pane.visualisations).toEqual(["Accessibility", "Flows"]);
      expect(pane.syncGroup).toBe("default");
      expect(pane.classification).toBe("shared");
    });
  });

  it("copes with a page without config", () => {
    expect(resolveMapGrid({ type: "MapLayout" }).panes[0]).toMatchObject({ visualisations: [], layers: [] });
    expect(resolveMapGrid(undefined).preset).toBe("single");
  });

  it("is plain data", () => {
    const grid = resolveMapGrid({ type: "DualMapLayout", config });
    // Survives a JSON round trip unchanged (toEqual ignores properties set to undefined).
    expect(JSON.parse(JSON.stringify(grid))).toEqual(grid);
  });
});

describe("panesShowing", () => {
  const grid = {
    ...resolveMapGrid({ type: "DualMapLayout", config }),
  };
  grid.panes = [
    { ...grid.panes[0], visualisations: ["Accessibility"], layers: ["Zones"] },
    { ...grid.panes[1], visualisations: ["Accessibility", "Flows"], layers: ["Zones", "Network"] },
  ];

  it.each([
    [{ visualisation: "Accessibility" }, [LEFT_PANE_ID, RIGHT_PANE_ID]],
    [{ visualisation: "Flows" }, [RIGHT_PANE_ID]],
    [{ visualisation: "Summary" }, []],
    [{ layer: "Network" }, [RIGHT_PANE_ID]],
    [{}, []],
  ])("%j → %j", (what, expected) => {
    expect(panesShowing(grid, what)).toEqual(expected);
  });

  it("treats the fallback grid's pane as showing everything", () => {
    expect(panesShowing(FALLBACK_GRID, { visualisation: "Anything" })).toEqual([SINGLE_PANE_ID]);
    expect(paneShows(FALLBACK_GRID.panes[0], { layer: "Anything" })).toBe(true);
  });
});
