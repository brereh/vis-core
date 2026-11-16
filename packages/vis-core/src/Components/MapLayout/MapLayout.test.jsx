import { render, screen } from "@testing-library/react";
import { resolveMapGrid } from "../../map/resolveMapGrid";
import { MapLayout } from ".";
import { AppContext, FilterContext, MapContext } from "contexts";
import { PageContext } from "contexts";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "styled-components";

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
let theme = {
  mq: {
    mobile: "mobile",
  },
};
let mockMapContext = {
  state: {
    mapStyle: "default",
    mapCentre: [0, 0],
    mapZoom: 10,
    layers: {},
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
    metadataTables: {},
    metadataFilters: [],
    // As MapContext leaves them: each filter knows the map panes it targets.
    filters: [
      {
        actions: [{ action: "action" }],
        filterName: "Left",
        visualisations: ["Side"],
        defaultValue: "defaultValue",
        panes: ["left"],
      },
    ],
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
const mockPageContext = {
  config: {
    filters: [
      {
        name: "name1",
        containsLegendInfo: false,
      },
      {
        name: "name2",
        containsLegendInfo: true,
      },
    ],
    additionalFeatures: "additionalFeatures",
  },
  pageName: "pageName",
  current: "",
};
const mockAppContexte = {
  //   state: {
  appPages: [{ url: "/" }, { url: "/other" }],
  footer: {
    creditsText: "Im a credits text",
    privacyPolicyLink: "/privacyPolicyLink",
    cookiesLink: "/cookiesLink",
    contactUsLink: "/contactUsLink",
  },
  homePageFragments: [
    {
      id: 1,
      htmlContent: `<p>Fragment 1 content</p>`,
      images: ["https://example1.1", "https://example1.2"],
      content: "foo",
      apiConfig: null,
      sectionTitle: "sectionTitle1",
      alignment: "alignment",
    },
    {
      id: 2,
      htmlContent: `<p>Fragment 2 content with image</p>`,
      content: "bar",
      images: ["https://example2.1"],
      apiConfig: null,
      sectionTitle: "sectionTitle2",
    },
  ],
  //   },
  background: "background",
  methodology: "methodology",
  additionalImage: "additionalImage",
  title: "My App Title",
  backgroundImage: "backgroundImage",
  introduction: "introduction",
  contactText: "contactText",
  contactEmail: "contactEmail",
  legalText: "legalText",
};

jest.mock("Components/Dimmer", () => ({
    Dimmer: ({ dimmed, showLoader }) => {
      return (
        <>
          <div>dimmed: {dimmed ? "true" : "false"}</div>
          <div>showLoader: {showLoader ? "true" : "false"}</div>
        </>
      );
    }
  }));
  jest.mock("Components/Sidebar", () => ({
    Sidebar: ({
      pageName,
      aboutVisualisationText,
      filters,
      legalText,
      onFilterChange,
      bgColor,
      additionalFeatures,
      infoBoxText,
      children,
    }) => {
      return (
        <>
          <button onClick={onFilterChange}>Sidebar</button>
          {children}
        </>
      );
    }
  }));
  jest.mock("Components/Sidebar/Accordion", () => ({
    MapLayerSection: ({ handleColorChange, handleClassificationChange, handleCustomBandsChange }) => {
      return (
        <>
          <span>MapLayerSection</span>
          <button onClick={handleColorChange}>handleColorChange</button>
          <button onClick={handleClassificationChange}>
            handleClassificationChange
          </button>
          <button onClick={handleCustomBandsChange}>
            handleCustomBandsChange
          </button>
        </>
      );
    }
  }));
jest.mock("./Map", () => ({
  Map: ({ extraCopyrightText }) => <div>Map: {extraCopyrightText}</div>,
}));
jest.mock("./DualMaps", () => ({
  DualMaps: ({ extraCopyrightText }) => (
    <div>DualMaps: {extraCopyrightText}</div>
  ),
}));

describe("MapLayout component test", () => {
  it("Basic use", async () => {
    render(
      <ThemeProvider theme={theme}>
        <AppContext.Provider value={mockAppContexte}>
          <PageContext.Provider value={mockPageContext}>
            <FilterContext.Provider value={mockFilterContext}>
              <MapContext.Provider value={mockMapContext}>
                <MapLayout />
              </MapContext.Provider>
            </FilterContext.Provider>
          </PageContext.Provider>
        </AppContext.Provider>
      </ThemeProvider>
    );
    // Dimmed check
    expect(screen.getByText(/dimmed: false/)).toBeInTheDocument();
    expect(screen.getByText(/showLoader: true/)).toBeInTheDocument();
    // Sidebar
    const buttonSidebar = screen.getByRole("button", { name: "Sidebar" });
    await userEvent.click(buttonSidebar);
    expect(mockMapContext.dispatch).toHaveBeenCalled();
    // MapLayerSection in the Sidebar
    // handleColorChangeButton is called
    const handleColorChangeButton = screen.getByRole("button", {
      name: "handleColorChange",
    });
    await userEvent.click(handleColorChangeButton);
    expect(mockMapContext.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "UPDATE_COLOR_SCHEME",
      })
    );
    // handleClassificationChangeButton is called
    const handleClassificationChangeButton = screen.getByRole("button", {
      name: "handleClassificationChange",
    });
    await userEvent.click(handleClassificationChangeButton);
    expect(mockMapContext.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "UPDATE_CLASSIFICATION_METHOD",
      })
    );
    // handleCustomBandsChange is called
    const handleCustomBandsChangeButton = screen.getByRole("button", {
      name: "handleCustomBandsChange",
    });
    await userEvent.click(handleCustomBandsChangeButton);
    expect(mockMapContext.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "UPDATE_CUSTOM_BANDS",
      })
    );
  });

  it("Use of !initializedRef.current && state.pageIsReady is good", async () => {
    render(
      <ThemeProvider theme={theme}>
        <AppContext.Provider value={mockAppContexte}>
          <PageContext.Provider value={mockPageContext}>
            <FilterContext.Provider value={mockFilterContext}>
              <MapContext.Provider value={mockMapContext}>
                <MapLayout />
              </MapContext.Provider>
            </FilterContext.Provider>
          </PageContext.Provider>
        </AppContext.Provider>
      </ThemeProvider>
    );
    // expect dispatch is called
    const parametersExpected = {
      type: "action",
      payload: {
        filter: {
          actions: [{ action: "action" }],
          filterName: "Left",
          visualisations: ["Side"],
          defaultValue: "defaultValue",
          panes: ["left"],
        },
        value: "defaultValue",
        panes: ["left"],
      },
    };
    expect(mockMapContext.dispatch).toHaveBeenCalledWith(parametersExpected);
  });

  it("filterDispatch is called to reset filters", async () => {
    const { rerender } = render(
      <ThemeProvider theme={theme}>
        <AppContext.Provider value={mockAppContexte}>
          <PageContext.Provider value={mockPageContext}>
            <FilterContext.Provider value={mockFilterContext}>
              <MapContext.Provider value={mockMapContext}>
                <MapLayout />
              </MapContext.Provider>
            </FilterContext.Provider>
          </PageContext.Provider>
        </AppContext.Provider>
      </ThemeProvider>
    );
    // filterDispatch is not called because pageContext is not change yet
    expect(mockFilterContext.dispatch).not.toHaveBeenCalled();

    // Change the PageContext
    const newPageContext = {
      pageName: "page2",
      config: { someConfig: "value2" },
    };
    rerender(
      <ThemeProvider theme={theme}>
        <AppContext.Provider value={mockAppContexte}>
          <PageContext.Provider value={newPageContext}>
            <FilterContext.Provider value={mockFilterContext}>
              <MapContext.Provider value={mockMapContext}>
                <MapLayout />
              </MapContext.Provider>
            </FilterContext.Provider>
          </PageContext.Provider>
        </AppContext.Provider>
      </ThemeProvider>
    );
    expect(mockFilterContext.dispatch).toHaveBeenCalledWith({
      type: "RESET_FILTERS",
    });
  });
});

