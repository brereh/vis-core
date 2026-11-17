/**
 * The map grid and its panes, on both page presets: a single map (one pane, "main") and a
 * side-by-side page (two synced panes, "left" and "right").
 *
 * Written against fake maps (testing/mapLibreFake.js), so the tests describe what each pane
 * shows. They replace the former Map.test and DualMaps.test: each behaviour is asserted once
 * and runs for both presets where it applies.
 */
import { act, render, screen } from "@testing-library/react";
import { ThemeProvider } from "styled-components";
import { MapContext } from "contexts/MapContext";
import { FilterContext } from "contexts/FilterContext";
import { createFakeMap, createFeature, FakePopup, resetMapLibreFake } from "testing/mapLibreFake";
import { useMapBrowserEnv } from "testing/browserEnv";
import { resolveMapGrid } from "../../map/resolveMapGrid";
import { getBaseMap } from "../../map/baseMaps";

jest.mock("maplibre-gl", () => require("testing/mapLibreFake").mapLibreModule());
jest.mock("hooks/useMap", () => ({ useMap: jest.fn() }));
jest.mock("hooks/useBaseMapTransition", () => ({ useBaseMapTransition: jest.fn() }));
jest.mock("@mapbox/mapbox-gl-draw", () => {
  class MapboxDraw {
    constructor(options) {
      this.options = options;
    }
  }
  MapboxDraw.modes = {};
  return { __esModule: true, default: MapboxDraw };
});
jest.mock("@ookla/mapbox-gl-draw-rectangle", () => ({ RectangleMode: {} }));
// Stand-ins that record what each pane renders (they draw nothing).
jest.mock("./Layer", () => ({ Layer: jest.fn(() => null) }));
jest.mock("./SpiderLayer", () => ({ SpiderLayer: jest.fn(() => null) }));
jest.mock("./MapVisualisation", () => ({ MapVisualisation: jest.fn(() => null) }));
jest.mock("./CalloutCards/BaseCalloutCardVisualisation", () => ({ BaseCalloutCardVisualisation: () => null }));
jest.mock("Components/ScrollableContainer", () => ({
  ScrollableContainer: ({ children }) => <div data-testid="callout-card-stack">{children}</div>,
}));
jest.mock("Components/DynamicLegend/DynamicLegend", () => ({
  DynamicLegend: ({ map, title }) => (
    <div data-testid="legend">
      {title ? `${title}: ` : ""}
      {map?.name}
    </div>
  ),
}));
jest.mock("./MapStyleToggle", () => ({
  __esModule: true,
  default: ({ map }) => <div data-testid="style-toggle">{map?.name}</div>,
}));

import { useMap } from "hooks/useMap";
import { useBaseMapTransition } from "hooks/useBaseMapTransition";
import { Layer } from "./Layer";
import { SpiderLayer } from "./SpiderLayer";
import { MapVisualisation } from "./MapVisualisation";
import MapGrid from "./MapGrid";

/** The latest props each stand-in was rendered with, by a key. */
const latestProps = (component, keyOf) => {
  const byKey = new Map();
  component.mock.calls.forEach(([props]) => byKey.set(keyOf(props), props));
  return byKey;
};

const LNG_LAT = { lng: -1.55, lat: 53.8 };
const POINT = { x: 10, y: 20 };
const ZONES = "zones";

const PRESETS = [
  ["a single-map page", "MapLayout", ["main"]],
  ["a side-by-side page", "DualMapLayout", ["left", "right"]],
];

const zone = (id, value, extra = {}) =>
  createFeature({ id, layerId: ZONES, sourceLayer: "z", properties: { name: `Zone ${id}`, zoneId: id }, state: { value }, ...extra });

/** A fake map with the zones layer, rendering `features` under any point. */
const paneMap = (name, features = []) => {
  const map = createFakeMap({ name, renderedFeatures: features, initialSources: { [ZONES]: { type: "vector" } } });
  map.addLayer({ id: ZONES, type: "fill", source: ZONES });
  return map;
};

