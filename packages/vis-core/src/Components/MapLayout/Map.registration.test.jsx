/**
 * The single map registering itself as the page's pane, using the real map reducer.
 */
import { useReducer } from "react";
import { act, render } from "@testing-library/react";
import { ThemeProvider } from "styled-components";
import { MapContext } from "contexts/MapContext";
import { FilterContext } from "contexts/FilterContext";
import { actionTypes, mapReducer } from "reducers";
import { selectMaps, selectPaneMap } from "reducers/mapSelectors";
import { resolveMapGrid } from "../../map/resolveMapGrid";
import { createFakeMap, resetMapLibreFake } from "testing/mapLibreFake";
import { useMapBrowserEnv } from "testing/browserEnv";

jest.mock("maplibre-gl", () => require("testing/mapLibreFake").mapLibreModule());
jest.mock("hooks/useMap", () => ({ useMap: jest.fn() }));
jest.mock("hooks/useBaseMapTransition", () => ({ useBaseMapTransition: jest.fn() }));
jest.mock("./Layer", () => ({ Layer: () => null }));
jest.mock("./SpiderLayer", () => ({ SpiderLayer: () => null }));
jest.mock("./VisualisationManager", () => ({ VisualisationManager: () => null }));
jest.mock("Components/DynamicLegend/DynamicLegend", () => ({ DynamicLegend: () => null }));

import { useMap } from "hooks/useMap";
import Map from "./Map";

useMapBrowserEnv();
beforeEach(() => resetMapLibreFake());

/**
 * Renders the map under a provider backed by the real reducer, exposing state and dispatch.
 * `hideMap()` unmounts the map while the provider stays.
 */
const renderWithReducer = (map) => {
  useMap.mockReturnValue({ map, isMapReady: true, isMapLoaded: true, isMapStyleLoaded: true });
  const latest = {};
  const Provider = ({ children }) => {
    const [state, dispatch] = useReducer(mapReducer, {
      mapGrid: resolveMapGrid({ type: "MapLayout" }),
      layers: {},
      visualisations: {},
      filters: [],
      visualisedFeatureIds: {},
      mapBoundsAndCentroid: null,
      mapsByPane: {},
    });
    latest.state = state;
    latest.dispatch = dispatch;
    return <MapContext.Provider value={{ state, dispatch }}>{children}</MapContext.Provider>;
  };
  const tree = (showMap) => (
    <ThemeProvider theme={{ mq: { mobile: "(max-width: 900px)" } }}>
      <FilterContext.Provider value={{ state: {}, dispatch: jest.fn() }}>
        <Provider>{showMap && <Map extraCopyrightText="" />}</Provider>
      </FilterContext.Provider>
    </ThemeProvider>
  );
  const view = render(tree(true));
  return { ...view, latest, hideMap: () => view.rerender(tree(false)) };
};

describe("single map registration", () => {
  it("registers its map as the page's only pane", () => {
    const map = createFakeMap();
    const { latest } = renderWithReducer(map);
    expect(selectPaneMap(latest.state, "main")).toBe(map);
    expect(latest.state.map).toBe(map);
  });

  it("registers again after a page reset clears the maps while it stays mounted", () => {
    const map = createFakeMap();
    const { latest } = renderWithReducer(map);

    act(() => latest.dispatch({ type: actionTypes.RESET_CONTEXT }));

    expect(selectMaps(latest.state)).toEqual([map]);
  });

  it("unregisters its map when it unmounts", () => {
    const map = createFakeMap();
    const { latest, hideMap } = renderWithReducer(map);
    expect(selectMaps(latest.state)).toEqual([map]);

    hideMap();

    expect(selectMaps(latest.state)).toEqual([]);
    expect(latest.state.map).toBeNull();
  });
});
