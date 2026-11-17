/**
 * Map-pane behaviour of the map reducer: what each pane of a side-by-side page sees.
 *
 * These tests describe behaviour, not state shape. They read and set up state only through
 * the probes below. Phase 2 of docs/Map Panes Consolidation Plan.md moved the reducer from
 * left/right copies to pane-keyed state; only the probes changed, and the known-drift tests
 * for §2.2(5) and (6) became ordinary tests.
 */
import { actionTypes, mapReducer } from "./mapReducer";
import { selectMaps, selectPaneData, selectPaneVisualisation } from "./mapSelectors";
import { resolveMapGrid } from "../map/resolveMapGrid";
import { DisplayMode } from "enums";

// --- probes: the only place that knows the state layout ------------------------------

/** The visualisation as the given pane ("left" | "right") draws it. */
const paneVisualisation = (state, pane, visName) => selectPaneVisualisation(state, pane, visName);

/** The data the given pane holds for a visualisation. */
const paneData = (state, pane, visName) => selectPaneData(state, pane, visName);

/** Stores a pane's fetched data, as its MapVisualisation does. */
const storePaneData = (state, pane, visName, data) =>
  mapReducer(state, {
    type: actionTypes.UPDATE_ALL_DATA,
    payload: { visualisationName: visName, data, paneId: pane },
  });

/** The map instances registered for the page. */
const registeredMaps = (state) => selectMaps(state);

/** Registers maps for a side-by-side page, as each pane does once its map is ready. */
const registerDualMaps = (state, left, right) => {
  const withLeft = mapReducer(state, {
    type: actionTypes.SET_PANE_MAP,
    payload: { paneId: "left", map: left },
  });
  return mapReducer(withLeft, {
    type: actionTypes.SET_PANE_MAP,
    payload: { paneId: "right", map: right },
  });
};

// --- helpers ----------------------------------------------------------------------------

const VIS = "Accessibility Side";

/** A side-by-side page showing VIS on both panes. */
const baseState = () => ({
  filters: [],
  layers: {},
  visualisations: {},
  mapGrid: resolveMapGrid({
    type: "DualMapLayout",
    config: { visualisations: [{ name: VIS, type: "joinDataToMap" }] },
  }),
});

const withVisualisation = (state = baseState()) =>
  mapReducer(state, {
    type: actionTypes.ADD_VISUALISATION,
    payload: {
      [VIS]: {
        name: VIS,
        type: "joinDataToMap",
        joinLayer: "zones",
        style: "polygon-continuous",
        queryParams: { scenario: { value: null, required: true }, year: { value: null, required: true } },
        pathParams: { metric: { value: null, required: true } },
        legendText: [{ displayValue: "Old", legendSubtitleText: "old units" }],
      },
    },
  });

const filter = (paramName, extra = {}) => ({
  id: `filter-${paramName}`,
  paramName,
  filterName: paramName,
  visualisations: [VIS],
  ...extra,
});

const queryParam = (state, pane, name) => paneVisualisation(state, pane, VIS)?.queryParams?.[name]?.value;
const pathParam = (state, pane, name) => paneVisualisation(state, pane, VIS)?.pathParams?.[name]?.value;

// --- characterisation: behaviour to keep ----------------------------------------------