/**
 * Renders the grid for a page of the given type. Each pane gets the map `mapFor(paneId)`.
 * State is static: dispatches are recorded, not applied.
 */
const renderGrid = ({
  type = "MapLayout",
  ready = true,
  layers = { [ZONES]: { name: ZONES, shouldHaveTooltipOnHover: true } },
  visualisations = {},
  filters = [],
  mapFor = (paneId) => paneMap(paneId),
  state: extraState = {},
  props = {},
  gridConfig,
} = {}) => {
  const grid = resolveMapGrid({
    type,
    config: {
      layers: Object.keys(layers).map((name) => ({ name })),
      visualisations: Object.entries(visualisations).map(([name, vis]) => ({ name, ...vis })),
      ...(gridConfig ? { grid: gridConfig } : {}),
    },
  });
  const maps = Object.fromEntries(grid.paneIds.map((paneId) => [paneId, mapFor(paneId)]));
  const queue = grid.paneIds.map((paneId) => maps[paneId]);
  const mapByContainer = new WeakMap();
  const readiness = { ready };
  useMap.mockImplementation((containerRef) => {
    if (!mapByContainer.has(containerRef)) mapByContainer.set(containerRef, queue.shift());
    const isReady = readiness.ready;
    return { map: mapByContainer.get(containerRef), isMapReady: isReady, isMapLoaded: isReady, isMapStyleLoaded: isReady };
  });

  const state = {
    mapStyle: "style.json",
    mapCentre: [-1.5, 53.8],
    mapZoom: 9,
    baseMapId: undefined,
    mapGrid: grid,
    // Panes register their maps once ready.
    mapsByPane: ready ? maps : {},
    map: ready ? maps[grid.primaryPaneId] : null,
    layers,
    visualisations,
    filters,
    paneOverrides: {},
    paneData: {},
    visualisedFeatureIds: {},
    mapBoundsAndCentroid: null,
    ...extraState,
  };
  const dispatch = jest.fn();
  const filterDispatch = jest.fn();
  const tree = (current) => (
    <ThemeProvider theme={{ mq: { mobile: "(max-width: 900px)" } }}>
      <FilterContext.Provider value={{ state: {}, dispatch: filterDispatch }}>
        <MapContext.Provider value={{ state: current, dispatch }}>
          <MapGrid extraCopyrightText="TfN" {...props} />
        </MapContext.Provider>
      </FilterContext.Provider>
    </ThemeProvider>
  );
  const view = render(tree(state));
  return {
    ...view,
    maps,
    grid,
    state,
    dispatch,
    filterDispatch,
    rerenderWith: (changes) => view.rerender(tree({ ...state, ...changes })),
    /** Lets the maps finish loading, as their panes would register them. */
    becomeReady: () => {
      readiness.ready = true;
      view.rerender(tree({ ...state, mapsByPane: maps, map: maps[grid.primaryPaneId] }));
    },
  };
};

const dispatched = (dispatch, type) =>
  dispatch.mock.calls.map(([action]) => action).filter((action) => action.type === type);

const popupOn = (map) => FakePopup.open().find((popup) => popup.map === map);

useMapBrowserEnv({ immediateAnimationFrames: true });
beforeEach(() => resetMapLibreFake());

