import { MapContext } from "contexts/MapContext";
import { AppContext } from "contexts/AppContext";
import { MapVisualisation } from "./MapVisualisation";
import { render, screen, waitFor } from "@testing-library/react";
import { actionTypes } from "reducers";
import { DataFetchState } from "enums";

jest.mock("hooks/useFetchVisualisationData", () => ({
  useFetchVisualisationData: jest.fn(),
}));
jest.mock("utils", () => ({
  ...jest.requireActual("utils"),
  hasAnyGeometryNotNull: jest.fn(),
  createPaintProperty: jest.fn(),
  reclassifyGeoJSONData: jest.fn(),
  reclassifyData: jest.fn(),
}));
import { useFetchVisualisationData } from "hooks/useFetchVisualisationData";
import {
  hasAnyGeometryNotNull,
  createPaintProperty,
  reclassifyGeoJSONData,
  reclassifyData,
} from "utils";
import { registerMapRestorer } from "../../map/runtimeRestorationRegistry";

jest.mock("../../map/runtimeRestorationRegistry", () => ({
  registerMapRestorer: jest.fn(() => jest.fn()),
}));

jest.mock("maplibre-gl", () => ({
  Map: jest.fn(() => ({
    on: jest.fn(),
    off: jest.fn(),
    remove: jest.fn(),
    addLayer: jest.fn(),
    setStyle: jest.fn(),
    flyTo: jest.fn(),
  })),
}));
let mockAppContext = {
  appPages: [
    {
      url: "/",
    },
  ],
};
let mockMapContext = {
  state: {
    visualisations: {
      visualisationName: {
        shouldFilterDataToViewport: true,
        type: "geojson",
        style: "line-continuous",
      },
    },
    map: {},
    maps: [
      {
        getLayer: jest.fn(),
        removeLayer: jest.fn(),
        removeSource: jest.fn(),
        getSource: jest.fn(),
        addSource: jest.fn(),
        addLayer: jest.fn(),
      },
    ],
    paramNameToUuidMap: {
      paramToReplace1: "first",
      paramToReplace2: "second",
    },
    layers: {
      visualisationName: {},
    },
    colorSchemesByLayer: {
      visualisationName: {},
    },
    leftVisualisations: {
      visualisationName: {},
    },
    rightVisualisations: {
      visualisationName: {},
    },
  },
  dispatch: jest.fn(),
};

let props = {
  visualisationName: "visualisationName",
  map: {
    getLayer: jest.fn(),
    getSource: jest.fn(),
    addSource: jest.fn(),
    getStyle: jest.fn(),
    addLayer: jest.fn(),
    on: jest.fn(),
    isStyleLoaded: jest.fn(() => true),
  },
};

describe("useFetchVisualisationData is called with the good params", () => {
  beforeEach(() => {
    useFetchVisualisationData.mockReturnValue({
      data: {},
      isLoading: false,
      error: false,
      dataWasReturnedButFiltered: false,
      fetchState: DataFetchState.SUCCESS,
      resetFetchState: jest.fn(),
    });
  });
  afterEach(() => {
    jest.clearAllMocks();
  });
  it("useFetchVisualisationData", () => {
    render(
      <MapContext.Provider value={mockMapContext}>
        <MapVisualisation {...props} />
      </MapContext.Provider>
    );

    expect(useFetchVisualisationData).toHaveBeenCalledWith(
      {
        shouldFilterDataToViewport: true,
        style: "line-continuous",
        type: "geojson",
      },
      {
        map: {
          getLayer: expect.any(Function),
          getSource: expect.any(Function),
          addSource: expect.any(Function),
          getStyle: expect.any(Function),
          addLayer: expect.any(Function),
          on: expect.any(Function),
          isStyleLoaded: expect.any(Function),
        },
        mapLayerId: "visualisationName",
        shouldFilterDataToViewport: true,
        debounceMs: 0,
      }
    );
  });
});

