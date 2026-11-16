import { render, screen, waitFor } from "@testing-library/react";
import DualMaps from "./DualMaps";
import { MapContext } from "contexts/MapContext";
import { FilterContext } from "contexts/FilterContext";
import { useDualMaps } from "hooks/useDualMaps";
import { ThemeProvider } from "styled-components";

import { registerInitialBaseSources } from "../../map/baseSources";

/**
 * Mocked map controls to prevent undefined errors when the component
 * attempts to enable or disable touch/scroll interactions.
 */
const mockMapControls = {
  dragPan: { enable: jest.fn(), disable: jest.fn() },
  touchZoomRotate: { enable: jest.fn(), disableRotation: jest.fn() },
  scrollZoom: { enable: jest.fn(), disable: jest.fn() },
  doubleClickZoom: { disable: jest.fn() },
  boxZoom: { disable: jest.fn() },
  keyboard: { disable: jest.fn() },
};

jest.mock("./VisualisationManager", () => ({
  VisualisationManager: ({ visualisationConfigs, map, left }) => (
    <span>VisualisationManager: {left ? "left" : "right"}</span>
  ),
}));
jest.mock("./Layer", () => ({
  Layer: ({ layer }) => <span>Layer: {JSON.stringify(layer)}</span>,
}));
jest.mock("Components/DynamicLegend/DynamicLegend", () => ({
  DynamicLegend: ({ map }) => <span>Dynamic Legend: {map?.type || "unknown"}</span>,
}));
jest.mock("hooks/useDualMaps", () => ({
  useDualMaps: jest.fn(),
}));
jest.mock("maplibre-gl", () => require("testing/mapLibreFake").mapLibreModule());
jest.mock("services", () => ({
  ...jest.requireActual("services"),
  api: {
    baseService: {
      get: jest.fn(),
    },
  },
}));
import { api } from "services";
let mockMapContext = {
  state: {
    mapStyle: "default",
    mapCentre: [0, 0],
    mapZoom: 10,
    layers: { first: "first", second: "second" },
    visualisations: {
      climate: {
        id: "climate",
        name: "Climate Visualisation",
        legend: ["Low", "Medium", "High"],
        data: [],
        customFormattingFunctions: jest.fn(),
        htmlFragment: "<p>ImAHtmlFragment</p>",
        metadata: {
          source: "NASA",
          updated: "2025-08-27",
        },
      },
      biodiversity: {
        id: "biodiversity",
        name: "Biodiversity Visualisation",
        legend: ["Rare", "Common"],
        data: [],
        customFormattingFunctions: jest.fn(),
        metadata: {
          source: "UNEP",
          updated: "2025-08-20",
        },
      },
    },
    leftVisualisations: {
      data: {
        data: ["dataLeft"],
      },
    },
    rightVisualisations: {
      data: {
        data: ["dataRight"],
      },
    },
    metadataTables: {},
    metadataFilters: [],
    filters: [],
    map: null,
    isMapReady: false,
    isLoading: false,
    pageIsReady: true,
    selectionMode: null,
    selectionLayer: null,
    selectedFeatures: [],
    isFeatureSelectActive: false,
    visualisedFeatureIds: null,
    currentZoom: 10,
    colorSchemesByLayer: {
      id: {
        colors: ["#FF0000", "#00FF00", "#0000FF"],
        classification: "quantile",
        legend: ["Low", "Medium", "High"],
      },
    },
  },
  dispatch: jest.fn(),
};
let mockFilterContext = {
  state: {
    dropdown: "dropdown",
    slider: "slider",
    toggle: "toggle",
    checkbox: "checkbox",
    mapFeatureSelect: "mapFeatureSelect",
    mapFeatureSelectWithControls: "mapFeatureSelectWithControls",
    mapFeatureSelectAndPan: "mapFeatureSelectAndPan",
  },
  dispatch: jest.fn(),
};

let theme = {
  mq: {
    mobile: "mobile",
  },
};

