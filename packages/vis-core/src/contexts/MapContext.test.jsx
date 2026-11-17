import { render, screen, waitFor } from "@testing-library/react";

// Mock all dependencies before importing the components
jest.mock("react", () => ({
  ...jest.requireActual("react"),
  useReducer: jest.fn(),
}));

jest.mock("services", () => ({
  api: {
    baseService: {
      get: jest.fn(),
    },
  },
}));

jest.mock("utils", () => ({
  ...jest.requireActual("utils"),
  hasRouteParameterOrQuery: jest.fn(() => true),
  extractParamsWithValues: jest.fn(() => true),
  processParameters: jest.fn(() => ({
    params: {},
    missingParams: [],
  })),
  updateUrlParameters: jest.fn((path) => path),
  checkSecurityRequirements: jest.fn(() => true),
  sortValues: jest.fn((values) => values),
  isValidCondition: jest.fn(() => true),
  applyCondition: jest.fn(),
  parseStringToArray: jest.fn((str) => (Array.isArray(str) ? str : [str])),
  getGetParameters: jest.fn(() => []),
  buildParamsMap: jest.fn(() => ({})),
  getDefaultLayerBufferSize: jest.fn(() => 0),
  applyWhereConditions: jest.fn((data) => data),
  buildDeterministicFilterId: jest.fn(() => "mock-filter-id"),
}));

jest.mock("defaults", () => ({
  defaultMapStyle: "mock-style",
  defaultMapZoom: 10,
  defaultMapCentre: [0, 0],
  CARD_CONSTANTS: {
    PADDING: 10,
    TOGGLE_BUTTON_WIDTH: 20,
    TOGGLE_BUTTON_HEIGHT: 20,
  },
}));

// Now import after mocks
import React from "react";
import { AppContext, FilterContext, MapProvider, PageContext } from "contexts";
import { api } from "services";
import {
  hasRouteParameterOrQuery,
  processParameters,
  getGetParameters,
  buildParamsMap,
  getDefaultLayerBufferSize,
  updateUrlParameters,
} from "utils";

const mockDispatch = jest.fn();
const mockUseReducer = React.useReducer;
const mockGet = api.baseService.get;
const mockProcessParameters = processParameters;
const mockHasRouteParameterOrQuery = hasRouteParameterOrQuery;
const mockGetGetParameters = getGetParameters;
const mockBuildParamsMap = buildParamsMap;
const mockGetDefaultLayerBufferSize = getDefaultLayerBufferSize;
const mockUpdateUrlParameters = updateUrlParameters;

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
const mockAppContexte = {
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
  background: "background",
  methodology: "methodology",
  additionalImage: "additionalImage",
  title: "My App Title",
  backgroundImage: "backgroundImage",
  introduction: "introduction",
  contactText: "contactText",
  contactEmail: "contactEmail",
  legalText: "legalText",
  apiSchema: {
    paths: { baz: { get: { parameters: "parameters" } }, bar: {} },
  },
  defaultBands: [
    {
      name: "climate",
      label: "Climate Band",
      color: "#00FF00",
      opacity: 0.5,
    },
    {
      name: "biodiversity",
      label: "Biodiversity Band",
      color: "#0000FF",
      opacity: 0.7,
    },
  ],
};
const mockPageContext = {
  config: {
    filters: [
      {
        name: "metadataTableName",
        containsLegendInfo: false,
        values: {
          source: "metadataTable",
          metadataTableName: "metadataTableName",
          values: [
            { displayValue: "Value 1", paramValue: "val1"},
            { displayValue: "Value 2", paramValue: "val2"},
          ],
        },
        visualisations: ["Side"],
        filterName: "Left",
        type: "metadataTable"
      },
      {
        name: "name2",
        containsLegendInfo: true,
        values: {
          source: "local",
          values: [
            { displayValue: "Value 1", paramValue: "val1" },
            { displayValue: "Value 2", paramValue: "val2" },
          ],
        },
        visualisations: ["Side"],
        filterName: "Left",
      },
    ],
    additionalFeatures: "additionalFeatures",
    layers: [{ path: "/foo" }, { path: "/bar" }],
    visualisations: [{ dataPath: "/baz" }],
    metadataTables: [{ where: "where", name: "metadataTableName", path: "/path" }],
  },
  pageName: "pageName",
  current: "",
};

