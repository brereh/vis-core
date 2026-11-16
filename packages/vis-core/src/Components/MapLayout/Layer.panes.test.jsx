/**
 * Layers on a side-by-side page: each pane's map should get each layer once, with that
 * pane's tiles.
 *
 * Only the probes (`renderLayerOnPanes`) know how panes render layers today: DualMaps renders
 * every <Layer> once per pane, and each instance adds itself to every map in `state.maps`.
 * Phase 3 of docs/Map Panes Consolidation Plan.md gives each pane its own <Layer map=…>, and
 * only the probes change.
 *
 * "known drift" tests use `test.failing`. Their preconditions are pinned by ordinary tests
 * next to them, so a broken setup can't make a known-drift test pass by accident.
 */
import { act, render, waitFor } from "@testing-library/react";
import { MapContext } from "contexts/MapContext";
import { FilterContext } from "contexts/FilterContext";
import { createFakeMap } from "testing/mapLibreFake";
import { resolveMapGrid } from "../../map/resolveMapGrid";

jest.mock("maplibre-gl", () => require("testing/mapLibreFake").mapLibreModule());
jest.mock("services", () => ({
  api: {
    geodataService: {
      getLayer: jest.fn(),
      buildTileLayerUrl: jest.fn(),
    },
  },
}));

import { api } from "services";
import { Layer } from "./Layer";

const geojsonLayer = {
  name: "Stations",
  type: "geojson",
  geometryType: "point",
  path: "/api/stations",
  isHoverable: true,
};

const tileLayer = {
  name: "Zones",
  type: "tile",
  source: "api",
  geometryType: "polygon",
  path: "/api/vectortiles/zones/{z}/{x}/{y}",
  sourceLayer: "zones",
};

/** A tile layer whose path differs per side (filters target one side's network). */
const panePathLayer = {
  name: "Network",
  type: "tile",
  source: "api",
  geometryType: "line",
  sourceLayer: "links",
  pathTemplate: "/api/network/{z}/{x}/{y}?spec={spec}",
  path: "/api/network/{z}/{x}/{y}?spec=A",
  separateSidePaths: true,
  panePaths: {
    left: "/api/network/{z}/{x}/{y}?spec=A",
    right: "/api/network/{z}/{x}/{y}?spec=B",
  },
  missingParams: [],
};

/**
 * A fake map that records, rather than throws on, a second addSource for the same id, and
 * collects duplicate-layer errors without logging them.
 */
const recordingMap = (name) => {
  const map = createFakeMap({ name });
  map.duplicateSources = [];
  const addSource = map.addSource.getMockImplementation();
  map.addSource.mockImplementation((id, spec) => {
    if (map.getSource(id)) {
      map.duplicateSources.push(id);
      return map;
    }
    return addSource(id, spec);
  });
  map.on("error", () => {});
  map.style = {};
  return map;
};

const createPaneMaps = () => ({ left: recordingMap("left"), right: recordingMap("right") });

/** Lets the GeoJSON fetches resolve and their callbacks run. */
const flushFetches = () =>
  act(async () => {
    for (let i = 0; i < 10; i += 1) await Promise.resolve();
  });

// --- probes: the only place that knows how panes render layers today ---------------------

/** Map context for the panes. Built once per render so its identity is stable, as in the app. */
const paneContext = (layer, maps) => ({
  state: {
    mapGrid: resolveMapGrid({ type: "DualMapLayout", config: { layers: [layer] } }),
    map: maps.left,
    mapsByPane: { left: maps.left, right: maps.right },
    layers: { [layer.name]: layer },
    filters: [],
    paramNameToUuidMap: {},
  },
  dispatch: jest.fn(),
});

const panes = (layer, context, paneCount = 2) => (
  <FilterContext.Provider value={{ state: {}, dispatch: jest.fn() }}>
    <MapContext.Provider value={context}>
      {/* DualMaps renders the layer list once inside each pane's container, and each
          instance adds the layer to every registered pane map. */}
      {Array.from({ length: paneCount }, (_, i) => (
        <Layer key={i} layer={layer} />
      ))}
    </MapContext.Provider>
  </FilterContext.Provider>
);

