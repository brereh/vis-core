import { groupFiltersByPane } from "./filterGroups";
import { resolveMapGrid } from "../../../map/resolveMapGrid";

const config = { layers: [], visualisations: [] };
const titledGrid = resolveMapGrid({
  type: "MapLayout",
  config: {
    ...config,
    grid: {
      columns: 3,
      rows: 1,
      cells: [
        { id: "base", title: "Base year" },
        { id: "future", title: "2040", column: 2 },
        { id: "extra", column: 3 },
      ],
    },
  },
});

const f = (id, panes, paneScope = "subset") => ({ id, panes, paneScope });

describe("groupFiltersByPane", () => {
  it.each([
    ["a single-map page", resolveMapGrid({ type: "MapLayout", config })],
    ["a side-by-side page", resolveMapGrid({ type: "DualMapLayout", config })],
  ])("keeps the list flat on %s (no pane titles)", (_, grid) => {
    const filters = [f("a", ["left"]), f("b", grid.paneIds, "all")];
    expect(groupFiltersByPane(filters, grid)).toEqual([{ key: "all", title: undefined, filters }]);
  });

  it("lists filters for every pane first, then groups the rest by pane set under their titles", () => {
    const filters = [
      f("year-future", ["future"]),
      f("metric", ["base", "future", "extra"], "all"),
      f("year-base", ["base"]),
      f("both", ["future", "base"]),
      f("mode-future", ["future"]),
      f("extra-only", ["extra"]),
      { id: "unresolved" },
    ];
    expect(groupFiltersByPane(filters, titledGrid).map((g) => [g.title, g.filters.map((x) => x.id)])).toEqual([
      [undefined, ["metric", "unresolved"]],
      ["2040", ["year-future", "mode-future"]],
      ["Base year", ["year-base"]],
      ["Base year + 2040", ["both"]],
      ["extra", ["extra-only"]],
    ]);
  });

  it("leaves out an empty everywhere group", () => {
    expect(groupFiltersByPane([f("a", ["base"])], titledGrid).map((g) => g.title)).toEqual(["Base year"]);
  });
});
