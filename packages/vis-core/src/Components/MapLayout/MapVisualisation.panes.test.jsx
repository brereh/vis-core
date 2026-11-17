/**
 * Classification across map panes: panes showing the same visualisation are coloured from
 * one set of classes, computed over all their data, so colours are comparable.
 *
 * Panes are set up only through `renderOnPanes` and `paneState`. Phase 2 of
 * docs/Map Panes Consolidation Plan.md moved them from left/right props and state to pane ids
 * and pane-keyed state; the assertions didn't change.
 */
import { render, waitFor } from "@testing-library/react";
import { MapContext } from "contexts/MapContext";
import { AppContext } from "contexts/AppContext";
import { MapVisualisation } from "./MapVisualisation";
import { createFakeMap } from "testing/mapLibreFake";
import { resolveMapGrid } from "../../map/resolveMapGrid";

jest.mock("maplibre-gl", () => require("testing/mapLibreFake").mapLibreModule());
jest.mock("hooks/useFetchVisualisationData", () => ({
  useFetchVisualisationData: jest.fn(),
}));
jest.mock("utils", () => ({
  ...jest.requireActual("utils"),
  reclassifyData: jest.fn(),
  createPaintProperty: jest.fn(),
}));
jest.mock("../../map/runtimeRestorationRegistry", () => ({
  registerMapRestorer: jest.fn(() => () => {}),
}));

import { useFetchVisualisationData } from "hooks/useFetchVisualisationData";
import { reclassifyData, createPaintProperty } from "utils";

const VIS = "Accessibility Side";
const LAYER = "zones";

const LEFT_DATA = [{ id: 1, value: 5 }, { id: 2, value: 10 }];
const RIGHT_DATA = [{ id: 1, value: 500 }, { id: 2, value: 1000 }];

const visualisation = {
  name: VIS,
  type: "joinDataToMap",
  joinLayer: LAYER,
  style: "polygon-continuous",
  queryParams: {},
};

// --- probes: the only place that knows how panes are wired today ----------------------

/** Map state for a side-by-side page whose panes hold the given data. */
const paneState = ({ left, right }) => ({
  mapGrid: resolveMapGrid({ type: "DualMapLayout", config: { visualisations: [visualisation] } }),
  visualisations: { [VIS]: { ...visualisation } },
  paneOverrides: {},
  paneData: { left: { [VIS]: left }, right: { [VIS]: right } },
});

/** Renders the visualisation once per pane, each on its own map. */
const renderOnPanes = (state, maps) =>
  render(
    <AppContext.Provider value={{ appPages: [{ url: "/" }], defaultBands: [] }}>
      <MapContext.Provider value={{ state, dispatch: jest.fn() }}>
        <MapVisualisation visualisationName={VIS} map={maps.left} paneId="left" />
        <MapVisualisation visualisationName={VIS} map={maps.right} paneId="right" />
      </MapContext.Provider>
    </AppContext.Provider>
  );

// ------------------------------------------------------------------------------------------

const mapWithLayer = (name) => {
  const map = createFakeMap({ name });
  map.addSource(LAYER, { type: "vector" });
  map.addLayer({ id: LAYER, type: "fill", source: LAYER, metadata: {} });
  return map;
};

beforeEach(() => {
  reclassifyData.mockReturnValue([0, 100, 1000]);
  createPaintProperty.mockReturnValue({ "fill-color": "#000", "fill-opacity": 0.65 });
});

describe("classification across side-by-side panes", () => {
  it("classifies each pane over both panes' data, and paints each with its own", async () => {
    const maps = { left: mapWithLayer("left"), right: mapWithLayer("right") };
    // Each pane's fetch returns its own data, as the hook does per pane.
    useFetchVisualisationData.mockImplementation((vis, { map }) => ({
      isLoading: false,
      data: map === maps.left ? LEFT_DATA : RIGHT_DATA,
      error: null,
      dataWasReturnedButFiltered: false,
      fetchState: "success",
      resetFetchState: jest.fn(),
    }));

    const state = {
      ...paneState({ left: LEFT_DATA, right: RIGHT_DATA }),
      layers: { [LAYER]: { name: LAYER, isStylable: true } },
      colorSchemesByLayer: {},
      customColorSchemeSelectedByLayer: {},
      categoricalLegendCache: {},
      filters: [],
    };

    renderOnPanes(state, maps);

    // At least once per pane; re-renders may classify again.
    await waitFor(() => expect(reclassifyData.mock.calls.length).toBeGreaterThanOrEqual(2));

    const combined = expect.arrayContaining([...LEFT_DATA, ...RIGHT_DATA]);
    reclassifyData.mock.calls.forEach(([dataToClassify]) => {
      expect(dataToClassify).toEqual(combined);
      expect(dataToClassify).toHaveLength(LEFT_DATA.length + RIGHT_DATA.length);
    });

    // Each map gets its own pane's values as feature state.
    await waitFor(() => {
      expect(maps.left.getFeatureState({ source: LAYER, sourceLayer: undefined, id: 2 }).value).toBe(10);
      expect(maps.right.getFeatureState({ source: LAYER, sourceLayer: undefined, id: 2 }).value).toBe(1000);
    });
  });
});

describe("a pane with its own classification", () => {
  it("classifies over its own data only, while the shared panes still combine theirs", async () => {
    const maps = { left: mapWithLayer("left"), right: mapWithLayer("right") };
    useFetchVisualisationData.mockImplementation((vis, { map }) => ({
      isLoading: false,
      data: map === maps.left ? LEFT_DATA : RIGHT_DATA,
      error: null,
      dataWasReturnedButFiltered: false,
      fetchState: "success",
      resetFetchState: jest.fn(),
    }));
    const base = paneState({ left: LEFT_DATA, right: RIGHT_DATA });
    const state = {
      ...base,
      // The right pane classifies on its own.
      mapGrid: { ...base.mapGrid, panes: [base.mapGrid.panes[0], { ...base.mapGrid.panes[1], classification: "own" }] },
      layers: { [LAYER]: { name: LAYER, isStylable: true } },
      colorSchemesByLayer: {},
      customColorSchemeSelectedByLayer: {},
      categoricalLegendCache: {},
      filters: [],
    };

    renderOnPanes(state, maps);
    await waitFor(() => expect(reclassifyData.mock.calls.length).toBeGreaterThanOrEqual(2));

    const classified = reclassifyData.mock.calls.map(([data]) => data);
    expect(classified).toContainEqual(LEFT_DATA);
    expect(classified).toContainEqual(RIGHT_DATA);
    classified.forEach((data) => expect(data).not.toHaveLength(LEFT_DATA.length + RIGHT_DATA.length));
  });
});
