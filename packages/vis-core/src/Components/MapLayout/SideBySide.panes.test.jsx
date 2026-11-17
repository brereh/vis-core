/**
 * Behaviour of a side-by-side map page, written against fake maps so it describes what
 * the user sees on each pane rather than how the component calls MapLibre.
 *
 * Only `renderSideBySide` knows how the panes are provided: since Phase 3 of
 * docs/Map Panes Consolidation Plan.md, by the map grid's 1×2 preset (before, by DualMaps).
 * The assertions didn't change; the known-drift test for §2.2(8) became an ordinary test.
 */
import { render, screen } from "@testing-library/react";
import { ThemeProvider } from "styled-components";
import { MapContext } from "contexts/MapContext";
import { FilterContext } from "contexts/FilterContext";
import { createFakeMap, createFeature, FakePopup, resetMapLibreFake } from "testing/mapLibreFake";
import { useMapBrowserEnv } from "testing/browserEnv";
import { formatNumber } from "utils";
import { resolveMapGrid } from "../../map/resolveMapGrid";

jest.mock("maplibre-gl", () => require("testing/mapLibreFake").mapLibreModule());
jest.mock("hooks/useMap", () => ({ useMap: jest.fn() }));
jest.mock("hooks/useBaseMapTransition", () => ({ useBaseMapTransition: jest.fn() }));
jest.mock("./Layer", () => ({ Layer: () => null }));
jest.mock("./MapVisualisation", () => ({ MapVisualisation: () => null }));
jest.mock("./CalloutCards/BaseCalloutCardVisualisation", () => ({
  BaseCalloutCardVisualisation: () => null,
}));
// The callout-card stack renders inside ScrollableContainer; see the cardStacks probe.
jest.mock("Components/ScrollableContainer", () => ({
  ScrollableContainer: ({ children }) => <div data-testid="callout-card-stack">{children}</div>,
}));
jest.mock("Components/DynamicLegend/DynamicLegend", () => ({
  DynamicLegend: () => <div data-testid="legend" />,
}));

import { useMap } from "hooks/useMap";
import MapGrid from "./MapGrid";

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
  mapGrid: resolveMapGrid({
    type: "DualMapLayout",
    config: { visualisations: [visualisation, card], layers: [{ name: LAYER }] },
  }),
  mapsByPane: {},
  paneOverrides: {},
  paneData: {},
  mapBoundsAndCentroid: null,
});

// --- probe: the only place that knows how the panes are provided ------------------------

const renderSideBySide = ({ state, maps }) => {
  // Each pane builds its map with useMap: hand out the left map, then the right, one per pane.
  const queue = [maps.left, maps.right];
  const mapByContainer = new WeakMap();
  useMap.mockImplementation((containerRef) => {
    if (!mapByContainer.has(containerRef)) mapByContainer.set(containerRef, queue.shift());
    const map = mapByContainer.get(containerRef);
    return { map, isMapReady: true, isMapLoaded: true, isMapStyleLoaded: true };
  });
  return render(
    <ThemeProvider theme={{ mq: { mobile: "(max-width: 900px)" } }}>
      <FilterContext.Provider value={{ state: {}, dispatch: jest.fn() }}>
        <MapContext.Provider value={{ state: { ...state, mapsByPane: maps }, dispatch: jest.fn() }}>
          <MapGrid extraCopyrightText="" />
        </MapContext.Provider>
      </FilterContext.Provider>
    </ThemeProvider>
  );
};

/** The callout-card stacks on the page. */
const cardStacks = () => screen.queryAllByTestId("callout-card-stack");

// ------------------------------------------------------------------------------------------

const hover = (map) => map.fire("mousemove", { point: { x: 10, y: 20 }, lngLat: LNG_LAT });

const popupOn = (map) => FakePopup.open().find((popup) => popup.map === map);

/** The text of an element of a popup's HTML, e.g. the displayed value. */
const textIn = (html, selector) => {
  const container = document.createElement("div");
  container.innerHTML = html;
  return container.querySelector(selector)?.textContent.trim();
};
const tooltipValue = (map) => textIn(popupOn(map).html, ".metadata-value");
const tooltipName = (map) => textIn(popupOn(map).html, ".feature-name");

// Hover passes run straight away instead of on the next animation frame.
useMapBrowserEnv({ immediateAnimationFrames: true });

beforeEach(() => {
  resetMapLibreFake();
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
    expect(tooltipName(maps.left)).toBe("Leeds");
    // Values are formatted as on the single map (plan §2.2(1)).
    expect(tooltipValue(maps.left)).toBe(formatNumber(12));
    expect(tooltipName(maps.right)).toBe("Leeds");
    expect(tooltipValue(maps.right)).toBe(formatNumber(34));
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

    expect(popupOn(maps.left).html).toContain("<p>Value: 1</p>");
    expect(popupOn(maps.right).html).toContain("<p>Value: 2</p>");
  });
});

// --- known drift: intended behaviour that fails today (plan §2.2) ------------------------

describe("dual tooltips match the single map (fixed drift, plan §2.2(1))", () => {
  test("formats the value as the single map does", () => {
    const value = 1234.5678;
    const feature = createFeature({ id: 7, layerId: LAYER, properties: { name: "Leeds" }, state: { value } });
    const maps = { left: paneMap("left", [feature]), right: paneMap("right", [feature]) };
    renderSideBySide({ state: baseState(), maps });

    hover(maps.left);

    expect(tooltipValue(maps.left)).toBe(formatNumber(value));
  });

  test("leaves the value out when the layer sets hideValueInTooltip", () => {
    const feature = createFeature({ id: 7, layerId: LAYER, properties: { name: "Leeds" }, state: { value: 4321 } });
    const maps = { left: paneMap("left", [feature]), right: paneMap("right", [feature]) };
    renderSideBySide({ state: baseState({ hideValueInTooltip: true }), maps });

    hover(maps.left);

    expect(tooltipName(maps.left)).toBe("Leeds");
    expect(popupOn(maps.left).html).not.toContain("4,321");
  });

  test("shows the name of a feature that has no feature state yet", () => {
    const feature = createFeature({ id: 7, layerId: LAYER, properties: { name: "Leeds" } });
    delete feature.state;
    const maps = { left: paneMap("left", [feature]), right: paneMap("right", [feature]) };
    renderSideBySide({ state: baseState(), maps });

    hover(maps.left);

    expect(tooltipName(maps.left)).toBe("Leeds");
  });
});

describe("one callout-card stack per page (fixed drift, plan §2.2(8))", () => {
  test("renders the card stack once, not once per pane", () => {
    const maps = { left: paneMap("left", []), right: paneMap("right", []) };
    renderSideBySide({ state: baseState(), maps });

    expect(cardStacks()).toHaveLength(1);
  });
});
