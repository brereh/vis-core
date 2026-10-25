import { render, screen, act } from "@testing-library/react";
import { FilterContext } from "contexts/FilterContext";
import { MapContext } from "contexts/MapContext";
import { useMap } from "hooks/useMap";
import { api } from "services";
import { registerInitialBaseSources } from "../../map/baseSources";

jest.mock("maplibre-gl", () => {
  class Popup {
    constructor(options) {
      this.options = options;
      this.remove = jest.fn(() => this);
    }
    setLngLat(coords) {
      this.coords = coords;
      return this;
    }
    setHTML(html) {
      this.html = html;
      return this;
    }
    addTo(map) {
      this.map = map;
      return this;
    }
  }

  class LngLatBounds {
    constructor() {
      this.bounds = [];
    }
    extend(coord) {
      this.bounds.push(coord);
      return this;
    }
    getNorthEast() {
      return { lng: 1, lat: 1 };
    }
    getSouthWest() {
      return { lng: -1, lat: -1 };
    }
  }

  return {
    __esModule: true,
    default: {
      Popup: Popup,
      LngLatBounds: LngLatBounds,
      Map: jest.fn(() => ({
        on: jest.fn(),
        off: jest.fn(),
        remove: jest.fn(),
        addLayer: jest.fn(),
        setStyle: jest.fn(),
        flyTo: jest.fn(),
      })),
    },
    Popup: Popup,
    LngLatBounds: LngLatBounds,
  };
});

import maplibregl from "maplibre-gl";
import Map from "./Map";
import { DockedLayoutContext } from "contexts/DockedLayoutContext";
import { ThemeProvider } from "styled-components";
import { get } from "lodash";

const OriginalPopupClass = (() => {
  class Popup {
    constructor(options) {
      this.options = options;
      this.remove = jest.fn(() => this);
    }
    setLngLat(coords) {
      this.coords = coords;
      return this;
    }
    setHTML(html) {
      this.html = html;
      return this;
    }
    addTo(map) {
      this.map = map;
      return this;
    }
  }
  return Popup;
})();