describe.each(PRESETS)("on %s", (_, type, paneIds) => {
  it("builds one map per pane from the page's style and view", () => {
    renderGrid({ type });
    expect(useMap).toHaveBeenCalledWith(
      expect.anything(),
      "style.json",
      [-1.5, 53.8],
      9,
      "TfN",
      expect.objectContaining({ compactAttribution: paneIds.length > 1, tileCacheSize: 500 })
    );
    const containers = new Set(useMap.mock.calls.map(([ref]) => ref));
    expect(containers.size).toBe(paneIds.length);
  });

  it("draws the callout cards once, and hides the base-map toggle by default", () => {
    renderGrid({ type });
    expect(screen.getAllByTestId("callout-card-stack")).toHaveLength(1);
    expect(screen.queryByTestId("style-toggle")).not.toBeInTheDocument();
  });

  it("applies base-map changes to every pane's map", () => {
    const { maps, state } = renderGrid({ type });
    const { maps: transitionMaps, applicationLayers, descriptor } = useBaseMapTransition.mock.calls.at(-1)[0];
    expect(transitionMaps).toEqual(paneIds.map((id) => maps[id]));
    expect(applicationLayers).toBe(state.layers);
    expect(descriptor).toBe(getBaseMap(state.baseMapId));
  });

  describe("what each pane draws", () => {
    const layers = {
      [ZONES]: { name: ZONES, type: "tile", geometryType: "polygon" },
      stations: { name: "stations", type: "tile", geometryType: "point", spiderfyOverlappingPoints: true },
    };
    const visualisations = {
      Accessibility: { type: "joinDataToMap" },
      Flows: { type: "geojson" },
      Summary: { type: "calloutCard" },
    };

    it("renders each layer, spider layer and map visualisation on every pane, with that pane's map", () => {
      const { maps } = renderGrid({ type, layers, visualisations });
      const layerProps = latestProps(Layer, (p) => `${p.paneId}:${p.layer.name}`);
      const spiderProps = latestProps(SpiderLayer, (p) => `${p.map?.name}:${p.baseLayerId}`);
      const visProps = latestProps(MapVisualisation, (p) => `${p.paneId}:${p.visualisationName}`);

      paneIds.forEach((id) => {
        [ZONES, "stations"].forEach((name) => expect(layerProps.get(`${id}:${name}`).map).toBe(maps[id]));
        expect(spiderProps.get(`${id}:stations`)).toBeDefined();
        expect(visProps.get(`${id}:Accessibility`).map).toBe(maps[id]);
        expect(visProps.get(`${id}:Flows`).map).toBe(maps[id]);
        expect(visProps.has(`${id}:Summary`)).toBe(false);
      });
      expect(spiderProps.size).toBe(paneIds.length);
    });

    it("gives layers no map until it has loaded, then the pane's map", () => {
      const { maps, becomeReady } = renderGrid({ type, layers, visualisations, ready: false });
      Layer.mock.calls.forEach(([props]) => expect(props.map).toBeNull());
      SpiderLayer.mock.calls.forEach(([props]) => expect(props.map).toBeNull());
      expect(screen.queryByTestId("legend")).not.toBeInTheDocument();

      // Map visualisations get the map straight away, as before.
      const earlyVisProps = latestProps(MapVisualisation, (p) => `${p.paneId}:${p.visualisationName}`);
      paneIds.forEach((id) => expect(earlyVisProps.get(`${id}:Accessibility`).map).toBe(maps[id]));

      Layer.mockClear();
      SpiderLayer.mockClear();
      becomeReady();
      const layerProps = latestProps(Layer, (p) => `${p.paneId}:${p.layer.name}`);
      paneIds.forEach((id) => expect(layerProps.get(`${id}:${ZONES}`).map).toBe(maps[id]));
      const spiderMaps = SpiderLayer.mock.calls.map(([props]) => props.map);
      paneIds.forEach((id) => expect(spiderMaps).toContain(maps[id]));
      expect(screen.getByTestId("legend")).toBeInTheDocument();
    });

    it("draws no card stack without visualisations", () => {
      renderGrid({ type, state: { visualisations: undefined } });
      expect(screen.queryByTestId("callout-card-stack")).not.toBeInTheDocument();
    });
  });

  it("puts the draw control for feature selection on the primary pane only", () => {
    const { maps, grid, dispatch } = renderGrid({ type });
    expect(dispatched(dispatch, "SET_DRAW_INSTANCE")).toHaveLength(1);
    expect(maps[grid.primaryPaneId].addControl).toHaveBeenCalledWith(expect.objectContaining({ options: expect.anything() }));
  });

  it("reports each zoom change once, from the primary pane, whichever pane is zoomed", () => {
    const { maps, dispatch } = renderGrid({ type });
    paneIds.forEach((id, index) => {
      dispatch.mockClear();
      maps[id].setZoom(11 + index);
      // Synced panes zoom together; only the primary pane reports it.
      expect(dispatched(dispatch, "STORE_CURRENT_ZOOM")).toEqual([{ type: "STORE_CURRENT_ZOOM", payload: 11 + index }]);
    });
  });

  describe("hover", () => {
    const hoverOn = (map, point = POINT) => map.fire("mousemove", { point, lngLat: LNG_LAT });

    it("shows a tooltip on every pane, each with its own feature, and marks it hovered", () => {
      const { maps } = renderGrid({ type, mapFor: (id) => paneMap(id, [zone(7, id.length)]) });
      hoverOn(maps[paneIds[0]]);

      expect(FakePopup.open()).toHaveLength(paneIds.length);
      paneIds.forEach((id) => {
        expect(popupOn(maps[id]).html).toContain("Zone 7");
        expect(popupOn(maps[id]).lngLat).toEqual(LNG_LAT);
        expect(maps[id].getFeatureState({ source: ZONES, sourceLayer: "z", id: 7 }).hover).toBe(true);
      });
    });

    it("clears every pane's tooltip and hover state when the pointer leaves", () => {
      const { maps } = renderGrid({ type, mapFor: (id) => paneMap(id, [zone(7, 1)]) });
      hoverOn(maps[paneIds[0]]);

      maps[paneIds[0]].getCanvas().dispatchEvent(new Event("mouseleave"));

      expect(FakePopup.open()).toEqual([]);
      paneIds.forEach((id) => {
        expect(maps[id].getFeatureState({ source: ZONES, sourceLayer: "z", id: 7 }).hover).toBe(false);
      });
    });

    it("clears the tooltips when the pointer moves off every feature", () => {
      const { maps } = renderGrid({ type, mapFor: (id) => paneMap(id, [zone(7, 1)]) });
      hoverOn(maps[paneIds[0]]);
      paneIds.forEach((id) => maps[id].setRenderedFeatures([]));
      hoverOn(maps[paneIds[0]], { x: 400, y: 400 });
      expect(FakePopup.open()).toEqual([]);
    });

    it("ignores a pointer event without a point", () => {
      const { maps } = renderGrid({ type, mapFor: (id) => paneMap(id, [zone(7, 1)]) });
      maps[paneIds[0]].fire("mousemove", { lngLat: LNG_LAT });
      expect(FakePopup.open()).toEqual([]);
    });

    it("shows a pointer cursor over layers with tooltips", () => {
      const { maps } = renderGrid({ type });
      paneIds.forEach((id) => {
        maps[id].fire("mouseenter", {}, { layerId: ZONES });
        expect(maps[id].getCanvas().style.cursor).toBe("pointer");
        maps[id].fire("mouseleave", {}, { layerId: ZONES });
        expect(maps[id].getCanvas().style.cursor).toBe("grab");
      });
    });

    it("shows nothing for layers without hover tooltips", () => {
      const { maps } = renderGrid({
        type,
        layers: { [ZONES]: { name: ZONES } },
        mapFor: (id) => paneMap(id, [zone(7, 1)]),
      });
      hoverOn(maps[paneIds[0]]);
      expect(FakePopup.open()).toEqual([]);
    });

    it("adds one mousemove listener per map, and removes every listener on unmount", () => {
      const { maps, unmount, rerenderWith } = renderGrid({ type });
      rerenderWith({ layers: { [ZONES]: { name: ZONES, shouldHaveTooltipOnHover: true, bufferSize: 2 } } });
      paneIds.forEach((id) => expect(maps[id].listenerCount("mousemove")).toBe(1));

      unmount();

      paneIds.forEach((id) => {
        ["mousemove", "click", "touchend", "zoomend", "moveend", "mouseenter", "mouseleave", "move"].forEach((event) =>
          expect(maps[id].listenerCount(event)).toBe(0)
        );
      });
    });
  });

  describe("layer-click popups", () => {
    it("open on every pane for the feature there", () => {
      const { maps } = renderGrid({
        type,
        layers: { [ZONES]: { name: ZONES, shouldHaveTooltipOnClick: true } },
        mapFor: (id) => paneMap(id, [zone(7, id.length)]),
      });
      maps[paneIds[0]].fire("click", { point: POINT, lngLat: LNG_LAT });

      paneIds.forEach((id) => {
        expect(popupOn(maps[id]).html).toBe(`<p>Zone 7</p><p> Id: 7</p><p>Value: ${id.length}</p>`);
        expect(popupOn(maps[id]).options).toMatchObject({ closeOnClick: false });
      });
    });

    it("close when the data changes, so they never show a stale value", () => {
      const { maps, rerenderWith } = renderGrid({
        type,
        layers: { [ZONES]: { name: ZONES, shouldHaveTooltipOnClick: true } },
        mapFor: (id) => paneMap(id, [zone(7, 1)]),
      });
      maps[paneIds[0]].fire("click", { point: POINT, lngLat: LNG_LAT });
      expect(FakePopup.open()).toHaveLength(paneIds.length);

      rerenderWith({ visualisations: { Vis: { type: "joinDataToMap", data: [{ id: 7, value: 2 }] } } });

      expect(FakePopup.open()).toEqual([]);
    });
  });

  describe("labels", () => {
    it("are added on every pane once it zooms past the layer's label zoom", () => {
      const { maps } = renderGrid({
        type,
        layers: { [ZONES]: { name: ZONES, shouldHaveLabel: true, labelZoomLevel: 10, sourceLayer: "z" } },
        mapFor: (id) => {
          const map = paneMap(id);
          map.setSourceFeatures([{ geometry: { type: "Polygon" } }]);
          return map;
        },
      });
      paneIds.forEach((id) => maps[id].setZoom(11));
      paneIds.forEach((id) => expect(maps[id].getLayer(`${ZONES}-label`)).toBeDefined());
    });
  });

  describe("visualised features", () => {
    it("show only the listed features on every pane", () => {
      const { maps } = renderGrid({ type, state: { visualisedFeatureIds: { [ZONES]: [{ value: "3" }, { value: "5" }] } } });
      paneIds.forEach((id) => {
        expect(maps[id].getFilter(ZONES)).toEqual(["in", ["get", "id"], ["literal", [3, 5]]]);
      });
    });

    it("leave a layer's filter alone when other layer state changes", () => {
      const { maps, rerenderWith, state } = renderGrid({ type });
      const ownFilter = ["!=", ["feature-state", "value"], null];
      paneIds.forEach((id) => maps[id].setFilter(ZONES, ownFilter));

      rerenderWith({ layers: { [ZONES]: { ...state.layers[ZONES], class_method: "q" } } });

      paneIds.forEach((id) => expect(maps[id].getFilter(ZONES)).toBe(ownFilter));
    });
  });

  it("keeps the draw control on the primary pane, whatever the feature-select filters target", () => {
    const select = { id: "select", type: "mapFeatureSelect", layer: ZONES, panes: [paneIds.at(-1)], actions: [] };
    const { maps, grid } = renderGrid({ type, filters: [select] });
    paneIds.forEach((id) => expect(maps[id].addControl).toHaveBeenCalledTimes(id === grid.primaryPaneId ? 1 : 0));
  });

  describe("feature focus", () => {
    const bounds = {
      type: "Polygon",
      coordinates: [[[-2, 53], [-1, 53], [-1, 54], [-2, 54], [-2, 53]]],
    };

    it("fits the primary pane to the feature, labels it on every pane, and clears the request", () => {
      const { maps, grid, dispatch } = renderGrid({
        type,
        state: {
          mapBoundsAndCentroid: { bounds, centroid: { type: "Point", coordinates: [-1.5, 53.5] }, featureName: "Leeds" },
        },
      });
      expect(maps[grid.primaryPaneId].fitBounds).toHaveBeenCalledTimes(1);
      paneIds.forEach((id) => {
        expect(maps[id].getSource("feature-label-source").data.properties.name).toBe("Leeds");
      });
      // The other panes follow the primary through camera sync.
      paneIds.forEach((id) => expect(maps[id].getCenter()).toEqual({ lng: -1.5, lat: 53.5 }));
      expect(dispatched(dispatch, "CLEAR_BOUNDS_AND_CENTROID")).toHaveLength(1);
    });
  });

  describe("map-click filters", () => {
    const zoneFilter = { id: "zone", type: "map", layer: ZONES, field: "zoneId", panes: paneIds, actions: [{ action: "UPDATE_QUERY_PARAMS" }] };

    it("send each pane the zone under the click on its own map", () => {
      const { maps, dispatch, filterDispatch } = renderGrid({
        type,
        filters: [zoneFilter],
        mapFor: (id) => paneMap(id, [zone(id === "right" ? 2 : 1, 1)]),
      });
      maps[paneIds[0]].fire("click", { point: POINT, lngLat: LNG_LAT });

      expect(dispatched(dispatch, "UPDATE_QUERY_PARAMS").map(({ payload }) => [payload.panes, payload.value])).toEqual(
        paneIds.map((id) => [[id], id === "right" ? 2 : 1])
      );
      expect(filterDispatch).toHaveBeenCalledWith({ type: "SET_FILTER_VALUE", payload: { filterId: "zone", value: 1 } });
      paneIds.forEach((id) =>
        expect(maps[id].getFeatureState({ source: ZONES, sourceLayer: "z", id: id === "right" ? 2 : 1 }).selected).toBe(true)
      );
    });
  });

  describe("viewport filters", () => {
    it("store the viewport of the filter's first pane", () => {
      const viewport = { id: "view", type: "mapViewport", panes: paneIds, actions: [] };
      const { filterDispatch } = renderGrid({ type, filters: [viewport] });
      const stored = filterDispatch.mock.calls.filter(([a]) => a.payload.filterId === "view");
      expect(stored).toHaveLength(1);
      expect(stored[0][0].payload.value).toMatchObject({ west: -1, east: 1, zoom: 10 });
    });
  });
});