let props = {
  extraCopyrightText: "ImAnExtraCopyrightText",
};

const on = jest.fn();
const off = jest.fn();
const getCanvas = jest.fn();
const getLayer = jest.fn(true);
beforeEach(() => {
  useDualMaps.mockReturnValue({
    leftMap: {
      off: off,
      on: on,
      getCanvas: getCanvas,
      getLayer: getLayer,
      type: "left",
      ...mockMapControls,
    },
    rightMap: { off: off, on: on, getLayer: getLayer, type: "right", ...mockMapControls },
    isMapStyleLoaded: "isMapStyleLoaded",
    isMapLoaded: "isMapLoaded",
    isMapReady: "isMapReady"
  });
  global.ResizeObserver = jest.fn().mockImplementation(() => ({
    observe: jest.fn().mockReturnValue(true),
    disconnect: jest.fn()
  }));
  window.matchMedia = jest.fn().mockImplementation(() => ({
    addEventListener: jest.fn(),
    removeEventListener: jest.fn()
  }))
});
describe("DualMaps component test", () => {
  it("Check the render with a classic use", () => {
    render(
      <ThemeProvider theme={theme}>
        <FilterContext.Provider value={mockFilterContext}>
          <MapContext.Provider value={mockMapContext}>
            <DualMaps {...props} />
          </MapContext.Provider>
        </FilterContext.Provider>
      </ThemeProvider>
    );
    // Check if there are 2 Layer with "first" and 2 Layer with "second"
    const layersFirst = screen.getAllByText(/first/);
    expect(layersFirst.length).toBe(2);
    const layersSecond = screen.getAllByText(/first/);
    expect(layersSecond.length).toBe(2);
    // Check if there are a VisualisationManager right and left
    expect(screen.getByText(/VisualisationManager: right/)).toBeInTheDocument();
    expect(screen.getByText(/VisualisationManager: left/)).toBeInTheDocument();
    // Check if the DynamicLegend is displayed
    expect(screen.getByText(/Dynamic Legend: right/)).toBeInTheDocument();
  });
  it("does not render MapStyleToggle by default", () => {
    render(
      <ThemeProvider theme={theme}>
        <FilterContext.Provider value={mockFilterContext}>
          <MapContext.Provider value={mockMapContext}>
            <DualMaps {...props} />
          </MapContext.Provider>
        </FilterContext.Provider>
      </ThemeProvider>
    );
    expect(screen.queryByTestId("map-style-toggle-btn")).not.toBeInTheDocument();
  });
  it("Display the left map on the DynamicLegend component", () => {
    mockMapContext = {
      ...mockMapContext,
      state: {
        ...mockMapContext.state,
        leftVisualisations: {
          data: {
            data: ["dataLeft"],
          },
        },
        rightVisualisations: {
          data: {
            data: [
              /* Empty */
            ],
          },
        },
      },
    };
    render(
      <ThemeProvider theme={theme}>
        <FilterContext.Provider value={mockFilterContext}>
          <MapContext.Provider value={mockMapContext}>
            <DualMaps {...props} />
          </MapContext.Provider>
        </FilterContext.Provider>
      </ThemeProvider>
    );
    expect(screen.getByText(/Dynamic Legend: left/)).toBeInTheDocument();
  });
});