jest.mock("hooks/useMap", () => ({
  useMap: jest.fn(),
}));
jest.mock("./VisualisationManager", () => ({
  ...jest.requireActual("./VisualisationManager"),
  VisualisationManager: () => <div>VisualisationManager</div>,
}));
jest.mock("Components/DynamicLegend/DynamicLegend", () => ({
  DynamicLegend: () => <div>DynamicLegend</div>,
}));
jest.mock("services", () => ({
  ...jest.requireActual("services"),
  api: {
    baseService: {
      get: jest.fn(),
    },
  },
}));
let mockMapContext = {
  state: {
    mapStyle: "default",
    mapCentre: [0, 0],
    mapZoom: 10,
    layers: {
      first: { shouldHaveTooltipOnHover: true, hoverNulls: true },
      second: { shouldHaveTooltipOnHover: true, hoverNulls: true },
      id: {
        shouldHaveTooltipOnHover: true,
        hoverNulls: true,
        visualisationName: "visualisationName",
      },
    },
    visualisedFeatureIds: {
      first: [{ value: "201" }],
      second: [{ value: "201" }],
    },
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
      visualisationName: {
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
let props = {
  extraCopyrightText: "extraCopyrightText",
};

const addControl = jest.fn();
const on = jest.fn();
const off = jest.fn();
const getCanvas = jest.fn();
const getLayer = jest.fn();
const queryRenderedFeatures = jest.fn();
const setFilter = jest.fn();
const setFeatureState = jest.fn();
const getZoom = jest.fn();
const querySourceFeatures = jest.fn();
const addLayer = jest.fn();
const setLayoutProperty = jest.fn();
const fitBounds = jest.fn();
const panTo = jest.fn();
const setStyle = jest.fn();
const once = jest.fn();
// const addEventListener = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();

  maplibregl.Popup = OriginalPopupClass;
  if (!maplibregl.default) {
    maplibregl.default = {};
  }
  maplibregl.default.Popup = OriginalPopupClass;

  // on.mockReset();
  on.mockImplementation((eventName, callback) => {
    callback({ type: eventName, originalEvent: {} });
  });
  getCanvas.mockReturnValue({
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    style: {
      cursor: "pointer",
    },
  });
  getLayer.mockReturnValue(true);
  useMap.mockReturnValue({
    map: {
      addControl,
      on,
      once,
      getCanvas,
      off,
      getLayer,
      queryRenderedFeatures,
      setFilter,
      setFeatureState,
      getZoom,
      querySourceFeatures,
      addLayer,
      setLayoutProperty,
      fitBounds,
      panTo,
      setStyle,
    },
    isMapReady: true,
    knownBaseSourceIds: { current: new Set(["default"]) },
  });
  Object.defineProperty(window, "ontouchstart", {
    value: true,
    writable: true,
  });
  Object.defineProperty(navigator, "maxTouchPoints", {
    value: 1,
    writable: true,
  });
  window.matchMedia = jest.fn().mockImplementation((query) => ({
    matches: true,
    media: query,
    onchange: null,
    addListener: jest.fn(),
    removeListener: jest.fn(),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
  }));
});

const theme = {
  mq: { mobile: false },
};

describe("Initial rendering", () => {
  it("DynamicLegend and VisualisationManager are rendering", () => {
    mockMapContext = {
      ...mockMapContext,
      state: {
        ...mockMapContext.state,
        visualisedFeatureIds: {
          first: [{ value: "201" }],
          second: [{ value: "201" }],
        },
      },
    };
    render(
      <ThemeProvider theme={theme}>
        <FilterContext.Provider value={mockFilterContext}>
          <MapContext.Provider value={mockMapContext}>
            <Map {...props} />
          </MapContext.Provider>
        </FilterContext.Provider>
      </ThemeProvider>
    );
    // Visualisation Manager
    expect(screen.getByText("VisualisationManager")).toBeInTheDocument();
    // DynamicLegend
    expect(screen.getByText("DynamicLegend")).toBeInTheDocument();
  });
});

describe("Conditional rendering of subcomponents", () => {
  beforeEach(() => {
    mockMapContext = {
      ...mockMapContext,
      state: {
        ...mockMapContext.state,
        visualisations: undefined, // empty
      },
    };
    useMap.mockReturnValue({
      map: {
        addControl,
        on,
        getCanvas,
        off,
        getLayer,
        queryRenderedFeatures,
        setFilter,
        setFeatureState,
        getZoom
      },
      isMapReady: undefined, // empty
    });
  });
  afterEach(() => {
    jest.clearAllMocks();
  });
  it("VisualisationManager", () => {
    render(
      <ThemeProvider theme={theme}>
        <FilterContext.Provider value={mockFilterContext}>
          <MapContext.Provider value={mockMapContext}>
            <Map {...props} />
          </MapContext.Provider>
        </FilterContext.Provider>
      </ThemeProvider>
    );
    expect(screen.queryByText("VisualisationManager")).not.toBeInTheDocument();
  });
  it("DynamicLegend", () => {
    render(
      <ThemeProvider theme={theme}>
        <FilterContext.Provider value={mockFilterContext}>
          <MapContext.Provider value={mockMapContext}>
            <Map {...props} />
          </MapContext.Provider>
        </FilterContext.Provider>
      </ThemeProvider>
    );
    expect(screen.queryByText("DynamicLegend")).not.toBeInTheDocument();
  });
  it("does not render MapStyleToggle by default", () => {
    render(
      <ThemeProvider theme={theme}>
        <FilterContext.Provider value={mockFilterContext}>
          <MapContext.Provider value={mockMapContext}>
            <Map {...props} />
          </MapContext.Provider>
        </FilterContext.Provider>
      </ThemeProvider>
    );
    expect(screen.queryByTestId("map-style-toggle-btn")).not.toBeInTheDocument();
  });
});

describe("Hooks tests", () => {
  it("useMap hook", () => {
    render(
      <ThemeProvider theme={theme}>
        <FilterContext.Provider value={mockFilterContext}>
          <MapContext.Provider value={mockMapContext}>
            <Map {...props} />
          </MapContext.Provider>
        </FilterContext.Provider>
      </ThemeProvider>
    );
    expect(useMap).toHaveBeenCalledWith(
      expect.objectContaining({ current: expect.anything() }),
      "default",
      [0, 0],
      10,
      "extraCopyrightText"
    );
  });
  it("should return correct values from useMap hook", () => {
    render(
      <ThemeProvider theme={theme}>
        <FilterContext.Provider value={mockFilterContext}>
          <MapContext.Provider value={mockMapContext}>
            <Map {...props} />
          </MapContext.Provider>
        </FilterContext.Provider>
      </ThemeProvider>
    );
    const { map, isMapReady } = useMap.mock.results[0].value;
    expect(map).toEqual({
      addControl,
      addLayer,
      fitBounds,
      on,
      panTo,
      getCanvas,
      off,
      getLayer,
      getZoom,
      queryRenderedFeatures,
      querySourceFeatures,
      setFilter,
      setFeatureState,
      setLayoutProperty,
      once,
      setStyle,
    });
    expect(isMapReady).toBe(true);
    expect(screen.getByText("DynamicLegend")).toBeInTheDocument();
  });
});

describe("Navigation control placement", () => {
  const renderWithDocked = (docked, map) => {
    useMap.mockReturnValue({ map, isMapReady: false });
    const tree = (value) => (
      <ThemeProvider theme={theme}>
        <DockedLayoutContext.Provider value={value}>
          <FilterContext.Provider value={mockFilterContext}>
            <MapContext.Provider value={mockMapContext}>
              <Map {...props} />
            </MapContext.Provider>
          </FilterContext.Provider>
        </DockedLayoutContext.Provider>
      </ThemeProvider>
    );
    const dockedValue = { calloutSlot: null, setSelection: jest.fn() };
    const utils = render(tree(docked ? dockedValue : null));
    return { ...utils, rerenderDocked: (next) => utils.rerender(tree(next ? dockedValue : null)) };
  };

  const makeMap = () => ({
    __nav: { id: "nav" },
    addControl: jest.fn(),
    removeControl: jest.fn(),
    on: jest.fn(),
    off: jest.fn(),
    once: jest.fn(),
    getLayer: jest.fn(),
    getCanvas: jest.fn(() => ({ addEventListener: jest.fn(), removeEventListener: jest.fn(), style: {} })),
    resize: jest.fn(),
    getZoom: jest.fn(() => 10),
  });

  // The map also adds other controls (e.g. draw), so look only at the nav control's moves.
  const lastNavPosition = (map) =>
    map.addControl.mock.calls.filter(([control]) => control === map.__nav).at(-1)?.[1];

  it("leaves the control bottom-left in the default layout", () => {
    const map = makeMap();
    renderWithDocked(false, map);

    expect(map.removeControl).not.toHaveBeenCalled();
    expect(map.addControl).not.toHaveBeenCalledWith(map.__nav, expect.anything());
  });

  it("moves the control top-left when docked and back when the layout falls back", () => {
    const map = makeMap();
    const { rerenderDocked } = renderWithDocked(true, map);

    expect(map.removeControl).toHaveBeenCalledWith(map.__nav);
    expect(lastNavPosition(map)).toBe("top-left");

    rerenderDocked(false);
    expect(lastNavPosition(map)).toBe("bottom-left");

    rerenderDocked(true);
    expect(lastNavPosition(map)).toBe("top-left");
  });
});

describe("SET_DRAW_INSTANCE is dispatch with the draw instance", () => {
  it("Test", () => {
    render(
      <ThemeProvider theme={theme}>
        <FilterContext.Provider value={mockFilterContext}>
          <MapContext.Provider value={mockMapContext}>
            <Map {...props} />
          </MapContext.Provider>
        </FilterContext.Provider>
      </ThemeProvider>
    );
    expect(mockMapContext.dispatch).toHaveBeenCalledWith({
      type: "SET_DRAW_INSTANCE",
      payload: expect.objectContaining({
        modes: expect.any(Object),
        getFeatureIdsAt: expect.any(Function),
        getSelectedIds: expect.any(Function),
        getSelected: expect.any(Function),
        getSelectedPoints: expect.any(Function),
        set: expect.any(Function),
        add: expect.any(Function),
        get: expect.any(Function),
        getAll: expect.any(Function),
        delete: expect.any(Function),
        deleteAll: expect.any(Function),
        changeMode: expect.any(Function),
        getMode: expect.any(Function),
        trash: expect.any(Function),
        combineFeatures: expect.any(Function),
        uncombineFeatures: expect.any(Function),
        setFeatureProperty: expect.any(Function),
        onAdd: expect.any(Function),
        onRemove: expect.any(Function),
        types: expect.any(Object),
        options: expect.any(Object),
      }),
    });
  });
});

describe("handleMapHover is called or not", () => {
  const hoverCallBackMock = jest.fn();
  beforeEach(() => {
    on.mockImplementation((event, callback) => {
      if (event === "mousemove") hoverCallBackMock();
    });
    useMap.mockReturnValue({
      map: {
        addControl,
        on,
        getCanvas,
        off,
        getLayer,
        queryRenderedFeatures,
        setFilter,
        setFeatureState,
        getZoom,
      },
      isMapReady: true,
    });
    window.matchMedia = jest.fn().mockImplementation((query) => ({
      matches: false, // requirement to launch the function: hoverCallback
      media: query,
      onchange: null,
      addListener: jest.fn(),
      removeListener: jest.fn(),
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      dispatchEvent: jest.fn(),
    }));
  });
  it("handleMapHover is called if map exist", () => {
    render(
      <ThemeProvider theme={theme}>
        <FilterContext.Provider value={mockFilterContext}>
          <MapContext.Provider value={mockMapContext}>
            <Map {...props} />
          </MapContext.Provider>
        </FilterContext.Provider>
      </ThemeProvider>
    );
    expect(hoverCallBackMock).toHaveBeenCalled();
  });
  it("handleMapHover is not called because map doesn't exist", () => {
    useMap.mockReturnValue({
      // map: { addControl, on, getCanvas, off, getLayer, queryRenderedFeatures, setFilter, setFeatureState }, // is empty
      isMapReady: true,
    });
    render(
      <ThemeProvider theme={theme}>
        <FilterContext.Provider value={mockFilterContext}>
          <MapContext.Provider value={mockMapContext}>
            <Map {...props} />
          </MapContext.Provider>
        </FilterContext.Provider>
      </ThemeProvider>
    );
    expect(hoverCallBackMock).not.toHaveBeenCalled();
  });
});

describe("Tests of handleMapHover function", () => {
  let setTimeoutSpy;

  beforeEach(() => {
    mockMapContext = {
      ...mockMapContext,
      state: {
        ...mockMapContext.state,
        visualisedFeatureIds: { first: { value: 10 }, second: { value: 15 } },
        layers: {
          ...mockMapContext.state.layers,
          id: {
            ...mockMapContext.state.layers.id,
            hoverTipShouldIncludeMetadata: true,
          },
        },
      },
    };
    jest.useFakeTimers();
    setTimeoutSpy = jest.spyOn(global, "setTimeout");
    api.baseService.get.mockResolvedValue({
      data: "test data",
      someField: "value",
    });
    global.AbortController = jest.fn(() => ({
      signal: "signalMocked",
      abort: jest.fn(),
    }));
    getLayer.mockReturnValue(true);
    queryRenderedFeatures.mockReturnValue([
      {
        layer: {
          id: "id",
          source: "source",
          "source-layer": "source-layer",
        },
        id: "id",
        state: {
          value: 15,
        },
        properties: { name: "name", data: "data" },
      },
    ]);
    on.mockImplementation((event, callback) => {
      if (event === "mousemove") {
        const mockParams = {
          point: { x: 100, y: 200 },
          lngLat: { lng: 2.3522, lat: 48.8566 },
        };
        callback(mockParams);
      }
    });
    useMap.mockReturnValue({
      map: {
        addControl,
        on,
        getCanvas,
        off,
        getLayer,
        queryRenderedFeatures,
        setFilter,
        setFeatureState,
        getZoom,
      },
      isMapReady: true,
    });
  });
  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });
  it("Test without e.point", () => {
    on.mockImplementation((event, callback) => {
      if (event === "mousemove") {
        const mockParams = {
          point: null,
          lngLat: { lng: 2.3522, lat: 48.8566 },
        };
        callback(mockParams);
      }
    });
    useMap.mockReturnValue({
      map: {
        addControl,
        on,
        getCanvas,
        off,
        getLayer,
        queryRenderedFeatures,
        setFilter,
        setFeatureState,
        getZoom,
      },
      isMapReady: true,
    });
    render(
      <ThemeProvider theme={theme}>
        <FilterContext.Provider value={mockFilterContext}>
          <MapContext.Provider value={mockMapContext}>
            <Map {...props} />
          </MapContext.Provider>
        </FilterContext.Provider>
      </ThemeProvider>
    );
    expect(queryRenderedFeatures).not.toHaveBeenCalled();
  });
  it("should query all hoverable layers and set hover state when mouse moves over features", () => {
    mockMapContext = {
      ...mockMapContext,
      state: {
        ...mockMapContext.state,
        filters: [{ type: "map", layer: "first" }],
        visualisations: {
          visualisationName: {
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
      },
    };

    on.mockImplementation((eventName, callback) => {
      if (eventName === "click") {
        callback({
          type: "touchend",
          originalEvent: {
            changedTouches: [{ clientX: 42, clientY: 1337 }],
          },
        });
      } else {
        callback({
          type: eventName,
          originalEvent: {},
        });
      }
    });
    getLayer.mockReturnValue(true);
    getCanvas.mockReturnValue({
      getBoundingClientRect: jest.fn().mockReturnValue({ left: 0, top: 0 }),
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
    });
    useMap.mockReturnValue({
      map: {
        addControl,
        on,
        getCanvas,
        off,
        getLayer,
        queryRenderedFeatures,
        setFilter,
        setFeatureState,
        getZoom,
      },
      isMapReady: true,
    });

    render(
      <ThemeProvider theme={theme}>
        <FilterContext.Provider value={mockFilterContext}>
          <MapContext.Provider value={mockMapContext}>
            <Map {...props} />
          </MapContext.Provider>
        </FilterContext.Provider>
      </ThemeProvider>
    );

    expect(queryRenderedFeatures).toHaveBeenCalledWith(
      { x: 42, y: 1337 },
      { layers: ["first"] }
    );

    expect(setFeatureState).toHaveBeenCalledWith(
      { source: "source", id: "id", sourceLayer: "source-layer" },
      { selected: true }
    );
  });

  it("Function with customTooltip", () => {
    mockMapContext = {
      ...mockMapContext,
      state: {
        ...mockMapContext.state,
        layers: {
          ...mockMapContext.state.layers,
          id: {
            ...mockMapContext.state.layers.id,
            customTooltip: {
              requestUrl: "/{id}-requestUrl",
              htmlTemplate: "<p>htmlTemplate</p>",
              customFormattingFunctions: "customFormattingFunctions",
            },
          },
        },
      },
    };

    on.mockImplementation((eventName, callback) => {
      if (eventName === "click") {
        callback({
          type: "touchend",
          originalEvent: {
            changedTouches: [{ clientX: 42, clientY: 1337 }],
          },
        });
      } else {
        callback({
          type: eventName,
          originalEvent: {},
        });
      }
    });
    getLayer.mockReturnValue(true);
    getCanvas.mockReturnValue({
      getBoundingClientRect: jest.fn().mockReturnValue({ left: 0, top: 0 }),
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
    });
    useMap.mockReturnValue({
      map: {
        addControl,
        on,
        getCanvas,
        off,
        getLayer,
        queryRenderedFeatures,
        setFilter,
        setFeatureState,
        getZoom,
      },
      isMapReady: true,
    });

    render(
      <ThemeProvider theme={theme}>
        <FilterContext.Provider value={mockFilterContext}>
          <MapContext.Provider value={mockMapContext}>
            <Map {...props} />
          </MapContext.Provider>
        </FilterContext.Provider>
      </ThemeProvider>
    );
    expect(setTimeoutSpy).toHaveBeenCalled();

    // Advance time to pass setTimeout and lauch fetchData()
    act(() => {
      jest.advanceTimersByTime(100);
    });

    // get is called with a good url and signal
    expect(api.baseService.get).toHaveBeenCalledWith("/id-requestUrl", {
      signal: "signalMocked",
    });
  });

  it("should display 'Data unavailable' when API fails", async () => {
    mockMapContext.state.layers = {
      id: {
        hoverTipShouldIncludeMetadata: true,
        shouldHaveTooltipOnHover: true,
        customTooltip: {
          requestUrl: "/{id}-requestUrl",
          htmlTemplate: "<p>htmlTemplate</p>",
          customFormattingFunctions: {},
        },
      },
    };
    window.matchMedia = jest.fn().mockImplementation((query) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: jest.fn(),
      removeListener: jest.fn(),
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      dispatchEvent: jest.fn(),
    }));

    const apiError = new Error("Network error");
    api.baseService.get = jest.fn().mockRejectedValue(apiError);

    const consoleErrorSpy = jest.spyOn(console, "error").mockImplementation();

    let capturedPopup = null;
    const OriginalPopup = require("maplibre-gl").default.Popup;
    const PopupSpy = jest.fn(function (options) {
      const instance = new OriginalPopup(options);
      capturedPopup = instance;
      return instance;
    });
    require("maplibre-gl").default.Popup = PopupSpy;

    render(
      <ThemeProvider theme={theme}>
        <FilterContext.Provider value={mockFilterContext}>
          <MapContext.Provider value={mockMapContext}>
            <Map {...props} />
          </MapContext.Provider>
        </FilterContext.Provider>
      </ThemeProvider>
    );

    const mouseMoveCallback = on.mock.calls.find(
      (call) => call[0] === "mousemove"
    )[1];

    act(() => {
      mouseMoveCallback({
        point: { x: 100, y: 200 },
        lngLat: { lng: 0, lat: 0 },
      });
    });

    act(() => {
      jest.advanceTimersByTime(100);
    });

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "Failed to fetch tooltip data:",
      apiError
    );

    expect(capturedPopup.html).toContain("popup-content");
    expect(capturedPopup.html).toContain("feature-name");
    expect(capturedPopup.html).toContain("name");
    expect(capturedPopup.html).toContain("Data unavailable.");

    expect(capturedPopup.html).toMatch(
      /<div class="popup-content">[\s\S]*<p class="feature-name">name<\/p>[\s\S]*<p>Data unavailable\.<\/p>[\s\S]*<\/div>/
    );

    consoleErrorSpy.mockRestore();
  });
  it("features.length === 0", () => {
    queryRenderedFeatures.mockReturnValue([]);
    render(
      <ThemeProvider theme={theme}>
        <FilterContext.Provider value={mockFilterContext}>
          <MapContext.Provider value={mockMapContext}>
            <Map {...props} />
          </MapContext.Provider>
        </FilterContext.Provider>
      </ThemeProvider>
    );
  });
});