describe("the legend", () => {
  it("lists the single map's layers", () => {
    renderGrid();
    expect(screen.getByTestId("legend")).toHaveTextContent("main");
  });

  it.each([
    ["the right pane when both have data", { left: [1], right: [1] }, "right"],
    ["the right pane when neither has data", {}, "right"],
    ["the left pane when only it has data", { left: [1] }, "left"],
    ["the right pane when only it has data", { right: [1] }, "right"],
  ])("on a side-by-side page uses %s", (_, data, expected) => {
    renderGrid({
      type: "DualMapLayout",
      visualisations: { Vis: { type: "joinDataToMap" } },
      state: { paneData: Object.fromEntries(Object.entries(data).map(([pane, d]) => [pane, { Vis: d }])) },
    });
    expect(screen.getByTestId("legend")).toHaveTextContent(expected);
  });
});

describe("hover pacing", () => {
  describe("with real animation frames", () => {
    let frames;
    beforeEach(() => {
      frames = [];
      window.requestAnimationFrame = (callback) => frames.push(callback);
      window.cancelAnimationFrame = (id) => {
        frames[id - 1] = null;
      };
    });
    const runFrames = () => {
      const pending = frames;
      frames = [];
      pending.forEach((callback) => callback?.());
    };

    it("runs one hover pass per frame, with the latest pointer position", () => {
      const { maps } = renderGrid({ mapFor: (id) => paneMap(id, [zone(7, 1)]) });
      maps.main.queryRenderedFeatures.mockClear();
      [1, 2, 3].forEach((x) => maps.main.fire("mousemove", { point: { x, y: 1 }, lngLat: LNG_LAT }));
      expect(frames).toHaveLength(1);
      act(() => runFrames());
      expect(FakePopup.open()).toHaveLength(1);
    });

    it("drops a pending hover pass when the pointer leaves", () => {
      const { maps } = renderGrid({ mapFor: (id) => paneMap(id, [zone(7, 1)]) });
      maps.main.fire("mousemove", { point: POINT, lngLat: LNG_LAT });
      maps.main.getCanvas().dispatchEvent(new Event("mouseleave"));
      act(() => runFrames());
      expect(FakePopup.open()).toEqual([]);
    });
  });
});