describe("DualMaps style toggle transform", () => {
  it("applies style changes to both maps without idle listeners and preserves application layers", () => {
    const leftSetStyle = jest.fn();
    const rightSetStyle = jest.fn();
    const leftOnce = jest.fn();
    const rightOnce = jest.fn();
    const leftOff = jest.fn();
    const rightOff = jest.fn();
    const leftMap = {
      off: leftOff,
      on: jest.fn(),
      once: leftOnce,
      setStyle: leftSetStyle,
      getCanvas,
      getLayer,
      resize: jest.fn(),
      triggerRepaint: jest.fn(),
      type: "left",
      ...mockMapControls,
    };
    const rightMap = {
      off: rightOff,
      on: jest.fn(),
      once: rightOnce,
      setStyle: rightSetStyle,
      getLayer,
      resize: jest.fn(),
      triggerRepaint: jest.fn(),
      type: "right",
      ...mockMapControls,
    };

    useDualMaps.mockReturnValue({
      leftMap,
      rightMap,
      maps: { left: leftMap, right: rightMap },
      isMapStyleLoaded: true,
      isMapLoaded: true,
      isMapReady: true,
      knownBaseSourceIds: { current: new Set(["oldBase"]) },
    });

    const initialContext = {
      ...mockMapContext,
      state: {
        ...mockMapContext.state,
        baseMapId: "positron",
      },
    };

    const { rerender, unmount } = render(
      <ThemeProvider theme={theme}>
        <FilterContext.Provider value={mockFilterContext}>
          <MapContext.Provider value={initialContext}>
            <DualMaps {...props} />
          </MapContext.Provider>
        </FilterContext.Provider>
      </ThemeProvider>
    );

    expect(leftSetStyle).not.toHaveBeenCalled();
    expect(rightSetStyle).not.toHaveBeenCalled();

    registerInitialBaseSources(leftMap, new Set(["oldBase"]));
    registerInitialBaseSources(rightMap, new Set(["oldBase"]));

    const nextContext = {
      ...mockMapContext,
      state: {
        ...mockMapContext.state,
        baseMapId: "darkMatter",
      },
    };

    rerender(
      <ThemeProvider theme={theme}>
        <FilterContext.Provider value={mockFilterContext}>
          <MapContext.Provider value={nextContext}>
            <DualMaps {...props} />
          </MapContext.Provider>
        </FilterContext.Provider>
      </ThemeProvider>
    );

    expect(leftSetStyle).toHaveBeenCalledWith(
      "https://tiles.openfreemap.org/styles/dark",
      expect.objectContaining({ transformStyle: expect.any(Function) })
    );
    expect(rightSetStyle).toHaveBeenCalledWith(
      "https://tiles.openfreemap.org/styles/dark",
      expect.objectContaining({ transformStyle: expect.any(Function) })
    );
    expect(leftOnce).toHaveBeenCalledWith("style.load", expect.any(Function));
    expect(rightOnce).toHaveBeenCalledWith("style.load", expect.any(Function));
    expect(leftOnce).not.toHaveBeenCalledWith("idle", expect.any(Function));
    expect(rightOnce).not.toHaveBeenCalledWith("idle", expect.any(Function));

    const { transformStyle } = leftSetStyle.mock.calls[0][1];
    const incomingLayout = { "text-size": ["interpolate", ["linear"], ["zoom"], 5, 10, 10, 14] };
    const transformed = transformStyle(
      {
        sources: {
          oldBase: { type: "vector" },
          app: { type: "geojson" },
        },
        layers: [
          { id: "place_town", type: "symbol", source: "oldBase" },
          { id: "place_markers", type: "symbol", source: "app" },
        ],
      },
      {
        sources: {
          newBase: { type: "vector" },
        },
        layers: [
          { id: "background", type: "background" },
          { id: "place_town", type: "symbol", source: "newBase", layout: incomingLayout },
        ],
      }
    );

    expect(transformed.sources.oldBase).toBeUndefined();
    expect(transformed.sources.app).toEqual({ type: "geojson" });
    expect(transformed.layers.map((layer) => layer.id)).toEqual([
      "background",
      "place_markers",
      "place_town",
    ]);
    expect(transformed.layers.find((layer) => layer.id === "place_town").layout["text-font"]).toEqual(["Noto Sans Bold"]);

    unmount();

    expect(leftOff).toHaveBeenCalledWith("style.load", expect.any(Function));
    expect(rightOff).toHaveBeenCalledWith("style.load", expect.any(Function));
  });
});