describe("handleLayerClick function test", () => {
  beforeEach(() => {
    mockMapContext = {
      ...mockMapContext,
      state: {
        ...mockMapContext.state,
        layers: {
          ...mockMapContext.state.layers,
          id: {
            ...mockMapContext.state.layers.id,
            shouldHaveTooltipOnClick: true,
          },
        },
      },
    };
    on.mockImplementation((event, callback) => {
      if (event === "click") {
        const mockParams = {
          point: { x: 100, y: 200 },
          lngLat: { lng: 2.3522, lat: 48.8566 },
        };
        callback(mockParams);
      }
    });
    queryRenderedFeatures.mockReturnValue([
      {
        id: 1,
        layer: {
          id: "id",
          source: "source",
          "source-layer": "source-layer",
        },
        state: {
          value: 15,
        },
        properties: {
          name: "name",
          id: "test-id",
          data: "data",
        },
      },
    ]);
    window.matchMedia = jest.fn().mockImplementation((query) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: jest.fn(),
      removeListener: jest.fn(),
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      dispatchEvent: jest.fn(),
    }));
  });

  it("queryRenderedFeatures is called with the great parameters", () => {
    const PopupSpy = jest.fn(function (options) {
      const instance = {
        options,
        coords: null,
        html: null,
        map: null,
        setLngLat: function (coords) {
          this.coords = coords;
          return this;
        },
        setHTML: function (html) {
          this.html = html;
          return this;
        },
        addTo: function (map) {
          this.map = map;
          return this;
        },
        remove: function () {
          return this;
        },
      };
      return instance;
    });

    require("maplibre-gl").default.Popup = PopupSpy;
    render(
      <ThemeProvider theme={theme}>
        <FilterContext.Provider value={mockFilterContext}>
          <MapContext.Provider value={mockMapContext}>
            <Map {...props} />
          </MapContext.Provider>
        </FilterContext.Provider>
      </ThemeProvider>
    );
    expect(queryRenderedFeatures).toHaveBeenCalledWith(
      [
        [100, 200],
        [100, 200],
      ],
      { layers: ["id"] }
    );
  });

  it("should call setLngLat, setHTML and addTo on popup", () => {
    let capturedPopup = null;

    const PopupSpy = jest.fn(function (options) {
      const instance = {
        options,
        coords: null,
        html: null,
        map: null,
        setLngLat: function (coords) {
          this.coords = coords;
          return this;
        },
        setHTML: function (html) {
          this.html = html;
          return this;
        },
        addTo: function (map) {
          this.map = map;
          return this;
        },
        remove: function () {
          return this;
        },
      };
      capturedPopup = instance;
      return instance;
    });

    require("maplibre-gl").default.Popup = PopupSpy;

    render(
      <ThemeProvider theme={theme}>
        <FilterContext.Provider value={mockFilterContext}>
          <MapContext.Provider value={mockMapContext}>
            <Map {...props} />
          </MapContext.Provider>
        </FilterContext.Provider>
      </ThemeProvider>
    );

    expect(capturedPopup).not.toBeNull();

    expect(capturedPopup.coords).toEqual({
      lng: 2.3522,
      lat: 48.8566,
    });

    expect(capturedPopup.html).toContain("name");
    expect(capturedPopup.html).toContain("Id: test-id");
    expect(capturedPopup.html).toContain("Value: 15");

    expect(capturedPopup.map).toBeDefined();
  });
});