describe("taps on a side-by-side page, on a touch device without hover", () => {
  useMapBrowserEnv({ matches: (query) => query.includes("hover: none"), immediateAnimationFrames: true });

  it("show the tapped feature on the tapped pane and the feature there on the other", async () => {
    const { maps } = renderGrid({
      type: "DualMapLayout",
      layers: { [ZONES]: { name: ZONES, shouldHaveTooltipOnClick: true } },
      mapFor: (id) => paneMap(id, [zone(id === "left" ? 1 : 2, 1)]),
    });
    jest.useFakeTimers();
    try {
      maps.left.fire("click", { point: POINT, lngLat: LNG_LAT });
      act(() => jest.runAllTimers());
    } finally {
      jest.useRealTimers();
    }
    expect(popupOn(maps.left).html).toContain("Zone 1");
    expect(popupOn(maps.right).html).toContain("Zone 2");
  });

  it("clear both panes' tooltips on a tap where there is nothing", () => {
    const { maps } = renderGrid({
      type: "DualMapLayout",
      layers: { [ZONES]: { name: ZONES, shouldHaveTooltipOnClick: true } },
      mapFor: (id) => paneMap(id, [zone(1, 1)]),
    });
    jest.useFakeTimers();
    try {
      maps.left.fire("click", { point: POINT, lngLat: LNG_LAT });
      act(() => jest.runAllTimers());
      expect(FakePopup.open()).toHaveLength(2);
      maps.left.setRenderedFeatures([]);
      maps.left.fire("click", { point: { x: 300, y: 300 }, lngLat: LNG_LAT });
    } finally {
      jest.useRealTimers();
    }
    expect(FakePopup.open()).toEqual([]);
  });
});