/**
 * Renders the layer on both panes. `stopShowingOnOnePane()` re-renders with the layer still
 * shown on one pane only, as when one pane no longer shows it.
 */
const renderLayerOnPanes = (layer, maps) => {
  const context = paneContext(layer, maps);
  const view = render(panes(layer, context));
  return { ...view, stopShowingOnOnePane: () => view.rerender(panes(layer, context, 1)) };
};

// ------------------------------------------------------------------------------------------

beforeEach(() => {
  api.geodataService.getLayer.mockResolvedValue({ type: "FeatureCollection", features: [] });
  api.geodataService.buildTileLayerUrl.mockImplementation((path) => `http://tiles${path}`);
});

describe("layers on side-by-side panes", () => {
  it("adds a tile layer's source and layer to each pane's map once", () => {
    const maps = createPaneMaps();
    renderLayerOnPanes(tileLayer, maps);

    [maps.left, maps.right].forEach((map) => {
      expect(map.getSource("Zones").tiles).toEqual(["http://tiles/api/vectortiles/zones/{z}/{x}/{y}"]);
      expect(map.getLayer("Zones")).toBeDefined();
      expect(map.duplicateSources).toEqual([]);
      expect(map.errors).toEqual([]);
    });
  });

  it("gives each pane its own side's tiles for a layer with separate side paths", () => {
    const maps = createPaneMaps();
    renderLayerOnPanes(panePathLayer, maps);

    expect(maps.left.getSource("Network").tiles).toEqual(["http://tiles/api/network/{z}/{x}/{y}?spec=A"]);
    expect(maps.right.getSource("Network").tiles).toEqual(["http://tiles/api/network/{z}/{x}/{y}?spec=B"]);
    expect(maps.left.getLayer("Network").metadata.path).toBe(panePathLayer.panePaths.left);
    expect(maps.right.getLayer("Network").metadata.path).toBe(panePathLayer.panePaths.right);
  });

  it("adds a GeoJSON layer's source to both panes' maps", async () => {
    const maps = createPaneMaps();
    renderLayerOnPanes(geojsonLayer, maps);

    await waitFor(() => {
      expect(maps.left.getSource("Stations")).toBeDefined();
      expect(maps.right.getSource("Stations")).toBeDefined();
    });
  });
});

describe("known drift (plan §2.2(7)): each pane's layer is set up by both panes", () => {
  test.failing("adds a GeoJSON layer's source to each pane's map only once", async () => {
    const maps = createPaneMaps();
    renderLayerOnPanes(geojsonLayer, maps);
    await waitFor(() => {
      expect(maps.left.getSource("Stations")).toBeDefined();
      expect(maps.right.getSource("Stations")).toBeDefined();
    });
    await flushFetches();

    expect(maps.left.duplicateSources).toEqual([]);
    expect(maps.right.duplicateSources).toEqual([]);
  });

  test.failing("fetches a GeoJSON layer once per pane", async () => {
    const maps = createPaneMaps();
    renderLayerOnPanes(geojsonLayer, maps);
    await flushFetches();

    // "At most" rather than exactly two: panes showing the same layer may share one fetch
    // later (plan §3.8). The ordinary test above pins that the layer reaches both maps.
    expect(api.geodataService.getLayer.mock.calls.length).toBeLessThanOrEqual(2);
  });

  test.failing("keeps the layer on a pane that still shows it", () => {
    const maps = createPaneMaps();
    const { stopShowingOnOnePane } = renderLayerOnPanes(tileLayer, maps);

    stopShowingOnOnePane();

    // At least one pane still shows the layer, so at least one map must still have it.
    expect([maps.left, maps.right].some((map) => map.getLayer("Zones"))).toBe(true);
  });
});