describe("tests when !filter.visualisations[0].includes(`Side`)", () => {
  let mockMapContext2;
  beforeEach(() => {
    mockMapContext2 = {
      ...mockMapContext,
      state: {
        ...mockMapContext.state,
        filters: [
          {
            actions: [{ action: "UPDATE_COLOR_SCHEME" }],
            filterName: "Left",
            visualisations: ["Other"],
            defaultValue: "defaultValue",
            values: {
              values: [{ paramValue: "dropdown", colourValue: "colourValue" }],
            },
            id: "dropdown",
          },
        ],
      },
    };
  });
  afterEach(() => {
    jest.clearAllMocks();
  });

  it("Test when action = UPDATE_COLOR_SCHEME", () => {
    render(
      <ThemeProvider theme={theme}>
        <AppContext.Provider value={mockAppContexte}>
          <PageContext.Provider value={mockPageContext}>
            <FilterContext.Provider value={mockFilterContext}>
              <MapContext.Provider value={mockMapContext2}>
                <MapLayout />
              </MapContext.Provider>
            </FilterContext.Provider>
          </PageContext.Provider>
        </AppContext.Provider>
      </ThemeProvider>
    );
    // expect dispatch is called with type = UPDATE_COLOR_SCHEME
    expect(mockMapContext2.dispatch).toHaveBeenCalledWith({
      type: "UPDATE_COLOR_SCHEME",
      payload: {
        filter: {
          actions: [{ action: "UPDATE_COLOR_SCHEME" }],
          filterName: "Left",
          visualisations: ["Other"],
          defaultValue: "defaultValue",
          values: {
            values: [{ paramValue: "dropdown", colourValue: "colourValue" }],
          },
          id: "dropdown",
        },
        value: "dropdown",
        color_scheme: "colourValue",
      },
    });
  });

  it("dispatches multiselect values without treating them as scalar options", () => {
    const multiFilterContext = {
      ...mockFilterContext,
      state: {
        ...mockFilterContext.state,
        multi: ["bus", "rail"],
      },
      dispatch: jest.fn(),
    };

    const multiMapContext = {
      ...mockMapContext,
      dispatch: jest.fn(),
      state: {
        ...mockMapContext.state,
        filters: [
          {
            actions: [{ action: "UPDATE_COLOR_SCHEME" }],
            filterName: "Mode",
            visualisations: ["Other"],
            multiSelect: true,
            values: {
              values: [
                { paramValue: "bus", colourValue: "red" },
                { paramValue: "rail", colourValue: "blue" },
              ],
            },
            id: "multi",
          },
        ],
      },
    };

    render(
      <ThemeProvider theme={theme}>
        <AppContext.Provider value={mockAppContexte}>
          <PageContext.Provider value={mockPageContext}>
            <FilterContext.Provider value={multiFilterContext}>
              <MapContext.Provider value={multiMapContext}>
                <MapLayout />
              </MapContext.Provider>
            </FilterContext.Provider>
          </PageContext.Provider>
        </AppContext.Provider>
      </ThemeProvider>
    );

    expect(multiMapContext.dispatch).toHaveBeenCalledWith({
      type: "UPDATE_COLOR_SCHEME",
      payload: {
        filter: multiMapContext.state.filters[0],
        value: ["bus", "rail"],
        color_scheme: "red",
      },
    });
  });
});

