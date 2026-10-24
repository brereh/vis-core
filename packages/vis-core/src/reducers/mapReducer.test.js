import { actionTypes, mapReducer } from "./mapReducer";
import { DisplayMode, DEFAULT_DISPLAY_MODE } from "enums";

describe("mapReducer categorical legend cache", () => {
  it("registers categorical legend entries without replacing the existing cache", () => {
    const initialState = {
      categoricalLegendCache: {
        "value::a": {
          label: "A",
          colour: "#111111",
          fieldName: "value",
          schemeName: "scheme-a",
        },
      },
    };

    const nextState = mapReducer(initialState, {
      type: actionTypes.REGISTER_CATEGORICAL_LEGEND_ITEMS,
      payload: {
        "value::b": {
          label: "B",
          colour: "#222222",
          fieldName: "value",
          schemeName: "scheme-a",
        },
      },
    });

    expect(nextState.categoricalLegendCache).toEqual({
      "value::a": {
        label: "A",
        colour: "#111111",
        fieldName: "value",
        schemeName: "scheme-a",
      },
      "value::b": {
        label: "B",
        colour: "#222222",
        fieldName: "value",
        schemeName: "scheme-a",
      },
    });
  });

  it("merges categorical legend cache updates over existing keys", () => {
    const initialState = {
      categoricalLegendCache: {
        "value::a": {
          label: "A",
          colour: "#111111",
          fieldName: "value",
          schemeName: "scheme-a",
        },
      },
    };

    const nextState = mapReducer(initialState, {
      type: actionTypes.MERGE_CATEGORICAL_LEGEND_CACHE,
      payload: {
        "value::a": {
          label: "A",
          colour: "#ff0000",
          fieldName: "value",
          schemeName: "scheme-b",
        },
      },
    });

    expect(nextState.categoricalLegendCache["value::a"]).toEqual({
      label: "A",
      colour: "#ff0000",
      fieldName: "value",
      schemeName: "scheme-b",
    });
  });

  it("preserves the categorical legend cache when resetting page context", () => {
    const initialState = {
      categoricalLegendCache: {
        "value::a": {
          label: "A",
          colour: "#111111",
          fieldName: "value",
          schemeName: "scheme-a",
        },
      },
      layers: { layerA: { id: "layerA" } },
      visualisations: { visA: { id: "visA" } },
      colorSchemesByLayer: { layerA: { value: "YlGnBu", label: "YlGnBu" } },
      filters: [{ id: "filter-a" }],
      leftVisualisations: { leftA: {} },
      rightVisualisations: { rightA: {} },
      isLoading: false,
      pageIsReady: true,
      selectionMode: "single",
      selectionLayer: "layerA",
      selectedFeatures: [1],
      isFeatureSelectActive: true,
      visualisedFeatureIds: [1],
    };

    const nextState = mapReducer(initialState, {
      type: actionTypes.RESET_CONTEXT,
    });

    expect(nextState.categoricalLegendCache).toEqual(initialState.categoricalLegendCache);
    expect(nextState.layers).toEqual({});
    expect(nextState.visualisations).toEqual({});
    expect(nextState.filters).toEqual([]);
  });

  it("clears the categorical legend cache explicitly", () => {
    const initialState = {
      categoricalLegendCache: {
        "value::a": {
          label: "A",
          colour: "#111111",
          fieldName: "value",
          schemeName: "scheme-a",
        },
      },
    };

    const nextState = mapReducer(initialState, {
      type: actionTypes.CLEAR_CATEGORICAL_LEGEND_CACHE,
    });

    expect(nextState.categoricalLegendCache).toEqual({});
  });

  it("updates baseMapId and mapStyle atomically on SET_BASE_MAP", () => {
    const initialState = {
      baseMapId: "positron",
      mapStyle: "https://maps.geoapify.com/v1/styles/positron/style.json",
    };

    const nextState = mapReducer(initialState, {
      type: actionTypes.SET_BASE_MAP,
      payload: "darkMatter",
    });

    expect(nextState.baseMapId).toBe("darkMatter");
    expect(nextState.mapStyle).toBe("https://tiles.openfreemap.org/styles/dark");
  });

  it("updates colour scheme and marks custom colour scheme as selected", () => {
    const initialState = {
      colorSchemesByLayer: {},
      customColorSchemeSelectedByLayer: {},
    };

    const nextState = mapReducer(initialState, {
      type: actionTypes.UPDATE_COLOR_SCHEME,
      payload: {
        layerName: "layerA",
        color_scheme: { value: "Purples", label: "Purples" },
      },
    });

    expect(nextState.colorSchemesByLayer.layerA).toEqual({
      value: "Purples",
      label: "Purples",
    });
    expect(nextState.customColorSchemeSelectedByLayer.layerA).toBe(true);
  });
});