describe("Check dispatch function is well throw", () => {
  beforeEach(() => {
    useFetchVisualisationData.mockReturnValue({
      data: null,
      isLoading: true,
      error: false,
      dataWasReturnedButFiltered: false,
      fetchState: DataFetchState.LOADING,
      resetFetchState: jest.fn(),
    });
  });
  afterEach(() => {
    jest.clearAllMocks();
  });
  it("INCREMENT_VISUALISATION_LOADING", () => {
    render(
      <MapContext.Provider value={mockMapContext}>
        <MapVisualisation {...props} />
      </MapContext.Provider>
    );

    expect(mockMapContext.dispatch).toHaveBeenCalledWith({
      type: actionTypes.INCREMENT_VISUALISATION_LOADING,
    });
    expect(mockMapContext.dispatch).toHaveBeenCalledWith({
      type: actionTypes.SET_DATA_REQUESTED,
      payload: true,
    });
  });

  it("does not decrement on first render when isLoading starts false", () => {
    useFetchVisualisationData.mockReturnValue({
      data: {},
      isLoading: false,
      error: false,
      dataWasReturnedButFiltered: false,
      fetchState: DataFetchState.SUCCESS,
      resetFetchState: jest.fn(),
    });
    render(
      <MapContext.Provider value={mockMapContext}>
        <MapVisualisation {...props} />
      </MapContext.Provider>
    );

    expect(mockMapContext.dispatch).not.toHaveBeenCalledWith({
      type: actionTypes.DECREMENT_VISUALISATION_LOADING,
    });
  });
});

describe("Case of no data", () => {
  beforeEach(() => {
    useFetchVisualisationData.mockReturnValue({
      data: [],
      isLoading: false,
      error: false,
      dataWasReturnedButFiltered: false,
      fetchState: DataFetchState.EMPTY,
      resetFetchState: jest.fn(),
    });
  });
  afterEach(() => {
    jest.clearAllMocks();
  });
  it("visualisationData && visualisationData.length === 0) && !dataWasReturnedButFiltered", () => {
    render(
      <MapContext.Provider value={mockMapContext}>
        <MapVisualisation {...props} />
      </MapContext.Provider>
    );
    expect(mockMapContext.dispatch).toHaveBeenCalledWith({
      type: actionTypes.SET_NO_DATA_RETURNED,
      payload: true,
    });
  });

  it("visualisationData || dataWasReturnedButFiltered", () => {
    useFetchVisualisationData.mockReturnValue({
      data: [],
      isLoading: false,
      error: false,
      dataWasReturnedButFiltered: true,
      fetchState: DataFetchState.SUCCESS,
      resetFetchState: jest.fn(),
    });
    render(
      <MapContext.Provider value={mockMapContext}>
        <MapVisualisation {...props} />
      </MapContext.Provider>
    );
    expect(mockMapContext.dispatch).toHaveBeenCalledWith({
      type: actionTypes.SET_NO_DATA_RETURNED,
      payload: false,
    });
  });

  it("error", () => {
    useFetchVisualisationData.mockReturnValue({
      isLoading: false,
      error: true,
      dataWasReturnedButFiltered: false,
      fetchState: DataFetchState.ERROR,
      resetFetchState: jest.fn(),
    });
    render(
      <MapContext.Provider value={mockMapContext}>
        <MapVisualisation {...props} />
      </MapContext.Provider>
    );
    expect(mockMapContext.dispatch).toHaveBeenCalledWith({
      type: actionTypes.SET_NO_DATA_RETURNED,
      payload: true,
    });
  });
});

describe("Updating data with UPDATE_ALL_DATA", () => {
  beforeEach(() => {
    useFetchVisualisationData.mockReturnValue({
      data: ["firstELement"],
      isLoading: false,
      error: false,
      dataWasReturnedButFiltered: false,
      fetchState: DataFetchState.SUCCESS,
      resetFetchState: jest.fn(),
    });
  });
  afterEach(() => {
    jest.clearAllMocks();
  });
  it("UPDATE_ALL_DATA", () => {
    render(
      <MapContext.Provider value={mockMapContext}>
        <MapVisualisation {...props} />
      </MapContext.Provider>
    );
    expect(mockMapContext.dispatch).toHaveBeenCalledWith({
      type: actionTypes.UPDATE_ALL_DATA,
      payload: {
        visualisationName: "visualisationName",
        data: ["firstELement"],
        // On a single-map page the visualisation draws on the only pane.
        paneId: "main",
      },
    });
  });
});