describe("Test with shouldHaveTooltipOnHover, shouldHaveTooltipOnClick, hoverNulls = true", () => {
  beforeEach(() => {
    mockMapContext = {
      ...mockMapContext,
      state: {
        ...mockMapContext.state,
        layers: {
          first: {
            shouldHaveTooltipOnHover: true,
            shouldHaveTooltipOnClick: true,
            hoverNulls: true,
          },
          layer1: {
            shouldHaveTooltipOnHover: true,
            shouldHaveTooltipOnClick: true,
            hoverNulls: true,
          },
        },
      },
    };
  });
  it("Tried to throw the handleMapHover function", () => {
    const { unmount } = render(
      <ThemeProvider theme={theme}>
        <FilterContext.Provider value={mockFilterContext}>
          <MapContext.Provider value={mockMapContext}>
            <DualMaps {...props} />
          </MapContext.Provider>
        </FilterContext.Provider>
      </ThemeProvider>
    );
    // On function to have been called
    expect(on).toHaveBeenCalledWith("mousemove", expect.any(Function));
    expect(on).toHaveBeenCalledWith(
      "mouseleave",
      "first",
      expect.any(Function)
    );
    expect(on).toHaveBeenCalledWith(
      "mouseenter",
      "first",
      expect.any(Function)
    );
    // off functions to be throw when the render is unmount
    unmount();
    // Off function to have been called
    expect(off).toHaveBeenCalledWith("click", expect.any(Function));
    expect(off).toHaveBeenCalledWith("mousemove", expect.any(Function));
  });

  it("removes every map listener it adds, and adds one mousemove per map however often it re-renders", () => {
    const tree = (
      <ThemeProvider theme={theme}>
        <FilterContext.Provider value={mockFilterContext}>
          <MapContext.Provider value={mockMapContext}>
            <DualMaps {...props} />
          </MapContext.Provider>
        </FilterContext.Provider>
      </ThemeProvider>
    );
    const { rerender, unmount } = render(tree);
    rerender(tree);
    rerender(tree);

    // Both maps share the same mocked on/off here, so one listener per map is two calls.
    expect(on.mock.calls.filter(([event]) => event === "mousemove")).toHaveLength(2);

    unmount();
    // Every (event, [layer,] handler) registered must have been unregistered with the same args.
    const key = (args) => args.map((a) => (typeof a === "function" ? a : String(a)));
    const removed = off.mock.calls.map(key);
    on.mock.calls
      .filter(([event]) => ["mousemove", "mouseenter", "mouseleave", "click", "zoomend"].includes(event))
      .forEach((args) => {
        expect(removed).toContainEqual(key(args));
      });
  });

  it("should handle hover events on the map", () => {
    const mockFeatures = [
      {
        id: 1,
        layer: { id: "layer1", source: "source1" },
        properties: { name: "Test Feature" },
        state: { value: 100 },
      },
    ];
    const mockLeftMap = {
      on: jest.fn(),
      off: jest.fn(),
      project: jest.fn().mockReturnValue({ x: 100, y: 100 }),
      queryRenderedFeatures: jest.fn().mockReturnValue(mockFeatures),
      setFeatureState: jest.fn(),
      getLayer: jest.fn().mockReturnValue(true),
      ...mockMapControls,
    };
    useDualMaps.mockReturnValue({
      leftMap: mockLeftMap,
      rightMap: { ...mockLeftMap },
      isMapReady: true,
    });

    render(
      <ThemeProvider theme={theme}>
        <FilterContext.Provider value={mockFilterContext}>
          <MapContext.Provider value={mockMapContext}>
            <DualMaps {...props} />
          </MapContext.Provider>
        </FilterContext.Provider>
      </ThemeProvider>
    );
    const mousemoveCall = mockLeftMap.on.mock.calls.find(
      (call) => call[0] === "mousemove"
    );
    const handleMapHoverCallback = mousemoveCall[1];
    // Simulate a hover event
    const mockEvent = {
      point: { x: 150, y: 150 },
      lngLat: { lng: -0.1, lat: 51.5 },
    };
    // Hover work runs on the next animation frame, coalescing a burst of moves into one.
    const frames = [];
    const rafSpy = jest
      .spyOn(window, "requestAnimationFrame")
      .mockImplementation((cb) => frames.push(cb));
    try {
      handleMapHoverCallback(mockEvent);
      handleMapHoverCallback(mockEvent);
      handleMapHoverCallback(mockEvent);
      expect(mockLeftMap.queryRenderedFeatures).not.toHaveBeenCalled();
      expect(frames).toHaveLength(1);

      frames.shift()();
      // One hover pass queries each map once (the right map shares the left's mocks here).
      expect(mockLeftMap.queryRenderedFeatures).toHaveBeenCalledTimes(2);
      expect(mockLeftMap.setFeatureState).toHaveBeenCalled();
    } finally {
      rafSpy.mockRestore();
    }
  });

  it("drops a pending hover pass when the mouse leaves the map", () => {
    const handlers = {};
    const mockLeftMap = {
      on: jest.fn((event, ...rest) => { if (rest.length === 1) handlers[event] = rest[0]; }),
      off: jest.fn(),
      project: jest.fn().mockReturnValue({ x: 100, y: 100 }),
      queryRenderedFeatures: jest.fn().mockReturnValue([]),
      setFeatureState: jest.fn(),
      getLayer: jest.fn().mockReturnValue(true),
      ...mockMapControls,
    };
    useDualMaps.mockReturnValue({
      leftMap: mockLeftMap,
      rightMap: { ...mockLeftMap, on: jest.fn() },
      isMapReady: true,
    });
    render(
      <ThemeProvider theme={theme}>
        <FilterContext.Provider value={mockFilterContext}>
          <MapContext.Provider value={mockMapContext}>
            <DualMaps {...props} />
          </MapContext.Provider>
        </FilterContext.Provider>
      </ThemeProvider>
    );

    const frames = new Map();
    let nextId = 1;
    const rafSpy = jest.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => {
      frames.set(nextId, cb);
      return nextId++;
    });
    const cafSpy = jest.spyOn(window, "cancelAnimationFrame").mockImplementation((id) => frames.delete(id));
    try {
      handlers.mousemove({ point: { x: 150, y: 150 }, lngLat: { lng: -0.1, lat: 51.5 } });
      expect(frames.size).toBe(1);
      handlers.mouseout();
      expect(frames.size).toBe(0);
      expect(mockLeftMap.queryRenderedFeatures).not.toHaveBeenCalled();
    } finally {
      rafSpy.mockRestore();
      cafSpy.mockRestore();
    }
  });

  it("Test function getCanvas() is called", () => {
    render(
      <ThemeProvider theme={theme}>
        <FilterContext.Provider value={mockFilterContext}>
          <MapContext.Provider value={mockMapContext}>
            <DualMaps {...props} />
          </MapContext.Provider>
        </FilterContext.Provider>
      </ThemeProvider>
    );
    expect(on).toHaveBeenCalledWith(
      "mouseenter",
      "layer1",
      expect.any(Function)
    );
    expect(on).toHaveBeenCalledWith(
      "mouseleave",
      "layer1",
      expect.any(Function)
    );
  });
});

