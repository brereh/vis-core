import {
  applyLayerParam,
  applyPaneData,
  applyVisualisationParam,
  gridOf,
  removePaneMap,
  setPaneMap,
  targetPanes,
} from "./paneState";
import { FALLBACK_GRID, resolveMapGrid } from "../map/resolveMapGrid";

const VIS = "Accessibility";
const CARD = "Summary";

/** A side-by-side page where only the right pane shows Flows. */
const dualGrid = () => {
  const grid = resolveMapGrid({
    type: "DualMapLayout",
    config: {
      visualisations: [
        { name: VIS, type: "joinDataToMap" },
        { name: "Flows", type: "geojson" },
        { name: CARD, type: "calloutCard" },
      ],
      layers: [{ name: "links" }],
    },
  });
  grid.panes[0] = { ...grid.panes[0], visualisations: [VIS] };
  return grid;
};

const state = (extra = {}) => ({
  mapGrid: dualGrid(),
  visualisations: {
    [VIS]: { queryParams: { year: { value: null, required: true } } },
    Flows: { queryParams: {} },
    [CARD]: { queryParams: {} },
  },
  paneOverrides: {},
  paneData: {},
  ...extra,
});

const setYear = (s, value, panes, visualisationNames = [VIS]) => ({
  ...s,
  ...applyVisualisationParam(s, { visualisationNames, panes, field: "queryParams", paramName: "year", value }),
});

describe("gridOf", () => {
  it("falls back to one pane showing everything", () => {
    expect(gridOf({})).toBe(FALLBACK_GRID);
  });
});

describe("targetPanes", () => {
  it.each([
    [{ panes: ["right"] }, ["right"]],
    [{ sides: "left" }, ["left"]],
    [{ sides: "right" }, ["right"]],
    [{ sides: "both" }, null],
    [{}, null],
    [undefined, null],
  ])("%j → %j", (payload, expected) => {
    expect(targetPanes(payload)).toEqual(expected);
  });
});

describe("applyVisualisationParam", () => {
  it("writes the page copy when every pane showing the visualisation is targeted", () => {
    const next = setYear(state(), 2030, null);
    expect(next.visualisations[VIS].queryParams.year).toEqual({ value: 2030, required: true });
    expect(next.paneOverrides).toEqual({});
  });

  it("writes only the targeted panes' overrides otherwise, keeping `required`", () => {
    const next = setYear(state(), 2030, ["left"]);
    expect(next.visualisations[VIS].queryParams.year.value).toBeNull();
    expect(next.paneOverrides).toEqual({
      left: { [VIS]: { queryParams: { year: { value: 2030, required: true } } } },
    });
  });

  it("lets a later shared value replace the panes' own values", () => {
    let next = setYear(state(), 2030, ["left"]);
    next = setYear(next, 2040, ["left", "right"]);
    expect(next.visualisations[VIS].queryParams.year.value).toBe(2040);
    expect(next.paneOverrides.left[VIS].queryParams).toEqual({});
  });

  it("counts only panes showing the visualisation when deciding it's shared", () => {
    // Only the right pane shows Flows, so targeting the right pane is targeting all of them.
    const next = setYear(state(), 2030, ["right"], ["Flows"]);
    expect(next.visualisations.Flows.queryParams.year.value).toBe(2030);
    expect(next.paneOverrides).toEqual({});
  });

  it("ignores a filter aimed at panes that don't show the visualisation", () => {
    const before = state();
    const next = setYear(before, 2030, ["left"], ["Flows"]);
    expect(next.visualisations).toBe(before.visualisations);
    expect(next.paneOverrides).toEqual({});
  });

  it("writes the page copy for a visualisation shown in no pane (a callout card)", () => {
    const next = setYear(state(), 2030, ["left"], [CARD]);
    expect(next.visualisations[CARD].queryParams.year).toEqual({ value: 2030, required: false });
  });

  it("skips unknown visualisations", () => {
    const before = state();
    expect(setYear(before, 2030, null, ["Nope"]).visualisations).toBe(before.visualisations);
  });

  it("leaves other panes' override objects untouched", () => {
    let next = setYear(state(), 2030, ["left"]);
    const leftOverrides = next.paneOverrides.left;
    next = {
      ...next,
      ...applyVisualisationParam(next, {
        visualisationNames: [VIS],
        panes: null,
        field: "pathParams",
        paramName: "metric",
        value: "jobs",
      }),
    };
    expect(next.paneOverrides.left).toBe(leftOverrides);
  });
});

