import { render, screen, waitFor } from "@testing-library/react";
import { SelectorSection } from ".";
import { MapContext, FilterContext, AppContext } from "contexts";
import userEvent from "@testing-library/user-event";
import { api } from "services";

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
jest.mock("./Dropdown", () => ({
  Dropdown: ({ key, filter, value, onChange, disabled, excludeValue }) => (
    <div data-testid="mock-dropdown">
      <div>key: {key}</div>
      <div>filter: {JSON.stringify(filter)}</div>
      <div>value: {value}</div>
      <div data-testid="disabled">{String(disabled)}</div>
      <div data-testid="excludeValue">{String(excludeValue)}</div>
      <button onClick={onChange(filter, value)}>onChange</button>
    </div>
  ),
}));
jest.mock("./Slider", () => ({
  Slider: ({ key, filter, value, onChange, disabled, excludeValue }) => (
    <div data-testid="mock-slider">
      <div>key: {key}</div>
      <div>filter: {JSON.stringify(filter)}</div>
      <div>value: {value}</div>
      <div data-testid="disabled">{String(disabled)}</div>
      <div data-testid="excludeValue">{String(excludeValue)}</div>
      <button onClick={onChange(filter, value)}>onChange</button>
    </div>
  ),
}));
jest.mock("./Toggle", () => ({
  Toggle: ({ key, filter, value, onChange, disabled, excludeValue }) => (
    <div data-testid="mock-toggle">
      <div data-testid="disabled">{String(disabled)}</div>
      <div data-testid="excludeValue">{String(excludeValue)}</div>
      <button data-testid="toggle" onClick={onChange(filter, value)}></button>
    </div>
  ),
}));
jest.mock("./CheckboxSelector", () => ({
  CheckboxSelector: ({ key, filter, value, onChange, disabled, excludeValue }) => (
    <div data-testid="mock-checkbox">
      <div data-testid="disabled">{String(disabled)}</div>
      <div data-testid="excludeValue">{String(excludeValue)}</div>
      <button data-testid="checkbox" onClick={onChange(filter, value)}></button>
    </div>
  ),
}));
jest.mock("./MapFeatureSelect", () => ({
  MapFeatureSelect: ({ key, filter, value, onChange, disabled, excludeValue }) => (
    <div data-testid="mock-mapFeatureSelect">
      <div data-testid="disabled">{String(disabled)}</div>
      <div data-testid="excludeValue">{String(excludeValue)}</div>
      <button
        data-testid="mapFeatureSelect"
        onClick={onChange(filter, value)}
      ></button>
    </div>
  ),
  MapFeatureSelectWithControls: ({ key, filter, value, onChange, disabled, excludeValue }) => (
    <div data-testid="mock-mapFeatureSelectWithControls">
      <div data-testid="disabled">{String(disabled)}</div>
      <div data-testid="excludeValue">{String(excludeValue)}</div>
      <button
        data-testid="mapFeatureSelectWithControls"
        onClick={onChange(filter, value)}
      ></button>
    </div>
  ),
}));
jest.mock("./MapFeatureSelectAndPan", () => ({
  MapFeatureSelectAndPan: ({ key, filter, value, onChange, disabled, excludeValue }) => (
    <div data-testid="mock-mapFeatureSelectAndPan">
      <div data-testid="disabled">{String(disabled)}</div>
      <div data-testid="excludeValue">{String(excludeValue)}</div>
      <button
        data-testid="mapFeatureSelectAndPan"
        onClick={onChange(filter, value)}
      ></button>
    </div>
  ),
}));