describe("handleZoom function tests", () => {
  beforeEach(() => {
    mockMapContext = {
      ...mockMapContext,
      state: {
        ...mockMapContext.state,
        layers: {
          ...mockMapContext.state.layers,
          id: {
            ...mockMapContext.state.layers.id,
            shouldHaveLabel: true,
          },
        },
      },
    };
    on.mockImplementation((event, callback) => {
      if (event === "zoomend") {
        const mockParams = {
          point: { x: 100, y: 200 },
          lngLat: { lng: 2.3522, lat: 48.8566 },
        };
        callback(mockParams);
      }
    });
    querySourceFeatures.mockReturnValue([
      { geometry: { type: "firstType" } },
      { geometry: { type: "secondType" } },
    ]);
    getZoom.mockReturnValue(10); // 10 < 12
    getLayer.mockReturnValue("getLayer returned value");
  });
  it("Test when mapZoomLevel <= labelZoomLevel", () => {
    render(
      <ThemeProvider theme={theme}>
        <FilterContext.Provider value={mockFilterContext}>
          <MapContext.Provider value={mockMapContext}>
            <Map {...props} />
          </MapContext.Provider>
        </FilterContext.Provider>
      </ThemeProvider>
    );

    expect(getLayer).toHaveBeenCalledWith("id-label");
    expect(setLayoutProperty).toHaveBeenCalledWith(
      "id-label",
      "visibility",
      "none"
    );
  });

  it("Test when map.getLayer", () => {
    getZoom.mockReturnValue(14); // 14 > 12
    render(
      <ThemeProvider theme={theme}>
        <FilterContext.Provider value={mockFilterContext}>
          <MapContext.Provider value={mockMapContext}>
            <Map {...props} />
          </MapContext.Provider>
        </FilterContext.Provider>
      </ThemeProvider>
    );
    expect(setLayoutProperty).toHaveBeenCalledWith(
      "id-label",
      "visibility",
      "visible"
    );
  });
  it("Test when !map.getLayer", () => {
    getLayer.mockReturnValue(null);
    getZoom.mockReturnValue(14); // 14 > 12
    render(
      <ThemeProvider theme={theme}>
        <FilterContext.Provider value={mockFilterContext}>
          <MapContext.Provider value={mockMapContext}>
            <Map {...props} />
          </MapContext.Provider>
        </FilterContext.Provider>
      </ThemeProvider>
    );
    expect(querySourceFeatures).toHaveBeenCalledWith("id", {
      sourceLayer: undefined,
    });
    expect(addLayer).toHaveBeenCalledWith({
      id: "id-label",
      type: "symbol",
      source: "id",
      "source-layer": undefined,
      layout: {
        "text-field": ["get", "name"],
        "text-size": 14,
        "text-anchor": "center",
        "text-offset": [0, 1.5],
        "text-allow-overlap": false,
        "symbol-placement": "point",
        "symbol-spacing": 250,
      },
      paint: {
        "text-color": "#000000",
        "text-halo-color": "#ffffff",
        "text-halo-width": 2.5,
        "text-opacity": ["case", expect.any(Array), 0, 1],
      },
    });
  });
});