describe("applyPaneData", () => {
  it("stores each pane's data and keeps all of it on the page copy", () => {
    let next = state();
    next = { ...next, ...applyPaneData(next, { visualisationName: VIS, data: [{ id: 1 }], paneId: "left" }) };
    next = { ...next, ...applyPaneData(next, { visualisationName: VIS, data: [{ id: 2 }], paneId: "right" }) };
    expect(next.paneData).toEqual({ left: { [VIS]: [{ id: 1 }] }, right: { [VIS]: [{ id: 2 }] } });
    expect(next.visualisations[VIS].data).toEqual([{ id: 1 }, { id: 2 }]);
  });

  it("keeps the very data on the page copy when one pane shows the visualisation", () => {
    const data = [{ id: 3 }];
    const next = applyPaneData(state(), { visualisationName: "Flows", data, paneId: "right" });
    expect(next.visualisations.Flows.data).toBe(data);
  });

  it("puts data without a pane on the page copy only", () => {
    const data = [{ id: 4 }];
    const next = applyPaneData(state(), { visualisationName: VIS, data });
    expect(next.visualisations[VIS].data).toBe(data);
    expect(next.paneData).toEqual({});
  });

  it("ignores non-array data when combining", () => {
    let next = state();
    next = { ...next, ...applyPaneData(next, { visualisationName: VIS, data: { odd: true }, paneId: "left" }) };
    next = { ...next, ...applyPaneData(next, { visualisationName: VIS, data: [{ id: 2 }], paneId: "right" }) };
    expect(next.visualisations[VIS].data).toEqual([{ id: 2 }]);
  });
});

describe("applyLayerParam", () => {
  const template = "/tiles/{z}/{x}/{y}?spec={spec}";
  const layer = (extra = {}) => ({ pathTemplate: template, path: template, missingParams: ["spec"], ...extra });

  it("changes the single path of an ordinary layer, whichever panes are targeted", () => {
    const next = applyLayerParam(layer(), state(), { layerName: "links", paramName: "spec", value: "A", panes: ["left"] });
    expect(next.path).toBe("/tiles/{z}/{x}/{y}?spec=A");
    expect(next.missingParams).toEqual([]);
    expect(next.panePaths).toBeUndefined();
  });

  it("gives a separate-paths layer a path per pane", () => {
    const next = applyLayerParam(layer({ separatePanePaths: true }), state(), {
      layerName: "links",
      paramName: "spec",
      value: "B",
      panes: ["right"],
    });
    expect(next.panePaths).toEqual({ left: template, right: "/tiles/{z}/{x}/{y}?spec=B" });
    expect(next.paneMissingParams).toEqual({ left: ["spec"], right: [] });
    expect(next.missingParams).toEqual(["spec"]);
    expect(next.path).toBe(template);
  });
});

describe("pane maps", () => {
  const left = { name: "left" };
  const right = { name: "right" };

  it("registers maps per pane, with state.map following the primary pane", () => {
    let s = state();
    s = { ...s, ...setPaneMap(s, { paneId: "right", map: right }) };
    expect(s.map).toBe(right);
    s = { ...s, ...setPaneMap(s, { paneId: "left", map: left }) };
    expect(s.mapsByPane).toEqual({ left, right });
    expect(s.map).toBe(left);
  });

  it("unregisters a pane's map, unless another map has replaced it", () => {
    let s = state();
    s = { ...s, ...setPaneMap(s, { paneId: "left", map: left }) };
    const replacement = { name: "left again" };
    s = { ...s, ...setPaneMap(s, { paneId: "left", map: replacement }) };

    s = { ...s, ...removePaneMap(s, { paneId: "left", map: left }) };
    expect(s.mapsByPane.left).toBe(replacement);

    s = { ...s, ...removePaneMap(s, { paneId: "left", map: replacement }) };
    expect(s.mapsByPane).toEqual({});
    expect(s.map).toBeNull();
  });
});
