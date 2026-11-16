/**
 * Behaviour of a side-by-side map page, written against fake maps so it describes what
 * the user sees on each pane rather than how the component calls MapLibre.
 *
 * Only `renderSideBySide` knows that DualMaps and useDualMaps provide the panes today.
 * Phase 3 of docs/Map Panes Consolidation Plan.md points it at the 1×2 grid preset; the
 * assertions stay as they are.
 *
 * "known drift" tests use `test.failing`: they describe the intended behaviour and fail
 * today because of the bugs in §2.2 of the plan.
 */
import { render, screen } from "@testing-library/react";
import { ThemeProvider } from "styled-components";
import { MapContext } from "contexts/MapContext";
import { FilterContext } from "contexts/FilterContext";
import { createFakeMap, createFeature, FakePopup } from "testing/mapLibreFake";
import { formatNumber } from "utils";

jest.mock("maplibre-gl", () => require("testing/mapLibreFake").mapLibreModule());
jest.mock("hooks/useDualMaps", () => ({ useDualMaps: jest.fn() }));
jest.mock("hooks/useBaseMapTransition", () => ({ useBaseMapTransition: jest.fn() }));
jest.mock("./Layer", () => ({ Layer: () => null }));
jest.mock("./MapVisualisation", () => ({ MapVisualisation: () => null }));
jest.mock("./CalloutCards/BaseCalloutCardVisualisation", () => ({
  BaseCalloutCardVisualisation: () => null,
}));
jest.mock("Components/ScrollableContainer", () => ({
  ScrollableContainer: ({ children }) => <div data-testid="callout-card-stack">{children}</div>,
}));
jest.mock("Components/DynamicLegend/DynamicLegend", () => ({
  DynamicLegend: () => <div data-testid="legend" />,
}));

import { useDualMaps } from "hooks/useDualMaps";
import DualMaps from "./DualMaps";

const LAYER = "zones";
const VIS = "Accessibility Side";
const LNG_LAT = { lng: -1.55, lat: 53.8 };

const visualisation = { name: VIS, type: "joinDataToMap", joinLayer: LAYER, data: [{ id: 7 }] };
const card = { name: "Summary", type: "calloutCard", data: [] };

/** A fake map that has the zones layer and renders `features` under any point. */
const paneMap = (name, features) => {
  const map = createFakeMap({ name, renderedFeatures: features });
  map.addSource(LAYER, { type: "vector" });
  map.addLayer({ id: LAYER, type: "fill", source: LAYER });
  return map;
};

const baseState = (layerConfig = {}) => ({
  mapStyle: "default",
  mapCentre: [0, 0],
  mapZoom: 10,
  baseMapId: undefined,
  filters: [],
  layers: {
    [LAYER]: { name: LAYER, visualisationName: VIS, shouldHaveTooltipOnHover: true, ...layerConfig },
  },
  visualisations: { [VIS]: visualisation, Summary: card },
  leftVisualisations: { [VIS]: visualisation, Summary: card },
  rightVisualisations: { [VIS]: visualisation, Summary: card },
  mapBoundsAndCentroid: null,
});

// --- probe: the only place that knows DualMaps provides the panes today -----------------

const renderSideBySide = ({ state, maps }) => {
  useDualMaps.mockReturnValue({
    leftMap: maps.left,
    rightMap: maps.right,
    isMapStyleLoaded: true,
    isMapLoaded: true,
    isMapReady: true,
  });
  return render(
    <ThemeProvider theme={{ mq: { mobile: "(max-width: 900px)" } }}>
      <FilterContext.Provider value={{ state: {}, dispatch: jest.fn() }}>
        <MapContext.Provider value={{ state, dispatch: jest.fn() }}>
          <DualMaps extraCopyrightText="" />
        </MapContext.Provider>
      </FilterContext.Provider>
    </ThemeProvider>
  );
};

// ------------------------------------------------------------------------------------------

const hover = (map) => map.fire("mousemove", { point: { x: 10, y: 20 }, lngLat: LNG_LAT });

const popupOn = (map) => FakePopup.open().find((popup) => popup.map === map);

beforeEach(() => {
  FakePopup.reset();
  // Run hover passes straight away instead of on the next animation frame.
  jest.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
    callback();
    return 1;
  });
  jest.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {});
  window.matchMedia = jest.fn().mockImplementation((query) => ({
    matches: false,
    media: query,
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    addListener: jest.fn(),
    removeListener: jest.fn(),
  }));
  global.ResizeObserver = jest.fn().mockImplementation(() => ({
    observe: jest.fn(),
    disconnect: jest.fn(),
  }));
});

