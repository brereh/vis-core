import { renderHook } from "@testing-library/react";
import {
  mergeOverrides,
  selectClassificationData,
  selectClassificationPanes,
  selectDrawPaneId,
  selectLayerControlPane,
  selectMaps,
  selectPaneMap,
  selectPaneOfMap,
  selectPanesShowing,
  selectPaneView,
  selectPaneVisualisation,
  selectVisualisationForLayer,
} from "./mapSelectors";
import { usePaneVisualisation, useShallowStableArray } from "../hooks/usePaneVisualisation";
import { resolveMapGrid } from "../map/resolveMapGrid";
import { mapReducer } from "./mapReducer";

const VIS = "Accessibility";
const grid = resolveMapGrid({ type: "DualMapLayout", config: { visualisations: [{ name: VIS, type: "joinDataToMap" }] } });

const visualisation = {
  name: VIS,
  style: "polygon-continuous",
  queryParams: { year: { value: 2030, required: true }, scenario: { value: "base", required: true } },
  pathParams: { metric: { value: "jobs", required: true } },
};

describe("selectPaneVisualisation", () => {
  it("returns the page's copy itself when the pane has no params of its own", () => {
    const state = { mapGrid: grid, visualisations: { [VIS]: visualisation }, paneOverrides: {} };
    expect(selectPaneVisualisation(state, "left", VIS)).toBe(visualisation);
  });

  it("lays the pane's params over the page's", () => {
    const state = {
      mapGrid: grid,
      visualisations: { [VIS]: visualisation },
      paneOverrides: { right: { [VIS]: { queryParams: { scenario: { value: "future", required: true } } } } },
    };
    const right = selectPaneVisualisation(state, "right", VIS);
    expect(right.queryParams).toEqual({
      year: { value: 2030, required: true },
      scenario: { value: "future", required: true },
    });
    expect(right.pathParams).toBe(visualisation.pathParams);
    expect(right.style).toBe("polygon-continuous");
    expect(selectPaneVisualisation(state, "left", VIS)).toBe(visualisation);
  });

  it("ignores empty override maps", () => {
    expect(mergeOverrides(visualisation, { queryParams: {} })).toEqual(visualisation);
    expect(mergeOverrides(undefined, { queryParams: { a: 1 } })).toBeUndefined();
  });
});

describe("usePaneVisualisation", () => {
  it("keeps the same object until the page's copy or the pane's params change", () => {
    const overrides = { queryParams: { scenario: { value: "future", required: true } } };
    let state = {
      visualisations: { [VIS]: visualisation },
      paneOverrides: { right: { [VIS]: overrides } },
    };
    const { result, rerender } = renderHook(() => usePaneVisualisation(state, "right", VIS));
    const first = result.current;

    state = { ...state, paneData: { right: { [VIS]: [1, 2] } } };
    rerender();
    expect(result.current).toBe(first);

    state = { ...state, paneOverrides: { right: { [VIS]: { ...overrides } } } };
    rerender();
    expect(result.current).not.toBe(first);
  });
});

describe("useShallowStableArray", () => {
  it("returns the previous array while its items are the same", () => {
    const a = {};
    const b = {};
    let items = [a, b];
    const { result, rerender } = renderHook(() => useShallowStableArray(items));
    const first = result.current;

    items = [a, b];
    rerender();
    expect(result.current).toBe(first);

    items = [a];
    rerender();
    expect(result.current).toEqual([a]);
  });
});

describe("selectClassificationPanes", () => {
  it("shares classification between the panes showing the visualisation", () => {
    expect(selectClassificationPanes({ mapGrid: grid }, VIS, "left")).toEqual(["left", "right"]);
  });

  it("keeps a pane with its own classification to itself, and out of the others' group", () => {
    const own = { ...grid, panes: [grid.panes[0], { ...grid.panes[1], classification: "own" }] };
    expect(selectClassificationPanes({ mapGrid: own }, VIS, "right")).toEqual(["right"]);
    expect(selectClassificationPanes({ mapGrid: own }, VIS, "left")).toEqual(["left"]);
  });

  it("uses the single pane on a page with no grid", () => {
    expect(selectClassificationPanes({}, VIS, "main")).toEqual(["main"]);
  });
});

describe("maps", () => {
  const left = { name: "left" };
  const right = { name: "right" };

  it("lists registered maps in grid order", () => {
    expect(selectMaps({ mapGrid: grid, mapsByPane: { right, left } })).toEqual([left, right]);
  });

  it("falls back to state.map", () => {
    expect(selectMaps({ map: left })).toEqual([left]);
    expect(selectMaps({})).toEqual([]);
  });

  it("finds a pane's map and a map's pane", () => {
    const state = { mapGrid: grid, mapsByPane: { left, right } };
    expect(selectPaneMap(state, "right")).toBe(right);
    expect(selectPaneMap(state, "nope")).toBeNull();
    expect(selectPaneOfMap(state, right)).toBe("right");
    expect(selectPaneOfMap(state, {})).toBeUndefined();
  });

  it("lists the panes showing something", () => {
    expect(selectPanesShowing({ mapGrid: grid }, { visualisation: VIS })).toEqual(["left", "right"]);
  });
});