describe("map-click filters on dual maps", () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it("leaves map-click filters to DualMaps instead of sending their single value to both sides", () => {
    const zoneFilter = {
      id: "zone-filter",
      type: "map",
      filterName: "Select a zone in the map",
      paramName: "zoneId",
      visualisations: ["Zone Pairs Side-by-Side"],
      actions: [{ action: "UPDATE_DUAL_QUERY_PARAMS" }],
      panes: ["left", "right"],
    };
    const timePeriodFilter = {
      id: "left-time-period",
      type: "toggle",
      filterName: "Left Time Period",
      paramName: "timePeriodCode",
      visualisations: ["Zone Pairs Side-by-Side"],
      actions: [{ action: "UPDATE_DUAL_QUERY_PARAMS" }],
      panes: ["left"],
    };
    const filterContext = {
      ...mockFilterContext,
      state: { "zone-filter": 2399, "left-time-period": "AM" },
      dispatch: jest.fn(),
    };
    const mapContext = {
      ...mockMapContext,
      dispatch: jest.fn(),
      state: {
        ...mockMapContext.state,
        mapGrid: resolveMapGrid({ type: "DualMapLayout" }),
        filters: [zoneFilter, timePeriodFilter],
      },
    };

    render(
      <ThemeProvider theme={theme}>
        <AppContext.Provider value={mockAppContexte}>
          <PageContext.Provider value={mockPageContext}>
            <FilterContext.Provider value={filterContext}>
              <MapContext.Provider value={mapContext}>
                <MapLayout />
              </MapContext.Provider>
            </FilterContext.Provider>
          </PageContext.Provider>
        </AppContext.Provider>
      </ThemeProvider>
    );

    const payloads = mapContext.dispatch.mock.calls
      .map(([action]) => action)
      .filter((action) => action.type === "UPDATE_DUAL_QUERY_PARAMS")
      .map(({ payload }) => payload);

    expect(payloads).toContainEqual(
      expect.objectContaining({ filter: timePeriodFilter, value: "AM", panes: ["left"] })
    );
    expect(payloads).not.toContainEqual(
      expect.objectContaining({ filter: zoneFilter, value: 2399 })
    );
  });
});
