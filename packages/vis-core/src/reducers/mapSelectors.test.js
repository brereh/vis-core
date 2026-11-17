import { renderHook } from "@testing-library/react";
import {
  mergeOverrides,
  selectClassificationPanes,
  selectMaps,
  selectPaneMap,
  selectPaneOfMap,
  selectPanesShowing,
  selectPaneView,
  selectPaneVisualisation,
} from "./mapSelectors";
import { usePaneVisualisation, useShallowStableArray } from "../hooks/usePaneVisualisation";
import { resolveMapGrid } from "../map/resolveMapGrid";

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

  it("returns the page's copy when the pane's data is the page's data", () => {
    const data = [{ id: 1 }];
    const page = { ...visualisation, data };
    const state = { visualisations: { [VIS]: page }, paneOverrides: {}, paneData: { main: { [VIS]: data } } };
    expect(selectPaneView(state, "main", VIS)).toBe(page);
    expect(selectPaneView({ visualisations: { [VIS]: page } }, "main", VIS)).toBe(page);
  });
});