describe("Pan and centre map", () => {
  beforeEach(() => {
    mockMapContext = {
      ...mockMapContext,
      state: {
        ...mockMapContext.state,
        mapBoundsAndCentroid: {
          centroid: {
            coordinates: [5, 10],
          },
          bounds: {
            coordinates: [
              [
                [0, 0],
                [1, 1],
              ],
            ],
          },
        },
      },
    };
    queryRenderedFeatures.mockReturnValue([
      {
        id: 123,
        layer: {
          id: "id",
          source: "test-source",
          "source-layer": "test-source-layer",
        },
        properties: {
          name: "Test Feature",
        },
        state: {
          value: 10,
        },
      },
    ]);
  });

  it("Classic test", () => {
    render(
      <ThemeProvider theme={theme}>
        <FilterContext.Provider value={mockFilterContext}>
          <MapContext.Provider value={mockMapContext}>
            <Map {...props} />
          </MapContext.Provider>
        </FilterContext.Provider>
      </ThemeProvider>
    );
    expect(fitBounds).toHaveBeenCalledWith(
      [
        [0, 0],
        [1, 1],
      ],
      {
        padding: 100,
        maxZoom: 14,
        duration: 1000,
        linear: false,
      }
    );
  });
  it("Test when !bounds", () => {
    mockMapContext = {
      ...mockMapContext,
      state: {
        ...mockMapContext.state,
        mapBoundsAndCentroid: {
          centroid: {
            coordinates: [5, 10],
          },
        },
      },
    };
    render(
      <ThemeProvider theme={theme}>
        <FilterContext.Provider value={mockFilterContext}>
          <MapContext.Provider value={mockMapContext}>
            <Map {...props} />
          </MapContext.Provider>
        </FilterContext.Provider>
      </ThemeProvider>
    );
    expect(panTo).toHaveBeenCalledWith([5, 10], { duration: 1000 });
  });
});