describe("Tests of reclassifyAndStyleGeoJSONMap function", () => {
  beforeEach(() => {
    useFetchVisualisationData.mockReturnValue({
      data: [
        {
          feature_collection: JSON.stringify({
            element: "first",
          }),
        },
      ],
      isLoading: false,
      error: false,
      dataWasReturnedButFiltered: false,
      fetchState: DataFetchState.SUCCESS,
      resetFetchState: jest.fn(),
    });

    hasAnyGeometryNotNull.mockReturnValue(true);

    reclassifyGeoJSONData.mockReturnValue("#More9Caracters");

    props.map.getStyle.mockReturnValue({ layers: [{ id: "firstLayersID" }] });
  });
  afterEach(() => {
    jest.clearAllMocks();
  });
  it("Test", () => {
    render(
      <MapContext.Provider value={mockMapContext}>
        <MapVisualisation {...props} />
      </MapContext.Provider>
    );
    // check the "featureCollection" param of hasAnyGeometryNotNull function
    expect(hasAnyGeometryNotNull).toHaveBeenCalledWith({ element: "first" });
    // check the "style" param of hasAnyGeometryNotNull function
    expect(createPaintProperty).toHaveBeenCalledWith(
      expect.anything(),
      "line-continuous",
      expect.anything(),
      expect.anything(),
      {}
    );
  });

  it("styles a feature_collection object when no tile layer shares the visualisation name", () => {
    useFetchVisualisationData.mockReturnValue({
      data: {
        feature_collection: JSON.stringify({
          type: "FeatureCollection",
          features: [{ type: "Feature", geometry: { type: "Polygon" }, properties: { category: "on time" } }],
        }),
      },
      isLoading: false,
      error: false,
      dataWasReturnedButFiltered: false,
      fetchState: DataFetchState.SUCCESS,
      resetFetchState: jest.fn(),
    });

    const contextWithoutMatchingLayer = {
      ...mockMapContext,
      state: {
        ...mockMapContext.state,
        layers: { "Origin Zones": { name: "Origin Zones" } },
      },
    };

    render(
      <MapContext.Provider value={contextWithoutMatchingLayer}>
        <MapVisualisation {...props} />
      </MapContext.Provider>
    );

    expect(hasAnyGeometryNotNull).toHaveBeenCalledWith({
      type: "FeatureCollection",
      features: [{ type: "Feature", geometry: { type: "Polygon" }, properties: { category: "on time" } }],
    });
  });
});

describe("reclassifyAndStyleMap is called", () => {
  beforeEach(() => {
    mockMapContext = {
      ...mockMapContext,
      state: {
        ...mockMapContext.state,
        visualisations: {
          ...mockMapContext.state.visualisations,
          visualisationName: {
            ...mockMapContext.state.visualisations.visualisationName,
            type: "joinDataToMap",
            joinLayer: "visualisationName",
          },
        },
      },
    };
    useFetchVisualisationData.mockReturnValue({
      data: [
        {
          feature_collection: JSON.stringify({
            element: "first",
          }),
        },
      ],
      isLoading: false,
      error: false,
      dataWasReturnedButFiltered: false,
      fetchState: DataFetchState.SUCCESS,
      resetFetchState: jest.fn(),
    });

    hasAnyGeometryNotNull.mockReturnValue(true);

    reclassifyGeoJSONData.mockReturnValue("#More9Caracters");

    reclassifyData.mockReturnValue("#More9Caracters");

    props.map.getStyle.mockReturnValue({ layers: [{ id: "firstLayersID" }] });
    props.map.getLayer.mockReturnValue({ id: "mock-layer" });
    props.map.isStyleLoaded.mockReturnValue(true);
  });
  afterEach(() => {
    jest.clearAllMocks();
  });
  it("Test", () => {
    render(
      <AppContext.Provider value={mockAppContext}>
        <MapContext.Provider value={mockMapContext}>
          <MapVisualisation {...props} />
        </MapContext.Provider>
      </AppContext.Provider>
    );
    return waitFor(() => {
      expect(reclassifyData).toHaveBeenCalledWith(
        [{ feature_collection: '{"element":"first"}' }],
        "line-continuous",
        "d",
        undefined,
        { url: "/" },
        undefined,
        { bandMetricName: undefined, customBands: undefined, defaultClassification: undefined, displayMode: "absolute" }
      );
    });
  });
});

