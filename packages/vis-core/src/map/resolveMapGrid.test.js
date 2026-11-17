import {
  FALLBACK_GRID,
  filterPaneWarnings,
  MAX_RECOMMENDED_MAP_PANES,
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

describe("resolveMapGrid with a configured grid", () => {
  const page = (grid, extra = {}) => ({ type: "MapLayout", config: { ...config, grid, ...extra } });
  const dashboard = {
    columns: [2, 1],
    rows: 2,
    cells: [
      { id: "overview", column: 1, row: 1, rowSpan: 2, title: "Overview", visualisations: ["Accessibility"], syncGroup: null },
      { id: "base", column: 2, row: 1, title: "Base", layers: ["Zones"] },
      { id: "future", column: 2, row: 2, title: "2040", classification: "own" },
    ],
  };

  it("lays the cells out as configured", () => {
    const grid = resolveMapGrid(page(dashboard));
    expect(grid).toMatchObject({
      preset: "custom",
      columns: 2,
      rows: 2,
      columnSizes: [2, 1],
      rowSizes: [1, 1],
      paneIds: ["overview", "base", "future"],
      primaryPaneId: "overview",
      warnings: [],
    });
    expect(grid.panes[0]).toMatchObject({ column: 1, row: 1, columnSpan: 1, rowSpan: 2, syncGroup: null, title: "Overview" });
  });

  it("fills in each pane's content and options", () => {
    const [overview, base, future] = resolveMapGrid(page(dashboard)).panes;
    expect(overview.visualisations).toEqual(["Accessibility"]);
    expect(overview.layers).toEqual(["Zones", "Network"]);
    expect(base.visualisations).toEqual(["Accessibility", "Flows"]);
    expect(base.layers).toEqual(["Zones"]);
    expect(base.syncGroup).toBe("default");
    expect(future.classification).toBe("own");
  });

  it("uses the grid for a DualMapLayout page that has one", () => {
    expect(resolveMapGrid({ type: "DualMapLayout", config: { ...config, grid: dashboard } }).preset).toBe("custom");
  });

  it("keeps other cell types in the grid, but only map cells become panes", () => {
    const grid = resolveMapGrid(page({ columns: 2, rows: 1, cells: [{ id: "map" }, { id: "notes", type: "text", column: 2 }] }));
    expect(grid.cells.map((cell) => [cell.id, cell.type])).toEqual([["map", "map"], ["notes", "text"]]);
    expect(grid.paneIds).toEqual(["map"]);
    expect(grid.warnings).toEqual([expect.stringContaining('type "text"')]);
  });

  it.each([
    ["no map cells", { columns: 1, rows: 1, cells: [{ id: "notes", type: "text" }] }, /no map cells/],
    ["no cells at all", { columns: 1, rows: 1 }, /no map cells/],
  ])("falls back to the page's default layout with %s", (_, grid, warning) => {
    const resolved = resolveMapGrid(page(grid));
    expect(resolved.preset).toBe("single");
    expect(resolved.paneIds).toEqual(["main"]);
    expect(resolved.warnings).toEqual(expect.arrayContaining([expect.stringMatching(warning)]));
  });

  it.each([
    ["bad columns", { columns: 0, rows: 1, cells: [{ id: "a" }] }, /grid.columns/],
    ["bad rows", { columns: 1, rows: [1, -2], cells: [{ id: "a" }] }, /grid.rows/],
    ["a missing id", { columns: 1, rows: 1, cells: [{}] }, /no id; using "cell-1"/],
    ["a repeated id", { columns: 2, rows: 1, cells: [{ id: "a" }, { id: "a", column: 2 }] }, /repeats an id/],
    ["a bad placement value", { columns: 2, rows: 1, cells: [{ id: "a", column: 0 }] }, /column 0/],
    ["a cell outside the grid", { columns: 1, rows: 1, cells: [{ id: "a", columnSpan: 2 }] }, /outside the 1×1 grid/],
    ["overlapping cells", { columns: 2, rows: 1, cells: [{ id: "a", columnSpan: 2 }, { id: "b", column: 2 }] }, /"b" overlaps cell "a"/],
    ["an unknown visualisation", { columns: 1, rows: 1, cells: [{ id: "a", visualisations: ["Nope"] }] }, /visualisation "Nope"/],
    ["an unknown layer", { columns: 1, rows: 1, cells: [{ id: "a", layers: ["Nope"] }] }, /layer "Nope"/],
    ["a bad classification", { columns: 1, rows: 1, cells: [{ id: "a", classification: "mine" }] }, /classification "mine"/],
  ])("warns about %s", (_, grid, warning) => {
    expect(resolveMapGrid(page(grid)).warnings).toEqual(expect.arrayContaining([expect.stringMatching(warning)]));
  });

  it("gives unnamed and repeated cells usable ids", () => {
    const grid = resolveMapGrid(page({ columns: 2, rows: 1, cells: [{}, { id: "cell-1", column: 2 }] }));
    expect(new Set(grid.paneIds).size).toBe(2);
  });

  it("falls back to a shared classification for an unknown value", () => {
    const grid = resolveMapGrid(page({ columns: 1, rows: 1, cells: [{ id: "a", classification: "mine" }] }));
    expect(grid.panes[0].classification).toBe("shared");
  });

  it("warns about more map panes than recommended", () => {
    const count = MAX_RECOMMENDED_MAP_PANES + 1;
    const cells = Array.from({ length: count }, (_, i) => ({ id: `p${i}`, column: i + 1 }));
    expect(resolveMapGrid(page({ columns: count, rows: 1, cells })).warnings).toEqual([
      expect.stringMatching(new RegExp(`${count} map panes`)),
    ]);
  });
});

describe("filterPaneWarnings", () => {
  it("names filters that target panes the grid doesn't have", () => {
    const grid = resolveMapGrid({ type: "DualMapLayout", config });
    expect(
      filterPaneWarnings(
        [
          { filterName: "Year", panes: ["left", "middle"] },
          { filterName: "All", panes: "all" },
          { paramName: "metric" },
        ],
        grid
      )
    ).toEqual([expect.stringContaining('"Year" targets pane "middle"')]);
  });
});