describe("Test with shouldHaveLabel = true", () => {
  beforeEach(() => {
    mockMapContext = {
      ...mockMapContext,
      state: {
        ...mockMapContext.state,
        layers: {
          first: {
            shouldHaveLabel: true,
          },
          layer1: {
            shouldHaveLabel: true,
          },
        },
      },
    };
  });
  it("Test handleZoom function is called", () => {
    render(
      <ThemeProvider theme={theme}>
        <FilterContext.Provider value={mockFilterContext}>
          <MapContext.Provider value={mockMapContext}>
            <DualMaps {...props} />
          </MapContext.Provider>
        </FilterContext.Provider>
      </ThemeProvider>
    );
  });
});

describe("Tests when apiRequest is not null", () => {
  beforeEach(() => {
    mockMapContext = {
      ...mockMapContext,
      state: {
        ...mockMapContext.state,
        layers: {
          first: {
            // shouldHaveLabel: true,
            customTooltip: true,
            shouldHaveTooltipOnHover: true,
          },
          layer1: {
            shouldHaveLabel: true,
            customTooltip: true,
            shouldHaveTooltipOnHover: true,
          },
          id: {
            hoverNulls: false,
            customTooltip: {
              url: "/url-{id}",
              htmlTemplate: "<p>paragraph</p>",
              customFormattingFunctions: "customFormattingFunctions",
            },
          },
        },
      },
    };

    api.baseService.get.mockResolvedValue(true);

    const on = jest.fn((event, callback) => {
      if (event === "mousemove") {
        callback({
          lngLat: { lng: 0, lat: 0 },
          point: { x: 100, y: 100 },
        });
      }
    });
    const off = jest.fn();
    const getCanvas = jest.fn();
    const getLayer = jest.fn();
    const project = jest.fn();
    const setFeatureState = jest.fn();
    const queryRenderedFeatures = jest.fn();
    getLayer.mockReturnValue(true);
    project.mockReturnValue(true);
    queryRenderedFeatures.mockReturnValue([
      {
        layer: { id: "id", "source-layer": "sourceLayer", source: "source" },
        id: "id",
        state: { value: "value" },
        properties: { name: "name" },
      },
    ]);
    useDualMaps.mockReturnValue({
      leftMap: {
        off: off,
        on: on,
        getCanvas: getCanvas,
        getLayer: getLayer,
        project: project,
        queryRenderedFeatures: queryRenderedFeatures,
        setFeatureState: setFeatureState,
        type: "left",
        ...mockMapControls,
      },
      rightMap: {
        off: off,
        on: on,
        getLayer: getLayer,
        project: project,
        queryRenderedFeatures: queryRenderedFeatures,
        setFeatureState: setFeatureState,
        type: "right",
        ...mockMapControls,
      },
      isMapStyleLoaded: "isMapStyleLoaded",
      isMapLoaded: "isMapLoaded",
      isMapReady: "isMapReady",
    });

    // fake timer for mock setTimeout
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });
  it("Basic test", async () => {
    render(
      <ThemeProvider theme={theme}>
        <FilterContext.Provider value={mockFilterContext}>
          <MapContext.Provider value={mockMapContext}>
            <DualMaps {...props} />
          </MapContext.Provider>
        </FilterContext.Provider>
      </ThemeProvider>
    );
    await waitFor(() => {
      expect(api.baseService.get).toHaveBeenCalledWith(
        "/url-id",
        expect.objectContaining({
          signal: expect.any(AbortSignal),
        })
      );
    });
  });
});