const mockAppContexte = {
  //   state: {
  appPages: [
    {
      url: "/",
      location: { pathname: "/pathname1" },
      pageName: ["Difference", "Authority"],
    },
    {
      url: "/url2",
      location: { pathname: "/pathname2" },
    },
  ],
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
  apiSchema: {
    paths: {
      "/downloadPath": {
        get: jest.fn()
      }
    }
  }
};
const mockFilterContext = {
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
const dispatch = jest.fn();
const mockState = {
  visualisations: {},
  filters: [],
  layers: {
    layerA: { path: "/fake/path" },
  },
  currentZoom: 10,
};
let props = {
  filter: [],
  onFilterChange: jest.fn(),
  bgColor: "white",
  downloadPath: "/downloadPath"
};

describe("SelectorSection component test", () => {
  it("Does not render mapViewport filter in sidebar", async () => {
    const viewportFilter = {
      type: "mapViewport",
      id: "viewport-filter-1",
      paramName: "viewport",
      filterName: "MapViewport",
      values: { source: "local", values: [] },
    };
    const regularFilter = {
      type: "dropdown",
      id: "dropdown-1",
      paramName: "category",
      filterName: "Category",
      values: { source: "local", values: [] },
    };

    props = {
      ...props,
      filters: [viewportFilter, regularFilter],
    };

    render(
      <AppContext.Provider value={mockAppContexte}>
        <MapContext.Provider value={{ state: mockState, dispatch }}>
          <FilterContext.Provider value={mockFilterContext}>
            <SelectorSection {...props} />
          </FilterContext.Provider>
        </MapContext.Provider>
      </AppContext.Provider>
    );

    // mapViewport type filters should not be rendered in sidebar
    // Only the regular dropdown filter should be rendered
    expect(screen.getByTestId("mock-dropdown")).toBeInTheDocument();
  });

  it("Basic use of dropdown type", async () => {
    props = {
      ...props,
      filters: [{ type: "dropdown", id: "dropdown", values: "dropdown" }],
    };
    render(
      <AppContext.Provider value={mockAppContexte}>
        <MapContext.Provider value={{ state: mockState, dispatch }}>
          <FilterContext.Provider value={mockFilterContext}>
            <SelectorSection {...props} />
          </FilterContext.Provider>
        </MapContext.Provider>
      </AppContext.Provider>
    );
    // Check the title
    expect(
      screen.getByText("Filtering and data selection")
    ).toBeInTheDocument();
    // check the dropdown
    const dropdownWrapper = screen.getByTestId("mock-dropdown");
    expect(dropdownWrapper).toBeInTheDocument();
    // check the props
    const filter = screen.getByText(
      /filter: {"type":"dropdown","id":"dropdown","values":"dropdown"}/
    );
    const value = screen.getByText(/value: dropdown/);
    const buttonText = screen.getByText(/onChange/);
    expect(filter).toBeInTheDocument();
    expect(value).toBeInTheDocument();
    expect(buttonText).toBeInTheDocument();
    // check the onClick of the button
    const button = screen.getByText(/Download as CSV/);
    userEvent.click(button);
    // check if the function is launched
    await waitFor(() => {
      expect(props.onFilterChange).toHaveBeenCalledWith(
        { type: "dropdown", id: "dropdown", values: "dropdown" },
        "dropdown"
      );
    });
  });

  it("Basic use of slider type", async () => {
    props = {
      ...props,
      filters: [{ type: "slider", id: "slider", values: "slider" }],
    };
    render(
      <AppContext.Provider value={mockAppContexte}>
        <MapContext.Provider value={{ state: mockState, dispatch }}>
          <FilterContext.Provider value={mockFilterContext}>
            <SelectorSection {...props} />
          </FilterContext.Provider>
        </MapContext.Provider>
      </AppContext.Provider>
    );
    // Check the title
    expect(
      screen.getByText("Filtering and data selection")
    ).toBeInTheDocument();
    // check the slider
    const dropdownWrapper = screen.getByTestId("mock-slider");
    expect(dropdownWrapper).toBeInTheDocument();
    // check the props
    const filter = screen.getByText(
      /filter: {"type":"slider","id":"slider","values":"slider"}/
    );
    const value = screen.getByText(/value: slider/);
    const buttonText = screen.getByText(/onChange/);
    expect(filter).toBeInTheDocument();
    expect(value).toBeInTheDocument();
    expect(buttonText).toBeInTheDocument();
    // check the onClick of the button
    const button = screen.getByText(/Download as CSV/);
    userEvent.click(button);
    // check if the function is launched
    await waitFor(() => {
      expect(props.onFilterChange).toHaveBeenCalledWith(
        { type: "slider", id: "slider", values: "slider" },
        "slider"
      );
    });
  });
  it("Check the other types", async () => {
    props = {
      ...props,
      filters: [
        { type: "toggle", id: "toggle", values: "toggle" },
        { type: "checkbox", id: "checkbox", values: "checkbox" },
        {
          type: "mapFeatureSelect",
          id: "mapFeatureSelect",
          values: "mapFeatureSelect",
        },
        {
          type: "mapFeatureSelectWithControls",
          id: "mapFeatureSelectWithControls",
          values: "mapFeatureSelectWithControls",
        },
        {
          type: "mapFeatureSelectAndPan",
          id: "mapFeatureSelectAndPan",
          values: "mapFeatureSelectAndPan",
        },
      ],
    };
    render(
      <AppContext.Provider value={mockAppContexte}>
        <MapContext.Provider value={{ state: mockState, dispatch }}>
          <FilterContext.Provider value={mockFilterContext}>
            <SelectorSection {...props} />
          </FilterContext.Provider>
        </MapContext.Provider>
      </AppContext.Provider>
    );
    expect(screen.getByTestId("mock-toggle")).toBeInTheDocument();
    expect(screen.getByTestId("mock-checkbox")).toBeInTheDocument();
    expect(screen.getByTestId("mock-mapFeatureSelect")).toBeInTheDocument();
    expect(
      screen.getByTestId("mock-mapFeatureSelectWithControls")
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("mock-mapFeatureSelectAndPan")
    ).toBeInTheDocument();
    // click on all button
    const toggle = screen.getByTestId("toggle");
    const checkbox = screen.getByTestId("checkbox");
    const mapFeatureSelect = screen.getByTestId("mapFeatureSelect");
    const mapFeatureSelectWithControls = screen.getByTestId(
      "mapFeatureSelectWithControls"
    );
    const mapFeatureSelectAndPan = screen.getByTestId("mapFeatureSelectAndPan");
    // click
    userEvent.click(toggle);
    userEvent.click(checkbox);
    userEvent.click(mapFeatureSelect);
    userEvent.click(mapFeatureSelectWithControls);
    userEvent.click(mapFeatureSelectAndPan);
    expect(props.onFilterChange).toHaveBeenCalledWith(
      { type: "toggle", id: "toggle", values: "toggle" },
      "toggle"
    );
    expect(props.onFilterChange).toHaveBeenCalledWith(
      { type: "checkbox", id: "checkbox", values: "checkbox" },
      "checkbox"
    );
    expect(props.onFilterChange).toHaveBeenCalledWith(
      {
        type: "mapFeatureSelect",
        id: "mapFeatureSelect",
        values: "mapFeatureSelect",
      },
      "mapFeatureSelect"
    );
    expect(props.onFilterChange).toHaveBeenCalledWith(
      {
        type: "mapFeatureSelectWithControls",
        id: "mapFeatureSelectWithControls",
        values: "mapFeatureSelectWithControls",
      },
      "mapFeatureSelectWithControls"
    );
    expect(props.onFilterChange).toHaveBeenCalledWith(
      {
        type: "mapFeatureSelectAndPan",
        id: "mapFeatureSelectAndPan",
        values: "mapFeatureSelectAndPan",
      },
      "mapFeatureSelectAndPan"
    );
  });

  it("Passes disabled and excludeValue props to all filter components", async () => {
    // Setup a target filter that will trigger the disabledWhen condition
    const targetFilter = {
      type: "dropdown",
      id: "targetFilterId",
      paramName: "targetFilterParam",
      values: []
    };
    
    // Setup filters of various types that should inherit the disabled/excludeValue
    const filterTypes = ["dropdown", "slider", "toggle", "checkbox", "mapFeatureSelect", "mapFeatureSelectWithControls", "mapFeatureSelectAndPan"];
    const dependentFilters = filterTypes.map(type => ({
      type,
      id: `${type}DependentId`,
      paramName: `${type}DependentParam`,
      values: { source: "local", values: [{paramValue: "val1"}] },
      disabledWhen: {
        paramName: "targetFilterParam",
        operator: "equals",
        value: "triggerValue"
      },
      excludeWhenMatches: "targetFilterParam"
    }));

    props = {
      ...props,
      filters: [targetFilter, ...dependentFilters],
    };

    const testMockFilterContext = {
      ...mockFilterContext,
      state: {
        ...mockFilterContext.state,
        targetFilterId: "triggerValue",
      }
    };

    render(
      <AppContext.Provider value={mockAppContexte}>
        <MapContext.Provider value={{ state: mockState, dispatch }}>
          <FilterContext.Provider value={testMockFilterContext}>
            <SelectorSection {...props} />
          </FilterContext.Provider>
        </MapContext.Provider>
      </AppContext.Provider>
    );


    // Verify each dependent mock component received disabled=true and excludeValue="triggerValue"
    const disabledNodes = screen.getAllByTestId("disabled");
    const excludeValueNodes = screen.getAllByTestId("excludeValue");

    // The first node is the targetFilter, which should not be disabled
    expect(disabledNodes[0]).toHaveTextContent("false");
    expect(excludeValueNodes[0]).toHaveTextContent("null");

    // All other nodes (dependent filters) should show 'true' and 'triggerValue'
    disabledNodes.slice(1).forEach(node => {
      expect(node).toHaveTextContent("true");
    });
    
    excludeValueNodes.slice(1).forEach(node => {
      expect(node).toHaveTextContent("triggerValue");
    });
    
    // Ensure we checked exactly the number of filters total (1 target + 7 dependent = 8)
    expect(disabledNodes.length).toBe(8);
    expect(excludeValueNodes.length).toBe(8);
  });

  describe("dateRange filters", () => {
    const controller = {
      type: "dropdown",
      id: "timePeriodId",
      paramName: "time_period",
      values: [],
    };
    const dateRangeFilter = {
      type: "dateRange",
      id: "surveyDatesId",
      filterName: "Survey dates",
      paramName: ["date_from", "date_to"],
      min: "2025-10-06",
      max: "2025-10-19",
      extraToggle: { paramName: "include_excluded", label: "Include excluded days" },
      disabledWhen: { paramName: "time_period", operator: "equals", value: "disabled" },
    };

    const renderWith = (timePeriod) => {
      const filterContext = {
        ...mockFilterContext,
        state: { timePeriodId: timePeriod, surveyDatesId: ["2025-10-07", "2025-10-08", true] },
      };
      render(
        <AppContext.Provider value={mockAppContexte}>
          <MapContext.Provider value={{ state: mockState, dispatch }}>
            <FilterContext.Provider value={filterContext}>
              <SelectorSection {...props} filters={[controller, dateRangeFilter]} />
            </FilterContext.Provider>
          </MapContext.Provider>
        </AppContext.Provider>
      );
    };

    it("renders the date range selector with its current value", () => {
      renderWith("am");
      expect(screen.getByLabelText("From")).toHaveValue("2025-10-07");
      expect(screen.getByLabelText("To")).toHaveValue("2025-10-08");
      expect(screen.getByLabelText("From")).not.toBeDisabled();
      expect(screen.getByRole("checkbox", { name: "Include excluded days" })).toBeChecked();
    });

    it("honours disabledWhen", () => {
      renderWith("disabled");
      expect(screen.getByLabelText("From")).toBeDisabled();
      expect(screen.getByLabelText("To")).toBeDisabled();
      expect(screen.getByRole("checkbox")).toBeDisabled();
    });

    it("sends every date range parameter with a download", async () => {
      const downloadFile = jest.spyOn(api.downloadService, "downloadFile").mockResolvedValue();
      window.clarity = jest.fn();
      renderWith("am");

      await userEvent.click(screen.getByRole("button", { name: "Download as CSV" }));

      await waitFor(() => expect(downloadFile).toHaveBeenCalled());
      await waitFor(() => expect(screen.getByRole("button", { name: "Download as CSV" })).not.toBeDisabled());
      expect(downloadFile.mock.calls[0][1].queryParams).toEqual({
        time_period: "am",
        date_from: "2025-10-07",
        date_to: "2025-10-08",
        include_excluded: true,
      });
      downloadFile.mockRestore();
      delete window.clarity;
    });
  });
});