describe("customBandsHasChanged triggers reclassification", () => {
  const baseVisualisationData = [
    { feature_collection: JSON.stringify({ element: "first" }) },
  ];

  const baseVisualisation = {
    shouldFilterDataToViewport: true,
    style: "line-continuous",
    type: "joinDataToMap",
    joinLayer: "visualisationName",
  };

  beforeEach(() => {
    useFetchVisualisationData.mockReturnValue({
      data: baseVisualisationData,
      isLoading: false,
      error: false,
      dataWasReturnedButFiltered: false,
      fetchState: DataFetchState.SUCCESS,
      resetFetchState: jest.fn(),
    });
    hasAnyGeometryNotNull.mockReturnValue(true);
    reclassifyData.mockReturnValue("#More9Caracters");
    props.map.getStyle.mockReturnValue({ layers: [{ id: "firstLayersID" }] });
    props.map.getLayer.mockReturnValue({ id: "mock-layer" });
    props.map.isStyleLoaded.mockReturnValue(true);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it("triggers reclassification when customBands are set for the first time", async () => {
    const contextNoCustomBands = {
      ...mockMapContext,
      state: {
        ...mockMapContext.state,
        visualisations: { visualisationName: baseVisualisation },
        layers: { visualisationName: {} },
      },
    };

    const { rerender } = render(
      <AppContext.Provider value={mockAppContext}>
        <MapContext.Provider value={contextNoCustomBands}>
          <MapVisualisation {...props} />
        </MapContext.Provider>
      </AppContext.Provider>
    );

    // Wait for the initial reclassification to complete, then reset mocks.
    await waitFor(() => expect(reclassifyData).toHaveBeenCalled());
    jest.clearAllMocks();
    reclassifyData.mockReturnValue("#More9Caracters");

    // Re-render with customBands set for the first time.
    const contextWithCustomBands = {
      ...contextNoCustomBands,
      state: {
        ...contextNoCustomBands.state,
        layers: { visualisationName: { customBands: [0, 5000] } },
      },
    };

    rerender(
      <AppContext.Provider value={mockAppContext}>
        <MapContext.Provider value={contextWithCustomBands}>
          <MapVisualisation {...props} />
        </MapContext.Provider>
      </AppContext.Provider>
    );

    await waitFor(() => expect(reclassifyData).toHaveBeenCalled());
  });
});

describe("drawing on the left pane", () => {
  beforeEach(() => {
    props = {
      ...props,
      paneId: "left",
    };

    useFetchVisualisationData.mockReturnValue({
      data: [
        {
          feature_collection: JSON.stringify({
            element: "first",
          }),
        },
      ],
      isLoading: false,
      error: false,
      dataWasReturnedButFiltered: false,
    });
  });

  it("Test", () => {
    render(
      <AppContext.Provider value={mockAppContext}>
        <MapContext.Provider value={mockMapContext}>
          <MapVisualisation {...props} />
        </MapContext.Provider>
      </AppContext.Provider>
    );
  });
});

describe("MapVisualisation restoration registration", () => {
  beforeEach(() => {
    useFetchVisualisationData.mockReturnValue({
      data: [],
      isLoading: false,
      error: false,
      dataWasReturnedButFiltered: false,
    });
  });

  it("registers feature-state restorer on mount and cleans up on unmount", () => {
    const cleanupSpy = jest.fn();
    registerMapRestorer.mockReturnValue(cleanupSpy);

    const testMap = {
      getLayer: jest.fn(),
      getSource: jest.fn(),
      addSource: jest.fn(),
      getStyle: jest.fn(),
      addLayer: jest.fn(),
      on: jest.fn(),
      isStyleLoaded: jest.fn(() => true),
    };

    const { unmount } = render(
      <AppContext.Provider value={mockAppContext}>
        <MapContext.Provider value={mockMapContext}>
          <MapVisualisation visualisationName="visualisationName" map={testMap} />
        </MapContext.Provider>
      </AppContext.Provider>
    );

    expect(registerMapRestorer).toHaveBeenCalledWith(
      testMap,
      "feature-state:visualisationName",
      expect.any(Function)
    );

    unmount();

    expect(cleanupSpy).toHaveBeenCalled();
  });

  it("registers the left and right panes' maps independently", () => {
    const leftMap = {
      getLayer: jest.fn(),
      getSource: jest.fn(),
      addSource: jest.fn(),
      getStyle: jest.fn(),
      addLayer: jest.fn(),
      on: jest.fn(),
      isStyleLoaded: jest.fn(() => true),
    };
    const rightMap = {
      getLayer: jest.fn(),
      getSource: jest.fn(),
      addSource: jest.fn(),
      getStyle: jest.fn(),
      addLayer: jest.fn(),
      on: jest.fn(),
      isStyleLoaded: jest.fn(() => true),
    };

    render(
      <AppContext.Provider value={mockAppContext}>
        <MapContext.Provider value={mockMapContext}>
          <MapVisualisation visualisationName="visualisationName" map={leftMap} paneId="left" />
          <MapVisualisation visualisationName="visualisationName" map={rightMap} paneId="right" />
        </MapContext.Provider>
      </AppContext.Provider>
    );

    expect(registerMapRestorer).toHaveBeenCalledWith(
      leftMap,
      "feature-state:visualisationName",
      expect.any(Function)
    );
    expect(registerMapRestorer).toHaveBeenCalledWith(
      rightMap,
      "feature-state:visualisationName",
      expect.any(Function)
    );
  });
});