describe("side-by-side hover", () => {
  it("shows a tooltip on both panes, each with its own pane's value", () => {
    const maps = {
      left: paneMap("left", [
        createFeature({ id: 7, layerId: LAYER, properties: { name: "Leeds" }, state: { value: 12 } }),
      ]),
      right: paneMap("right", [
        createFeature({ id: 7, layerId: LAYER, properties: { name: "Leeds" }, state: { value: 34 } }),
      ]),
    };
    renderSideBySide({ state: baseState(), maps });

    hover(maps.left);

    expect(FakePopup.open()).toHaveLength(2);
    expect(popupOn(maps.left).lngLat).toEqual(LNG_LAT);
    expect(popupOn(maps.right).lngLat).toEqual(LNG_LAT);
    expect(popupOn(maps.left).html).toContain("Leeds");
    expect(popupOn(maps.left).html).toContain("12");
    expect(popupOn(maps.right).html).toContain("34");
  });

  it("marks the hovered feature on each pane", () => {
    const feature = (value) =>
      createFeature({ id: 7, layerId: LAYER, properties: { name: "Leeds" }, state: { value } });
    const maps = { left: paneMap("left", [feature(1)]), right: paneMap("right", [feature(2)]) };
    renderSideBySide({ state: baseState(), maps });

    hover(maps.right);

    expect(maps.left.getFeatureState({ source: LAYER, id: 7 }).hover).toBe(true);
    expect(maps.right.getFeatureState({ source: LAYER, id: 7 }).hover).toBe(true);
  });
});

describe("side-by-side layer click popups", () => {
  it("opens a popup for the clicked feature on both panes", () => {
    const feature = (value) =>
      createFeature({ id: 7, layerId: LAYER, properties: { name: "Leeds", id: 7 }, state: { value } });
    const maps = { left: paneMap("left", [feature(1)]), right: paneMap("right", [feature(2)]) };
    renderSideBySide({
      state: baseState({ shouldHaveTooltipOnHover: false, shouldHaveTooltipOnClick: true }),
      maps,
    });

    maps.left.fire("click", { point: { x: 10, y: 20 }, lngLat: LNG_LAT });

    expect(popupOn(maps.left).html).toContain("Value: 1");
    expect(popupOn(maps.right).html).toContain("Value: 2");
  });
});

// --- known drift: intended behaviour that fails today (plan §2.2) ------------------------

describe("known drift (plan §2.2(1)): dual tooltips match the single map", () => {
  test.failing("formats the value as the single map does", () => {
    const value = 1234.5678;
    const feature = createFeature({ id: 7, layerId: LAYER, properties: { name: "Leeds" }, state: { value } });
    const maps = { left: paneMap("left", [feature]), right: paneMap("right", [feature]) };
    renderSideBySide({ state: baseState(), maps });

    hover(maps.left);

    expect(popupOn(maps.left).html).toContain(formatNumber(value));
  });

  test.failing("leaves the value out when the layer sets hideValueInTooltip", () => {
    const feature = createFeature({ id: 7, layerId: LAYER, properties: { name: "Leeds" }, state: { value: 4321 } });
    const maps = { left: paneMap("left", [feature]), right: paneMap("right", [feature]) };
    renderSideBySide({ state: baseState({ hideValueInTooltip: true }), maps });

    hover(maps.left);

    expect(popupOn(maps.left).html).toContain("Leeds");
    expect(popupOn(maps.left).html).not.toContain("4,321");
  });

  test.failing("shows the name of a feature that has no feature state yet", () => {
    const feature = createFeature({ id: 7, layerId: LAYER, properties: { name: "Leeds" } });
    delete feature.state;
    const maps = { left: paneMap("left", [feature]), right: paneMap("right", [feature]) };
    renderSideBySide({ state: baseState(), maps });

    hover(maps.left);

    expect(popupOn(maps.left).html).toContain("Leeds");
  });
});

describe("known drift (plan §2.2(8)): one callout-card stack per page", () => {
  test.failing("renders the card stack once, not once per pane", () => {
    const maps = { left: paneMap("left", []), right: paneMap("right", []) };
    renderSideBySide({ state: baseState(), maps });

    expect(screen.getAllByTestId("callout-card-stack")).toHaveLength(1);
  });
});
