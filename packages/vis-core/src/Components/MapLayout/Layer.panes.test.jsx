/**
 * Layers on a side-by-side page: each pane's map should get each layer once.
 *
 * Only `renderLayerOnPanes` knows how panes render layers today: DualMaps renders every
 * <Layer> once per pane, and each instance adds itself to every map in `state.maps`.
 * Phase 3 of docs/Map Panes Consolidation Plan.md gives each pane its own <Layer map=…>,
 * and only that helper changes.
 */
import { render, waitFor } from "@testing-library/react";
import { MapContext } from "contexts/MapContext";
import { FilterContext } from "contexts/FilterContext";
import { createFakeMap } from "testing/mapLibreFake";

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

/** A fake map that records, rather than throws on, a second addSource for the same id. */
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
  map.style = {};
  return map;
};

// --- probe: the only place that knows how panes render layers today ---------------------

const renderLayerOnPanes = (layer, maps) =>
  render(
    <FilterContext.Provider value={{ state: {}, dispatch: jest.fn() }}>
      <MapContext.Provider
        value={{
          state: {
            map: maps.left,
            maps: [maps.left, maps.right],
            layers: { [layer.name]: layer },
            filters: [],
            paramNameToUuidMap: {},
          },
          dispatch: jest.fn(),
        }}
      >
        {/* DualMaps renders the layer list once inside each pane's container. */}
        <Layer layer={layer} />
        <Layer layer={layer} />
      </MapContext.Provider>
    </FilterContext.Provider>
  );

// ------------------------------------------------------------------------------------------

beforeEach(() => {
  api.geodataService.getLayer.mockResolvedValue({ type: "FeatureCollection", features: [] });
  api.geodataService.buildTileLayerUrl.mockImplementation((path) => `http://tiles${path}`);
});

describe("layers on side-by-side panes", () => {
  it("adds a tile layer's source to each pane's map once", () => {
    const maps = { left: recordingMap("left"), right: recordingMap("right") };
    renderLayerOnPanes(tileLayer, maps);

    [maps.left, maps.right].forEach((map) => {
      expect(map.getSource("Zones")).toBeDefined();
      expect(map.getLayer("Zones")).toBeDefined();
      expect(map.duplicateSources).toEqual([]);
    });
  });
});

describe("known drift (plan §2.2(7)): GeoJSON layers are set up twice", () => {
  test.failing("adds a GeoJSON layer's source to each pane's map once", async () => {
    const maps = { left: recordingMap("left"), right: recordingMap("right") };
    renderLayerOnPanes(geojsonLayer, maps);

    await waitFor(() => {
      expect(maps.left.getSource("Stations")).toBeDefined();
      expect(maps.right.getSource("Stations")).toBeDefined();
    });
    expect(maps.left.duplicateSources).toEqual([]);
    expect(maps.right.duplicateSources).toEqual([]);
  });

  test.failing("fetches a GeoJSON layer once per pane", async () => {
    const maps = { left: recordingMap("left"), right: recordingMap("right") };
    renderLayerOnPanes(geojsonLayer, maps);

    await waitFor(() => expect(maps.right.getSource("Stations")).toBeDefined());
    expect(api.geodataService.getLayer).toHaveBeenCalledTimes(2);
  });
});
