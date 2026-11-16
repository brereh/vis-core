/**
 * Map-pane behaviour of the map reducer: what each pane of a side-by-side page sees.
 *
 * These tests describe behaviour, not state shape. They read and set up state only through
 * the probes below, which know today's left/right layout. When the reducer moves to
 * pane-keyed state (docs/Map Panes Consolidation Plan.md, Phase 2), only the probes change.
 *
 * "known drift" tests use `test.failing`: they state the intended behaviour and fail today
 * because of the bugs listed in §2.2 of the plan. The phase that fixes each bug turns it
 * into an ordinary test.
 */
import { actionTypes, mapReducer } from "./mapReducer";
import { DisplayMode } from "enums";

// --- probes: the only place that knows the state layout ------------------------------

/** The visualisation as the given pane ("left" | "right") draws it. */
const paneVisualisation = (state, pane, visName) =>
  pane === "left" ? state.leftVisualisations[visName] : state.rightVisualisations[visName];

/** The data the given pane holds for a visualisation. */
const paneData = (state, pane, visName) => paneVisualisation(state, pane, visName)?.data;

/** The map instances registered for the page. */
const registeredMaps = (state) => [state.map, ...(state.maps ?? [])].filter(Boolean);

/** Registers maps for a side-by-side page, as DualMaps does once its maps are ready. */
const registerDualMaps = (state, left, right) => {
  const withMap = mapReducer(state, { type: actionTypes.SET_MAP, payload: { map: left } });
  return mapReducer(withMap, { type: actionTypes.SET_DUAL_MAPS, payload: { maps: [left, right] } });
};

// --- helpers ----------------------------------------------------------------------------

const VIS = "Accessibility Side";

const baseState = () => ({
  filters: [],
  layers: {},
  visualisations: {},
  leftVisualisations: {},
  rightVisualisations: {},
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
    state = mapReducer(state, {
      type: actionTypes.UPDATE_ALL_DATA,
      payload: { visualisationName: VIS, data: [{ id: 1, value: 10 }], left: true },
    });
    state = mapReducer(state, {
      type: actionTypes.UPDATE_ALL_DATA,
      payload: { visualisationName: VIS, data: [{ id: 1, value: 99 }], left: false },
    });

    expect(paneData(state, "left", VIS)).toEqual([{ id: 1, value: 10 }]);
    expect(paneData(state, "right", VIS)).toEqual([{ id: 1, value: 99 }]);
  });
});

// --- known drift: intended behaviour that fails today (plan §2.2) ------------------------

describe("known drift (plan §2.2(5)): changes after load reach the panes", () => {
  test.failing("a legend text change reaches both panes", () => {
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

  test.failing("a display mode change reaches both panes", () => {
    let state = withVisualisation();
    state = mapReducer(state, {
      type: actionTypes.UPDATE_DISPLAY_MODE,
      payload: { filter: filter("mode"), value: DisplayMode.DIFFERENCE },
    });

    expect(paneVisualisation(state, "left", VIS).displayMode).toBe(DisplayMode.DIFFERENCE);
    expect(paneVisualisation(state, "right", VIS).displayMode).toBe(DisplayMode.DIFFERENCE);
  });

  test.failing("a query param set by a filter that isn't side-specific reaches both panes", () => {
    let state = withVisualisation();
    state = mapReducer(state, {
      type: actionTypes.UPDATE_QUERY_PARAMS,
      payload: { filter: filter("year"), value: 2040 },
    });

    expect(queryParam(state, "left", "year")).toBe(2040);
    expect(queryParam(state, "right", "year")).toBe(2040);
  });

  test.failing("a path param set by a filter that isn't side-specific reaches both panes", () => {
    let state = withVisualisation();
    state = mapReducer(state, {
      type: actionTypes.UPDATE_PATH_PARAMS,
      payload: { filter: filter("metric"), value: "jobs" },
    });

    expect(pathParam(state, "left", "metric")).toBe("jobs");
    expect(pathParam(state, "right", "metric")).toBe("jobs");
  });
});

describe("known drift (plan §2.2(6)): page reset forgets the maps", () => {
  test.failing("RESET_CONTEXT leaves no map registered", () => {
    let state = withVisualisation();
    state = registerDualMaps(state, { name: "left" }, { name: "right" });
    expect(registeredMaps(state)).not.toHaveLength(0);

    state = mapReducer(state, { type: actionTypes.RESET_CONTEXT });

    expect(registeredMaps(state)).toEqual([]);
  });
});