describe("a configured grid", () => {
  const dashboard = {
    columns: [2, 1],
    rows: 2,
    cells: [
      { id: "overview", column: 1, row: 1, rowSpan: 2, title: "Overview", syncGroup: null },
      { id: "base", column: 2, row: 1, title: "Base year" },
      { id: "future", column: 2, row: 2, title: "2040", classification: "own" },
    ],
  };
  const cellOf = (container, id) => container.querySelector(`[data-cell-id="${id}"]`);

  it("lays the cells out with their sizes and spans", () => {
    const { container } = renderGrid({ gridConfig: dashboard });
    const gridElement = cellOf(container, "overview").parentElement;
    expect(getComputedStyle(gridElement).gridTemplateColumns).toBe("minmax(0, 2fr) minmax(0, 1fr)");
    expect(getComputedStyle(gridElement).gridTemplateRows).toBe("minmax(0, 1fr) minmax(0, 1fr)");
    expect(cellOf(container, "overview").style.gridRow).toBe("1 / span 2");
    expect(cellOf(container, "future").style.gridColumn).toBe("2 / span 1");
  });

  it("builds a map per map cell, with compact attribution and a share of the tile cache", () => {
    renderGrid({ gridConfig: dashboard });
    const containers = new Set(useMap.mock.calls.map(([ref]) => ref));
    expect(containers.size).toBe(3);
    expect(useMap.mock.calls[0][5]).toEqual({ compactAttribution: true, tileCacheSize: 333 });
  });

  it("names each titled pane as a region", () => {
    renderGrid({ gridConfig: dashboard });
    expect(screen.getByRole("region", { name: "2040" })).toBeInTheDocument();
  });

  it("leaves a cell of a type it can't render empty", () => {
    const { container } = renderGrid({
      gridConfig: { columns: 2, rows: 1, cells: [{ id: "map" }, { id: "notes", type: "text", column: 2 }] },
    });
    expect(cellOf(container, "notes")).toBeEmptyDOMElement();
    expect(new Set(useMap.mock.calls.map(([ref]) => ref)).size).toBe(1);
  });

  it("keeps a pane without a sync group out of the others' camera and hover", () => {
    const { maps } = renderGrid({ gridConfig: dashboard, mapFor: (id) => paneMap(id, [zone(7, 1)]) });
    maps.base.jumpTo({ center: [3, 4] });
    expect(maps.future.getCenter()).toEqual({ lng: 3, lat: 4 });
    expect(maps.overview.getCenter()).not.toEqual({ lng: 3, lat: 4 });

    maps.base.fire("mousemove", { point: POINT, lngLat: LNG_LAT });
    expect(popupOn(maps.base)).toBeDefined();
    expect(popupOn(maps.future)).toBeDefined();
    expect(popupOn(maps.overview)).toBeUndefined();
  });

  it("shows a legend for each group of panes sharing colour classes, headed with their titles", () => {
    renderGrid({ gridConfig: dashboard });
    const legends = screen.getAllByTestId("legend").map((legend) => legend.textContent);
    expect(legends).toEqual(["Overview + Base year: base", "2040: future"]);
  });

  describe("feature focus", () => {
    const bounds = { type: "Polygon", coordinates: [[[-2, 53], [-1, 53], [-1, 54], [-2, 54], [-2, 53]]] };
    const focus = (panes) => ({
      mapBoundsAndCentroid: { bounds, centroid: { type: "Point", coordinates: [-1.5, 53.5] }, featureName: "Leeds", panes },
    });
    const labelOn = (map) => map.getSource("feature-label-source")?.data.properties.name;

    it("moves one target pane per sync group and labels the targets and their groups", () => {
      const { maps } = renderGrid({ gridConfig: dashboard, state: focus(["overview", "future"]) });
      expect(maps.overview.fitBounds).toHaveBeenCalledTimes(1);
      expect(maps.future.fitBounds).toHaveBeenCalledTimes(1);
      expect(maps.base.fitBounds).not.toHaveBeenCalled();
      expect(maps.base.getCenter()).toEqual({ lng: -1.5, lat: 53.5 });
      ["overview", "base", "future"].forEach((id) => expect(labelOn(maps[id])).toBe("Leeds"));
    });

    it("leaves panes outside the targets' groups alone", () => {
      const { maps } = renderGrid({ gridConfig: dashboard, state: focus(["base"]) });
      expect(maps.base.fitBounds).toHaveBeenCalledTimes(1);
      expect(maps.overview.fitBounds).not.toHaveBeenCalled();
      expect(labelOn(maps.overview)).toBeUndefined();
      expect(labelOn(maps.future)).toBe("Leeds");
    });

    it("moves the primary pane when the request names no pane", () => {
      const { maps } = renderGrid({ gridConfig: dashboard, state: focus(undefined) });
      expect(maps.overview.fitBounds).toHaveBeenCalledTimes(1);
      expect(maps.base.fitBounds).not.toHaveBeenCalled();
    });
  });

  it("puts the draw control on the pane the feature-select filters target", () => {
    const select = { id: "select", type: "mapFeatureSelect", layer: ZONES, panes: ["future"], actions: [] };
    const { maps } = renderGrid({ gridConfig: dashboard, filters: [select] });
    expect(maps.future.addControl).toHaveBeenCalledTimes(1);
    expect(maps.overview.addControl).not.toHaveBeenCalled();
  });

  it("names untitled groups by their panes when there are several legends", () => {
    renderGrid({
      gridConfig: { columns: 2, rows: 1, cells: [{ id: "a" }, { id: "b", column: 2, classification: "own" }] },
    });
    expect(screen.getAllByTestId("legend").map((legend) => legend.textContent)).toEqual(["a: a", "b: b"]);
  });

  it("shows one untitled legend when every pane shares colour classes", () => {
    renderGrid({
      gridConfig: { columns: 2, rows: 1, cells: [{ id: "a", title: "A" }, { id: "b", column: 2, title: "B" }] },
    });
    expect(screen.getAllByTestId("legend").map((legend) => legend.textContent)).toEqual(["b"]);
  });
});

describe("a pane whose map loses its WebGL context", () => {
  it("says the map can't be drawn until the page is reloaded, and clears when restored", () => {
    const { maps } = renderGrid();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();

    act(() => maps.main.fire("webglcontextlost"));
    expect(screen.getByRole("alert")).toHaveTextContent(/Reload the page/);

    act(() => maps.main.fire("webglcontextrestored"));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