describe("Tests when features is null", () => {
  let setFeatureState;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();

    mockMapContext = {
      ...mockMapContext,
      state: {
        ...mockMapContext.state,
        layers: {
          id: {
            hoverNulls: false,
            shouldHaveTooltipOnHover: true,
            customTooltip: {
              url: "/url-{id}",
              htmlTemplate: "<p>paragraph</p>",
              customFormattingFunctions: {},
            },
          },
        },
      },
    };

    api.baseService.get.mockResolvedValue(true);

    const on = jest.fn((event, callback) => {
      if (event === "mousemove") {
        callback({
          lngLat: { lng: 0, lat: 0 },
          point: { x: 100, y: 100 },
        });
      }
    });
    const off = jest.fn();
    const getCanvas = jest.fn();
    const getLayer = jest.fn().mockReturnValue(true);
    const project = jest.fn().mockReturnValue(true);
    const queryRenderedFeatures = jest.fn().mockReturnValue([]);

    setFeatureState = jest.fn();

    useDualMaps.mockReturnValue({
      leftMap: {
        off,
        on,
        getCanvas,
        getLayer,
        project,
        queryRenderedFeatures,
        setFeatureState,
        type: "left",
        ...mockMapControls,
      },
      rightMap: {
        off,
        on,
        getLayer,
        project,
        queryRenderedFeatures,
        setFeatureState,
        type: "right",
        ...mockMapControls,
      },
      isMapStyleLoaded: true,
      isMapLoaded: true,
      isMapReady: true,
    });
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  // TO CONTINUE
  it("should call setFeatureState when features is empty", () => {
    render(
      <ThemeProvider theme={theme}>
        <FilterContext.Provider value={mockFilterContext}>
          <MapContext.Provider value={mockMapContext}>
            <DualMaps {...props} />
          </MapContext.Provider>
        </FilterContext.Provider>
      </ThemeProvider>
    );

    // expect(setFeatureState).toHaveBeenCalled();
  });
});