describe("selectPaneView", () => {
  it("gives a pane its own params and data", () => {
    const leftData = [{ id: 1 }];
    const state = {
      mapGrid: grid,
      visualisations: { [VIS]: { ...visualisation, data: [...leftData, { id: 2 }] } },
      paneOverrides: { left: { [VIS]: { queryParams: { year: { value: 2050, required: true } } } } },
      paneData: { left: { [VIS]: leftData } },
    };
    const left = selectPaneView(state, "left", VIS);
    expect(left.data).toBe(leftData);
    expect(left.queryParams.year.value).toBe(2050);
    expect(left.style).toBe("polygon-continuous");
  });

  it("gives a pane with no data stored yet no data, not the other panes'", () => {
    const state = {
      mapGrid: grid,
      visualisations: { [VIS]: { ...visualisation, data: [{ id: 9 }] } },
      paneOverrides: {},
      paneData: { right: { [VIS]: [{ id: 9 }] } },
    };
    expect(selectPaneView(state, "left", VIS).data).toEqual([]);
    expect(selectPaneView(state, "right", VIS).data).toEqual([{ id: 9 }]);
  });

  it("gives a single-map page's view the data its pane stored", () => {
    const data = [{ id: 1 }];
    const base = { visualisations: { [VIS]: visualisation }, paneOverrides: {}, paneData: {} };
    const next = { ...base, ...mapReducer(base, { type: "UPDATE_ALL_DATA", payload: { visualisationName: VIS, data, paneId: "main" } }) };
    expect(next.visualisations[VIS].data).toBeUndefined();
    expect(selectPaneView(next, "main", VIS).data).toBe(data);
  });

  it("uses data stored without a pane where the pane has none", () => {
    const page = { ...visualisation, data: [{ id: 1 }] };
    expect(selectPaneView({ visualisations: { [VIS]: page } }, "main", VIS)).toBe(page);
  });
});

describe("selectClassificationData", () => {
  const ownGrid = resolveMapGrid({
    type: "MapLayout",
    config: {
      visualisations: [{ name: VIS, type: "joinDataToMap" }],
      grid: { columns: 3, rows: 1, cells: [{ id: "a" }, { id: "b", column: 2 }, { id: "c", column: 3, classification: "own" }] },
    },
  });
  const state = {
    mapGrid: ownGrid,
    visualisations: { [VIS]: { ...visualisation, data: ["page"] } },
    paneData: { a: { [VIS]: [1] }, b: { [VIS]: [2] }, c: { [VIS]: [3] } },
  };

  it("gives the data of the pane's whole classification group", () => {
    expect(selectClassificationData(state, VIS, "a")).toEqual([1, 2]);
    expect(selectClassificationData(state, VIS, "b")).toEqual([1, 2]);
  });

  it("gives an own-classification pane its own data", () => {
    expect(selectClassificationData(state, VIS, "c")).toEqual([3]);
  });

  it("matches the page copy's combined data on a side-by-side page", () => {
    const dual = { mapGrid: grid, visualisations: { [VIS]: visualisation }, paneData: { left: { [VIS]: [1] }, right: { [VIS]: [2] } } };
    expect(selectClassificationData(dual, VIS, "right")).toEqual([1, 2]);
  });

  it("falls back to the page copy's data where no pane has stored any", () => {
    expect(selectClassificationData({ ...state, paneData: {} }, VIS, "a")).toEqual(["page"]);
  });
});

describe("selectVisualisationForLayer and selectLayerControlPane", () => {
  const state = {
    mapGrid: grid,
    visualisations: { [VIS]: { joinLayer: "Zones" }, Flows: { joinLayer: "Links" } },
  };

  it("picks the visualisation joined to the layer, otherwise the first", () => {
    expect(selectVisualisationForLayer(state, "Links")).toBe("Flows");
    expect(selectVisualisationForLayer(state, "Unjoined")).toBe(VIS);
    expect(selectVisualisationForLayer({ visualisations: {} }, "Links")).toBeUndefined();
  });

  it("describes a side-by-side page's layers from the left pane", () => {
    expect(selectLayerControlPane(state, "Zones", VIS)).toBe("left");
  });

  it("describes a layer from the first pane showing it and its visualisation", () => {
    const custom = resolveMapGrid({
      type: "MapLayout",
      config: {
        layers: [{ name: "Zones" }, { name: "Links" }],
        visualisations: [{ name: VIS, type: "joinDataToMap" }, { name: "Flows", type: "joinDataToMap" }],
        grid: {
          columns: 3,
          rows: 1,
          cells: [
            { id: "a", layers: ["Zones"], visualisations: [VIS] },
            { id: "b", column: 2, layers: ["Links"], visualisations: [VIS] },
            { id: "c", column: 3, layers: ["Links"], visualisations: ["Flows"] },
          ],
        },
      },
    });
    const customState = { ...state, mapGrid: custom };
    expect(selectLayerControlPane(customState, "Links", "Flows")).toBe("c");
    expect(selectLayerControlPane(customState, "Links", "Nope")).toBe("b");
    expect(selectLayerControlPane(customState, "Unknown")).toBe("a");
  });
});

describe("selectDrawPaneId", () => {
  const custom = resolveMapGrid({
    type: "MapLayout",
    config: { grid: { columns: 2, rows: 1, cells: [{ id: "a" }, { id: "b", column: 2 }] } },
  });

  it("uses the first feature-select filter's first pane on a configured grid", () => {
    const filters = [{ type: "dropdown", panes: ["a"] }, { type: "mapFeatureSelectAndPan", panes: ["b"] }];
    expect(selectDrawPaneId({ mapGrid: custom, filters })).toBe("b");
  });

  it("falls back to the primary pane", () => {
    expect(selectDrawPaneId({ mapGrid: custom, filters: [] })).toBe("a");
    expect(selectDrawPaneId({ mapGrid: custom, filters: [{ type: "mapFeatureSelect", panes: ["gone"] }] })).toBe("a");
  });

  it("keeps a preset page's draw control on its primary pane", () => {
    expect(selectDrawPaneId({ mapGrid: grid, filters: [{ type: "mapFeatureSelect", panes: ["right"] }] })).toBe("left");
  });
});