describe("mapReducer display mode", () => {
  const makeState = () => ({
    visualisations: {
      "Link Totals": { displayMode: DEFAULT_DISPLAY_MODE, queryParams: {} },
      "Zone Totals": { displayMode: DEFAULT_DISPLAY_MODE, queryParams: {} },
    },
  });

  it("gives every added visualisation a display mode", () => {
    const nextState = mapReducer(
      { visualisations: {} },
      {
        type: actionTypes.ADD_VISUALISATION,
        payload: { "Link Totals": { queryParams: {} } },
      }
    );

    expect(nextState.visualisations["Link Totals"].displayMode).toBe(
      DEFAULT_DISPLAY_MODE
    );
  });

  it("honours a display mode pinned in page configuration", () => {
    const nextState = mapReducer(
      { visualisations: {} },
      {
        type: actionTypes.ADD_VISUALISATION,
        payload: {
          "Link Difference": { displayMode: DisplayMode.DIFFERENCE, queryParams: {} },
        },
      }
    );

    expect(nextState.visualisations["Link Difference"].displayMode).toBe(
      DisplayMode.DIFFERENCE
    );
  });

  it("tracks the selected mode on the named visualisations", () => {
    const nextState = mapReducer(makeState(), {
      type: actionTypes.UPDATE_DISPLAY_MODE,
      payload: {
        filter: { visualisations: ["Link Totals"] },
        value: DisplayMode.PCT_DIFFERENCE,
      },
    });

    expect(nextState.visualisations["Link Totals"].displayMode).toBe(
      DisplayMode.PCT_DIFFERENCE
    );
    expect(nextState.visualisations["Zone Totals"].displayMode).toBe(
      DEFAULT_DISPLAY_MODE
    );
  });

  it("applies to every visualisation when the filter names none", () => {
    const nextState = mapReducer(makeState(), {
      type: actionTypes.UPDATE_DISPLAY_MODE,
      payload: {
        filter: { visualisations: null },
        value: DisplayMode.PCT_DIFFERENCE,
      },
    });

    expect(nextState.visualisations["Link Totals"].displayMode).toBe(
      DisplayMode.PCT_DIFFERENCE
    );
    expect(nextState.visualisations["Zone Totals"].displayMode).toBe(
      DisplayMode.PCT_DIFFERENCE
    );
  });

  it("falls back to the default rather than storing an unknown mode", () => {
    const nextState = mapReducer(makeState(), {
      type: actionTypes.UPDATE_DISPLAY_MODE,
      payload: { filter: { visualisations: ["Link Totals"] }, value: "nonsense" },
    });

    expect(nextState.visualisations["Link Totals"].displayMode).toBe(
      DEFAULT_DISPLAY_MODE
    );
  });

  it("ignores visualisations that are not on the page", () => {
    const state = makeState();
    const nextState = mapReducer(state, {
      type: actionTypes.UPDATE_DISPLAY_MODE,
      payload: {
        filter: { visualisations: ["Absent Visualisation"] },
        value: DisplayMode.PCT_DIFFERENCE,
      },
    });

    expect(nextState.visualisations["Absent Visualisation"]).toBeUndefined();
    expect(nextState.visualisations["Link Totals"].displayMode).toBe(
      DEFAULT_DISPLAY_MODE
    );
  });

  it("leaves the rest of the visualisation untouched", () => {
    const nextState = mapReducer(makeState(), {
      type: actionTypes.UPDATE_DISPLAY_MODE,
      payload: {
        filter: { visualisations: ["Link Totals"] },
        value: DisplayMode.PCT_DIFFERENCE,
      },
    });

    expect(nextState.visualisations["Link Totals"].queryParams).toEqual({});
  });
});