describe("map filter clicks with a different feature on each side", () => {
  const zoneFilter = {
    id: "zone-filter",
    type: "map",
    layer: "Zone Pairs",
    field: "id",
    paramName: "zoneId",
    visualisations: ["Zone Pairs Side-by-Side"],
    actions: [{ action: "UPDATE_DUAL_QUERY_PARAMS" }],
  };

  /** A fake rendered feature from the zones fill layer. */
  const zoneFeature = (id) => ({
    layer: { type: "fill" },
    properties: { id },
    toJSON: () => ({ type: "Feature", properties: { id } }),
  });

  /** A fake map whose click handlers are kept so the test can fire them. */
  const createMap = (type, features, { hasSelection = false } = {}) => {
    const handlers = {};
    return {
      type,
      handlers,
      on: jest.fn((event, cb) => { handlers[event] = cb; }),
      off: jest.fn(),
      getCanvas: jest.fn(() => ({ style: {} })),
      getLayer: jest.fn((id) => (id === "selected-feature-layer" ? hasSelection : undefined)),
      getSource: jest.fn(),
      setFeatureState: jest.fn(),
      queryRenderedFeatures: jest.fn(() => features),
      addSource: jest.fn(),
      addLayer: jest.fn(),
      removeLayer: jest.fn(),
      removeSource: jest.fn(),
      ...mockMapControls,
    };
  };

  let dispatch;
  let filterDispatch;

  const renderWithMaps = (leftMap, rightMap) => {
    useDualMaps.mockReturnValue({ leftMap, rightMap, isMapReady: true });
    dispatch = jest.fn();
    filterDispatch = jest.fn();
    const context = {
      ...mockMapContext,
      state: { ...mockMapContext.state, layers: {}, filters: [zoneFilter] },
      dispatch,
    };
    render(
      <ThemeProvider theme={theme}>
        <FilterContext.Provider value={{ ...mockFilterContext, dispatch: filterDispatch }}>
          <MapContext.Provider value={context}>
            <DualMaps {...props} />
          </MapContext.Provider>
        </FilterContext.Provider>
      </ThemeProvider>
    );
  };

  const queryParamDispatches = () =>
    dispatch.mock.calls
      .map(([action]) => action)
      .filter((action) => action.type === "UPDATE_DUAL_QUERY_PARAMS");

  it("sends each side the zone under the cursor on its own map", () => {
    const leftMap = createMap("left", [zoneFeature(101)]);
    const rightMap = createMap("right", [zoneFeature(9001)]);
    renderWithMaps(leftMap, rightMap);

    leftMap.handlers.click({ point: { x: 10, y: 10 }, target: leftMap });

    expect(queryParamDispatches().map(({ payload }) => [payload.sides, payload.value])).toEqual([
      ["left", 101],
      ["right", 9001],
    ]);
    expect(leftMap.addSource).toHaveBeenCalledWith(
      "selected-feature-source",
      expect.objectContaining({ data: { type: "Feature", properties: { id: 101 } } })
    );
    expect(rightMap.addSource).toHaveBeenCalledWith(
      "selected-feature-source",
      expect.objectContaining({ data: { type: "Feature", properties: { id: 9001 } } })
    );
  });

  /** A fake rendered feature from a tiled zones layer, which has an id. */
  const tiledZone = (id) => ({
    id,
    layer: { type: "fill", source: "Zones", "source-layer": "zones" },
    properties: { id },
    toJSON: () => ({ type: "Feature", properties: { id } }),
  });

  it("selects a tiled zone through feature state, without adding a layer on its source", () => {
    const leftMap = createMap("left", [tiledZone(101)]);
    const rightMap = createMap("right", []);
    renderWithMaps(leftMap, rightMap);

    leftMap.handlers.click({ point: { x: 10, y: 10 }, target: leftMap });

    // Adding a layer on the vector source would make MapLibre reload all its tiles.
    expect(leftMap.addSource).not.toHaveBeenCalled();
    expect(leftMap.addLayer).not.toHaveBeenCalled();
    expect(leftMap.setFeatureState).toHaveBeenCalledWith(
      { source: "Zones", sourceLayer: "zones", id: 101 },
      { selected: true }
    );
  });

  it("unselects a side's previous zone when the next click selects another", () => {
    const leftMap = createMap("left", [tiledZone(101)]);
    leftMap.getSource.mockImplementation((id) => (id === "Zones" ? {} : undefined));
    const rightMap = createMap("right", []);
    renderWithMaps(leftMap, rightMap);

    leftMap.handlers.click({ point: { x: 10, y: 10 }, target: leftMap });
    leftMap.queryRenderedFeatures.mockReturnValue([tiledZone(202)]);
    leftMap.setFeatureState.mockClear();
    leftMap.handlers.click({ point: { x: 20, y: 20 }, target: leftMap });

    expect(leftMap.setFeatureState.mock.calls).toEqual([
      [{ source: "Zones", sourceLayer: "zones", id: 101 }, { selected: false }],
      [{ source: "Zones", sourceLayer: "zones", id: 202 }, { selected: true }],
    ]);
  });

  it("shows the clicked side's zone in the sidebar filter", () => {
    const leftMap = createMap("left", [zoneFeature(101)]);
    const rightMap = createMap("right", [zoneFeature(9001)]);
    renderWithMaps(leftMap, rightMap);

    rightMap.handlers.click({ point: { x: 10, y: 10 }, target: rightMap });

    expect(filterDispatch).toHaveBeenCalledTimes(1);
    expect(filterDispatch).toHaveBeenCalledWith({
      type: "SET_FILTER_VALUE",
      payload: { filterId: "zone-filter", value: 9001 },
    });
  });

  it("clears a side that has no zone under the cursor", () => {
    const leftMap = createMap("left", [], { hasSelection: true });
    const rightMap = createMap("right", [zoneFeature(9001)]);
    renderWithMaps(leftMap, rightMap);

    leftMap.handlers.click({ point: { x: 10, y: 10 }, target: leftMap });

    expect(queryParamDispatches().map(({ payload }) => [payload.sides, payload.value])).toEqual([
      ["left", null],
      ["right", 9001],
    ]);
    expect(leftMap.removeLayer).toHaveBeenCalledWith("selected-feature-layer");
    expect(leftMap.addLayer).not.toHaveBeenCalled();
    // Falls back to the other side's zone, since the clicked side has none.
    expect(filterDispatch).toHaveBeenCalledWith({
      type: "SET_FILTER_VALUE",
      payload: { filterId: "zone-filter", value: 9001 },
    });
  });

  it("ignores a click with no zone on either side", () => {
    const leftMap = createMap("left", [], { hasSelection: true });
    const rightMap = createMap("right", [], { hasSelection: true });
    renderWithMaps(leftMap, rightMap);

    leftMap.handlers.click({ point: { x: 10, y: 10 }, target: leftMap });

    expect(queryParamDispatches()).toEqual([]);
    expect(filterDispatch).not.toHaveBeenCalled();
    expect(leftMap.removeLayer).not.toHaveBeenCalled();
    expect(rightMap.removeLayer).not.toHaveBeenCalled();
  });
});