describe("side-by-side panes", () => {
  it("shows a newly added visualisation on both panes", () => {
    const state = withVisualisation();
    expect(paneVisualisation(state, "left", VIS)).toMatchObject({ name: VIS, joinLayer: "zones" });
    expect(paneVisualisation(state, "right", VIS)).toMatchObject({ name: VIS, joinLayer: "zones" });
  });

  describe.each([
    ["query", actionTypes.UPDATE_DUAL_QUERY_PARAMS, queryParam, "scenario"],
    ["path", actionTypes.UPDATE_DUAL_PATH_PARAMS, pathParam, "metric"],
  ])("%s params from a side's filter", (_, type, read, paramName) => {
    const update = (state, sides, value) =>
      mapReducer(state, { type, payload: { filter: filter(paramName), value, sides } });

    it("change only the left pane for a left filter", () => {
      const state = update(withVisualisation(), "left", "A");
      expect(read(state, "left", paramName)).toBe("A");
      expect(read(state, "right", paramName)).toBeNull();
    });

    it("change only the right pane for a right filter", () => {
      const state = update(withVisualisation(), "right", "B");
      expect(read(state, "left", paramName)).toBeNull();
      expect(read(state, "right", paramName)).toBe("B");
    });

    it("change both panes for a filter on both sides", () => {
      const state = update(withVisualisation(), "both", "C");
      expect(read(state, "left", paramName)).toBe("C");
      expect(read(state, "right", paramName)).toBe("C");
    });

    it("keep each pane's own value when the other side changes later", () => {
      let state = update(withVisualisation(), "left", "A");
      state = update(state, "right", "B");
      state = update(state, "left", "A2");
      expect(read(state, "left", paramName)).toBe("A2");
      expect(read(state, "right", paramName)).toBe("B");
    });
  });

  it("keeps a param set for both panes alongside per-pane params", () => {
    let state = withVisualisation();
    const set = (s, paramName, value, sides) =>
      mapReducer(s, {
        type: actionTypes.UPDATE_DUAL_QUERY_PARAMS,
        payload: { filter: filter(paramName), value, sides },
      });
    state = set(state, "scenario", "A", "left");
    state = set(state, "scenario", "B", "right");
    state = set(state, "year", 2030, "both");

    expect(queryParam(state, "left", "scenario")).toBe("A");
    expect(queryParam(state, "right", "scenario")).toBe("B");
    expect(queryParam(state, "left", "year")).toBe(2030);
    expect(queryParam(state, "right", "year")).toBe(2030);
  });

  it("stores fetched data per pane", () => {
    let state = withVisualisation();
    state = storePaneData(state, "left", VIS, [{ id: 1, value: 10 }]);
    state = storePaneData(state, "right", VIS, [{ id: 1, value: 99 }]);

    expect(paneData(state, "left", VIS)).toEqual([{ id: 1, value: 10 }]);
    expect(paneData(state, "right", VIS)).toEqual([{ id: 1, value: 99 }]);
  });
});

// --- known drift: intended behaviour that fails today (plan §2.2) ------------------------

describe("changes after load reach the panes (fixed drift, plan §2.2(5))", () => {
  test("a legend text change reaches both panes", () => {
    let state = withVisualisation();
    state = mapReducer(state, {
      type: actionTypes.UPDATE_LEGEND_TEXT,
      payload: {
        filter: {
          ...filter("metric"),
          values: { values: [{ paramValue: "jobs", displayValue: "Jobs", legendSubtitleText: "count" }] },
        },
        value: "jobs",
      },
    });

    expect(paneVisualisation(state, "left", VIS).legendText).toEqual([
      { displayValue: "Jobs", legendSubtitleText: "count" },
    ]);
    expect(paneVisualisation(state, "right", VIS).legendText).toEqual([
      { displayValue: "Jobs", legendSubtitleText: "count" },
    ]);
  });

  test("a display mode change reaches both panes", () => {
    let state = withVisualisation();
    state = mapReducer(state, {
      type: actionTypes.UPDATE_DISPLAY_MODE,
      payload: { filter: filter("mode"), value: DisplayMode.DIFFERENCE },
    });

    expect(paneVisualisation(state, "left", VIS).displayMode).toBe(DisplayMode.DIFFERENCE);
    expect(paneVisualisation(state, "right", VIS).displayMode).toBe(DisplayMode.DIFFERENCE);
  });

  test("a query param set by a filter that isn't side-specific reaches both panes", () => {
    let state = withVisualisation();
    state = mapReducer(state, {
      type: actionTypes.UPDATE_QUERY_PARAMS,
      payload: { filter: filter("year"), value: 2040 },
    });

    expect(queryParam(state, "left", "year")).toBe(2040);
    expect(queryParam(state, "right", "year")).toBe(2040);
  });

  test("a path param set by a filter that isn't side-specific reaches both panes", () => {
    let state = withVisualisation();
    state = mapReducer(state, {
      type: actionTypes.UPDATE_PATH_PARAMS,
      payload: { filter: filter("metric"), value: "jobs" },
    });

    expect(pathParam(state, "left", "metric")).toBe("jobs");
    expect(pathParam(state, "right", "metric")).toBe("jobs");
  });
});

describe("registered maps", () => {
  it("are recorded for a side-by-side page", () => {
    const state = registerDualMaps(withVisualisation(), { name: "left" }, { name: "right" });
    expect(registeredMaps(state).map((map) => map.name)).toEqual(
      expect.arrayContaining(["left", "right"])
    );
  });
});

describe("page reset forgets the maps (fixed drift, plan §2.2(6))", () => {
  test("RESET_CONTEXT leaves no map registered", () => {
    let state = registerDualMaps(withVisualisation(), { name: "left" }, { name: "right" });
    state = mapReducer(state, { type: actionTypes.RESET_CONTEXT });

    expect(registeredMaps(state)).toEqual([]);
  });
});