describe("mapReducer UPDATE_PARAMETERISED_LAYER with separateSidePaths", () => {
  const template =
    "/api/norms/vectortiles/links/{z}/{x}/{y}?network_spec={network_spec}&year={year}";
  const initialState = {
    layers: {
      links: {
        name: "links",
        separateSidePaths: true,
        pathTemplate: template,
        path: template,
        missingParams: ["network_spec", "year"],
      },
    },
  };
  const update = (state, paramName, value, sides) =>
    mapReducer(state, {
      type: actionTypes.UPDATE_PARAMETERISED_LAYER,
      payload: { targetLayer: "links", filter: { paramName }, value, sides },
    });

  it("changes only its own side for a Left or Right filter", () => {
    const state = update(initialState, "network_spec", "A", "left");
    const layer = state.layers.links;

    expect(layer.sidePaths.left).toContain("network_spec=A");
    expect(layer.sidePaths.right).toContain("network_spec={network_spec}");
    expect(layer.path).toBe(template);
    expect(layer.sideMissingParams).toEqual({
      left: ["year"],
      right: ["network_spec", "year"],
    });
    expect(layer.missingParams).toEqual(["year", "network_spec"]);
  });

  it.each([
    ["side filters first", [["network_spec", "A", "left"], ["year", "2030", "both"], ["network_spec", "B", "right"]]],
    ["shared filter first", [["year", "2030", "both"], ["network_spec", "A", "left"], ["network_spec", "B", "right"]]],
    ["shared filter without sides", [["network_spec", "A", "left"], ["year", "2030", undefined], ["network_spec", "B", "right"]]],
  ])("resolves every param whatever the order (%s)", (_, updates) => {
    const state = updates.reduce(
      (current, [paramName, value, sides]) => update(current, paramName, value, sides),
      initialState
    );
    const layer = state.layers.links;

    expect(layer.missingParams).toEqual([]);
    expect(layer.sidePaths.left).toContain("network_spec=A&year=2030");
    expect(layer.sidePaths.right).toContain("network_spec=B&year=2030");
  });

  it("applies a later shared filter change to both sides and to layer.path", () => {
    let state = update(initialState, "network_spec", "A", "left");
    state = update(state, "network_spec", "B", "right");
    state = update(state, "year", "2030", "both");
    state = update(state, "year", "2040", "both");
    const layer = state.layers.links;

    expect(layer.sidePaths.left).toContain("network_spec=A&year=2040");
    expect(layer.sidePaths.right).toContain("network_spec=B&year=2040");
    expect(layer.path).toContain("year=2040");
  });
});
describe("mapReducer with a multi-parameter dateRange filter", () => {
  const filter = {
    type: "dateRange",
    paramName: ["date_from", "date_to"],
    extraToggle: { paramName: "include_excluded", label: "Include excluded days" },
    visualisations: ["Counts"],
  };
  const value = ["2025-10-06", "2025-10-19", true];

  it("updates both date query params and the toggle param", () => {
    const state = mapReducer(
      { visualisations: { Counts: { queryParams: { date_from: { value: null, required: true } } } } },
      { type: actionTypes.UPDATE_QUERY_PARAMS, payload: { filter, value } }
    );

    expect(state.visualisations.Counts.queryParams).toEqual({
      date_from: { value: "2025-10-06", required: true },
      date_to: { value: "2025-10-19", required: false },
      include_excluded: { value: true, required: false },
    });
  });

  it("updates every param of a parameterised layer and clears them from missingParams", () => {
    const template = "/api/vectortiles/sites/{z}/{x}/{y}?date_from={date_from}&date_to={date_to}&include_excluded={include_excluded}";
    const state = mapReducer(
      {
        layers: {
          sites: {
            pathTemplate: template,
            path: template,
            missingParams: ["date_from", "date_to", "include_excluded"],
          },
        },
      },
      { type: actionTypes.UPDATE_PARAMETERISED_LAYER, payload: { targetLayer: "sites", filter, value } }
    );

    expect(state.layers.sites.path).toContain("date_from=2025-10-06&date_to=2025-10-19&include_excluded=true");
    expect(state.layers.sites.missingParams).toEqual([]);
  });
});
