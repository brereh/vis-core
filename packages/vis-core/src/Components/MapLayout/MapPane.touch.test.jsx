/**
 * Tap tooltips on a single-map page, on touch devices without hover.
 *
 * On these devices a tap stands in for hover: the tapped feature's tooltip opens, including
 * on layers that only configure click tooltips (whose click popups are skipped on touch).
 */
import { render, waitFor } from "@testing-library/react";
import { ThemeProvider } from "styled-components";
import { MapContext } from "contexts/MapContext";
import { FilterContext } from "contexts/FilterContext";
import { createFakeMap, createFeature, FakePopup, resetMapLibreFake } from "testing/mapLibreFake";
import { useMapBrowserEnv } from "testing/browserEnv";
import { resolveMapGrid } from "../../map/resolveMapGrid";

jest.mock("maplibre-gl", () => require("testing/mapLibreFake").mapLibreModule());
jest.mock("hooks/useMap", () => ({ useMap: jest.fn() }));
jest.mock("hooks/useBaseMapTransition", () => ({ useBaseMapTransition: jest.fn() }));
jest.mock("./Layer", () => ({ Layer: () => null }));
jest.mock("./SpiderLayer", () => ({ SpiderLayer: () => null }));
jest.mock("./CalloutCardStack", () => ({ CalloutCardStack: () => null }));
jest.mock("./MapVisualisation", () => ({ MapVisualisation: () => null }));
jest.mock("Components/DynamicLegend/DynamicLegend", () => ({ DynamicLegend: () => null }));

import { useMap } from "hooks/useMap";
import MapGrid from "./MapGrid";

const LNG_LAT = { lng: -1.55, lat: 53.8 };

// A touch device without hover.
useMapBrowserEnv({ matches: (query) => query.includes("hover: none") });

beforeEach(() => resetMapLibreFake());

const renderMap = (map, layers) => {
  useMap.mockReturnValue({ map, isMapReady: true, isMapLoaded: true, isMapStyleLoaded: true });
  return render(
    <ThemeProvider theme={{ mq: { mobile: "(max-width: 900px)" } }}>
      <FilterContext.Provider value={{ state: {}, dispatch: jest.fn() }}>
        <MapContext.Provider
          value={{
            state: {
              mapGrid: resolveMapGrid({
                type: "MapLayout",
                config: { layers: Object.keys(layers).map((name) => ({ name })) },
              }),
              layers,
              visualisations: {},
              filters: [],
              visualisedFeatureIds: {},
              mapBoundsAndCentroid: null,
            },
            dispatch: jest.fn(),
          }}
        >
          <MapGrid extraCopyrightText="" />
        </MapContext.Provider>
      </FilterContext.Provider>
    </ThemeProvider>
  );
};

describe("tap tooltips", () => {
  it.each([
    ["with an id", 7],
    ["without an id (as GeoJSON features often are)", undefined],
  ])("opens the tooltip of a tapped feature %s on a click-tooltip layer", async (_, id) => {
    const feature = createFeature({ id, layerId: "stations", properties: { name: "Leeds Station" } });
    feature.id = id;
    const map = createFakeMap({ renderedFeatures: [feature] });
    map.addLayer({ id: "stations", type: "circle", source: "stations" });

    renderMap(map, { stations: { shouldHaveTooltipOnClick: true } });
    map.fire("click", { point: { x: 5, y: 5 }, lngLat: LNG_LAT });

    await waitFor(() => expect(FakePopup.open()).toHaveLength(1));
    expect(FakePopup.open()[0].html).toContain("Leeds Station");
    expect(FakePopup.open()[0].lngLat).toEqual(LNG_LAT);
  });

  it("clears the tooltip on a tap where there is no feature", async () => {
    const feature = createFeature({ id: 7, layerId: "stations", properties: { name: "Leeds Station" } });
    const map = createFakeMap({ renderedFeatures: [feature] });
    map.addLayer({ id: "stations", type: "circle", source: "stations" });
    renderMap(map, { stations: { shouldHaveTooltipOnClick: true } });

    map.fire("click", { point: { x: 5, y: 5 }, lngLat: LNG_LAT });
    await waitFor(() => expect(FakePopup.open()).toHaveLength(1));

    map.setRenderedFeatures([]);
    map.fire("click", { point: { x: 50, y: 50 }, lngLat: LNG_LAT });
    expect(FakePopup.open()).toEqual([]);
  });
});