describe("mouseLeaveCallback function test", () => {
  let canvasMock;

  beforeEach(() => {
    mockMapContext = {
      ...mockMapContext,
      state: {
        ...mockMapContext.state,
        visualisedFeatureIds: {
          first: {
            value: 10,
          },
        },
        layers: {
          ...mockMapContext.state.layers,
          id: {
            ...mockMapContext.state.layers.id,
            hoverNulls: true,
          },
        },
      },
    };

    jest.useFakeTimers();

    // need to create a popup to test it
    queryRenderedFeatures.mockReturnValue([
      {
        id: 123,
        layer: {
          id: "id",
          source: "test-source",
          "source-layer": "test-source-layer",
        },
        properties: {
          name: "Test Feature",
        },
        state: {
          value: 10,
        },
      },
    ]);
    getLayer.mockReturnValue(true);
    canvasMock = {
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      style: { cursor: "pointer" },
    };
    getCanvas.mockReturnValue(canvasMock);
    on.mockImplementation((event, callback) => {
      if (event === "mousemove") {
        const mockParams = {
          point: { x: 100, y: 200 },
          lngLat: { lng: 2.3522, lat: 48.8566 },
        };
        callback(mockParams);
      }
    });
    window.matchMedia = jest.fn().mockImplementation((query) => ({
      matches: false, // requirement to launch the function: hoverCallback
      media: query,
      onchange: null,
      addListener: jest.fn(),
      removeListener: jest.fn(),
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      dispatchEvent: jest.fn(),
    }));
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it("should trigger mouseLeaveCallback", async () => {
    render(
      <ThemeProvider theme={theme}>
        <FilterContext.Provider value={mockFilterContext}>
          <MapContext.Provider value={mockMapContext}>
            <Map {...props} />
          </MapContext.Provider>
        </FilterContext.Provider>
      </ThemeProvider>
    );

    const mouseLeaveCall = canvasMock.addEventListener.mock.calls.find(
      (call) => call[0] === "mouseleave"
    );

    expect(mouseLeaveCall).toBeDefined();
    const mouseLeaveCallback = mouseLeaveCall[1];

    await act(async () => {
      mouseLeaveCallback();
    });
  });
  it("prevHoveredFeaturesRef.current is not empty", async () => {
    render(
      <ThemeProvider theme={theme}>
        <FilterContext.Provider value={mockFilterContext}>
          <MapContext.Provider value={mockMapContext}>
            <Map {...props} />
          </MapContext.Provider>
        </FilterContext.Provider>
      </ThemeProvider>
    );

    const mousemoveCallback = on.mock.calls.find(
      (call) => call[0] === "mousemove"
    )?.[1];

    expect(mousemoveCallback).toBeDefined();

    await act(async () => {
      mousemoveCallback({
        point: { x: 100, y: 200 },
        lngLat: { lng: 2.3522, lat: 48.8566 },
      });
    });

    expect(setFeatureState).toHaveBeenCalledWith(
      { source: "test-source", id: 123, sourceLayer: "test-source-layer" },
      { hover: true }
    );
  });
});

describe("Map style toggle and transformStyle", () => {
  it("pushes base place labels on top of custom application layers during style change", () => {
    const currentMapStyle = () => "https://maps.geoapify.com/v1/styles/positron/style.json";
    const contextWithStyle = {
      ...mockMapContext,
      state: {
        ...mockMapContext.state,
        mapStyle: currentMapStyle,
      },
    };

    const { rerender } = render(
      <ThemeProvider theme={theme}>
        <FilterContext.Provider value={mockFilterContext}>
          <MapContext.Provider value={contextWithStyle}>
            <Map {...props} />
          </MapContext.Provider>
        </FilterContext.Provider>
      </ThemeProvider>
    );

    // Initial render skips setStyle
    expect(setStyle).not.toHaveBeenCalled();

    // Toggle style
    registerInitialBaseSources(useMap.mock.results[0]?.value?.map, new Set(["default"]));
    const nextStyleUrl = "https://tiles.openfreemap.org/styles/dark";
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
            <Map {...props} />
          </MapContext.Provider>
        </FilterContext.Provider>
      </ThemeProvider>
    );

    expect(setStyle).toHaveBeenCalledWith(nextStyleUrl, expect.objectContaining({
      transformStyle: expect.any(Function),
    }));
    expect(once).toHaveBeenCalledWith("style.load", expect.any(Function));
    expect(once).not.toHaveBeenCalledWith("idle", expect.any(Function));

    // Test the transformStyle function directly
    const { transformStyle } = setStyle.mock.calls[0][1];
    const previousStyle = {
      sources: {
        default: { type: "vector" },
        "app-source": { type: "geojson" },
      },
      layers: [
        { id: "background", type: "background" },
        { id: "place_town", type: "symbol", source: "default" },
        { id: "custom-polygon", type: "fill", source: "app-source" },
        { id: "place_markers", type: "symbol", source: "app-source" },
      ],
    };
    const incomingDarkLayout = {
      "text-font": ["Provider Sans"],
      "text-size": ["interpolate", ["linear"], ["zoom"], 5, 10, 12, 16],
      "text-anchor": "center",
    };
    const nextStyle = {
      sources: {
        openmaptiles: { type: "vector" },
      },
      layers: [
        { id: "dark-background", type: "background" },
        { id: "place_town", type: "symbol", source: "openmaptiles", layout: incomingDarkLayout },
        { id: "place_village", type: "symbol", source: "openmaptiles" },
      ],
    };

    const transformed = transformStyle(previousStyle, nextStyle);

    // Custom sources should contain only app-source
    expect(transformed.sources["app-source"]).toBeDefined();
    expect(transformed.sources.default).toBeUndefined();

    // Layers order should place base labels AFTER custom layers
    const layerIds = transformed.layers.map((l) => l.id);
    expect(layerIds).toEqual([
      "dark-background",
      "custom-polygon",
      "place_markers",
      "place_town",
      "place_village",
    ]);

    // Base place labels in dark mode should have enhanced paint properties and bold font layout
    const placeTown = transformed.layers.find((l) => l.id === "place_town");
    expect(placeTown.paint["text-color"]).toBe("#ffffff");
    expect(placeTown.paint["text-halo-color"]).toBe("rgba(0, 0, 0, 0.85)");
    expect(placeTown.paint["text-halo-width"]).toBe(1.25);
    expect(placeTown.layout["text-font"]).toEqual(["Noto Sans Bold"]);
    expect(placeTown.layout["text-size"]).toEqual(incomingDarkLayout["text-size"]);
    expect(placeTown.layout["text-anchor"]).toBe("center");

    // Toggle style back to normal mode
    const lightContext = {
      ...mockMapContext,
      state: {
        ...mockMapContext.state,
        baseMapId: "positron",
      },
    };

    rerender(
      <ThemeProvider theme={theme}>
        <FilterContext.Provider value={mockFilterContext}>
          <MapContext.Provider value={lightContext}>
            <Map {...props} />
          </MapContext.Provider>
        </FilterContext.Provider>
      </ThemeProvider>
    );

    const { transformStyle: lightTransformStyle } = setStyle.mock.calls[1][1];
    const originalLightTown = {
      id: "place_town",
      type: "symbol",
      source: "default",
      paint: { "text-color": "#333333" },
      layout: { "text-size": 12, "text-font": ["Noto Sans Regular"] },
    };
    const normalTransformed = lightTransformStyle(nextStyle, {
      sources: { default: { type: "vector" } },
      layers: [
        { id: "light-bg", type: "background" },
        originalLightTown,
      ],
    });
    const normalTown = normalTransformed.layers.find((l) => l.id === "place_town");
    expect(normalTown.layout["text-font"]).toEqual(["Noto Sans Bold"]);
    expect(normalTown.layout["text-size"]).toBe(12);
    expect(normalTown.paint["text-color"]).toBe("#1f1f1f");
    expect(normalTown.paint["text-halo-color"]).toBe("rgba(255, 255, 255, 0.9)");
    expect(normalTown.paint["text-halo-width"]).toBe(1.25);
  });
});