beforeEach(() => {
  jest.clearAllMocks();
  
  // Re-initialize mock implementations after clearAllMocks
  mockGet.mockResolvedValue([{ id: 1 }]);
  mockUseReducer.mockReturnValue([
    {pageIsReady: true},
    jest.fn(),
  ]);
  mockProcessParameters.mockReturnValue({
    params: {},
    missingParams: [],
  });
  mockHasRouteParameterOrQuery.mockReturnValue(true);
  mockGetGetParameters.mockReturnValue([]);
  mockBuildParamsMap.mockReturnValue({});
  mockGetDefaultLayerBufferSize.mockReturnValue(0);
  mockUpdateUrlParameters.mockImplementation((path) => path);
});

describe("MapProvider component tests", () => {
  it("Check the render", async () => {
    render(
      <PageContext.Provider value={mockPageContext}>
        <AppContext.Provider value={mockAppContexte}>
          <FilterContext.Provider value={mockFilterContext}>
            <MapProvider>
              <p>ImAChildren</p>
            </MapProvider>
          </FilterContext.Provider>
        </AppContext.Provider>
      </PageContext.Provider>
    );
    await waitFor(() => {
      expect(screen.getByText("ImAChildren")).toBeInTheDocument();
    });
  });
});

describe("parameterisedLayers for each layer", () => {
  beforeEach(() => {
    mockUseReducer.mockReturnValue([{}, mockDispatch]);

    mockProcessParameters.mockReturnValue({
      params: "params",
      missingParams: "missingParams",
    });
    mockHasRouteParameterOrQuery.mockReturnValue(true);
  });

  it("Basic render", () => {
    render(
      <PageContext.Provider value={mockPageContext}>
        <AppContext.Provider value={mockAppContexte}>
          <FilterContext.Provider value={mockFilterContext}>
            <MapProvider>
              <p>ImAChildren</p>
            </MapProvider>
          </FilterContext.Provider>
        </AppContext.Provider>
      </PageContext.Provider>
    );

    expect(mockDispatch).toHaveBeenCalled();
  });
});

describe("map grid", () => {
  beforeEach(() => {
    mockUseReducer.mockReturnValue([{}, mockDispatch]);
  });

  it.each([
    ["MapLayout", ["main"]],
    ["DualMapLayout", ["left", "right"]],
  ])("sets the panes of a %s page", (type, paneIds) => {
    render(
      <PageContext.Provider value={{ ...mockPageContext, type }}>
        <AppContext.Provider value={mockAppContexte}>
          <FilterContext.Provider value={mockFilterContext}>
            <MapProvider>
              <p>ImAChildren</p>
            </MapProvider>
          </FilterContext.Provider>
        </AppContext.Provider>
      </PageContext.Provider>
    );

    expect(mockDispatch).toHaveBeenCalledWith({
      type: "SET_MAP_GRID",
      payload: expect.objectContaining({ paneIds }),
    });
  });
});

describe("grid config warnings", () => {
  const originalEnv = process.env.NODE_ENV;
  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
  });

  const renderWithGrid = () =>
    render(
      <PageContext.Provider
        value={{
          ...mockPageContext,
          pageName: "Dashboard",
          config: {
            ...mockPageContext.config,
            grid: { columns: 1, rows: 1, cells: [{ id: "a" }, { id: "b" }] },
          },
        }}
      >
        <AppContext.Provider value={mockAppContexte}>
          <FilterContext.Provider value={mockFilterContext}>
            <MapProvider>
              <p>ImAChildren</p>
            </MapProvider>
          </FilterContext.Provider>
        </AppContext.Provider>
      </PageContext.Provider>
    );

  beforeEach(() => {
    mockUseReducer.mockReturnValue([{}, mockDispatch]);
  });

  it("are logged in development, naming the page", () => {
    process.env.NODE_ENV = "development";
    const error = jest.spyOn(console, "error").mockImplementation(() => {});
    renderWithGrid();
    expect(error).toHaveBeenCalledWith(expect.stringMatching(/^\[MapGrid\] Dashboard: Cell "b" overlaps cell "a"/));
  });

  it("aren't logged otherwise", () => {
    process.env.NODE_ENV = "production";
    const error = jest.spyOn(console, "error").mockImplementation(() => {});
    renderWithGrid();
    expect(error).not.toHaveBeenCalledWith(expect.stringMatching(/\[MapGrid\]/));
  });
});
