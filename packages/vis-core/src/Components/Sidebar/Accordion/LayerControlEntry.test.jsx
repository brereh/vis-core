import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { resolveMapGrid } from "../../../map/resolveMapGrid";
import { LayerControlEntry } from "Components/Sidebar/Accordion/LayerControlEntry";
import { AppContext, MapContext, PageContext } from "contexts";

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
        name: "name1",
        containsLegendInfo: false,
      },
      {
        name: "name2",
        containsLegendInfo: true,
      },
    ],
  },
  pageName: "pageName",
};

const fakeHandleClassificationChange = jest.fn();
const fakeHandleColorChange = jest.fn();
const mockGetLayer = jest.fn().mockReturnValue(true);
const mockGetPaintProperty = jest.fn((layerId, propertyName) => {
  if (propertyName?.includes("opacity")) return 0.5;
  if (propertyName?.includes("width") || propertyName === "circle-radius") return 1;
  return 0.5;
});
const mockMap = {
  getLayer: mockGetLayer,
  getPaintProperty: mockGetPaintProperty,
};
const props = {
  handleClassificationChange: fakeHandleClassificationChange,
  handleColorChange: fakeHandleColorChange,
  layer: {
    id: "id",
    type: "fill",
    layout: { visibility: false },
    metadata: { path: "/", shouldHaveOpacityControl: true, isStylable: false },
  },
  maps: [mockMap],
  state: {
    visualisations: {
      climate: {
        id: "climate",
        name: "Climate Visualisation",
        legend: ["Low", "Medium", "High"],
        data: [],
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
        metadata: {
          source: "UNEP",
          updated: "2025-08-20",
        },
      },
    },
  },
};

describe("LayerControlEntry component test", () => {
  it("displays layer label, toggles chevron direction and visibility (eye icon) on user actions", async () => {
    render(
      <PageContext.Provider value={mockPageContext}>
        <AppContext.Provider value={mockAppContexte}>
          <LayerControlEntry {...props} />
        </AppContext.Provider>
      </PageContext.Provider>
    );
    expect(screen.getByText("id")).toBeInTheDocument();

    // Chevron switch
    const chevronDown = screen.getByTestId("ChevronDownIcon");
    expect(chevronDown).toBeInTheDocument();
    const buttonHeader = screen.getByTestId("HeaderLeft");
    buttonHeader.click();
    await waitFor(() => {
      const chevronRight = screen.getByTestId("ChevronRightIcon");
      expect(chevronRight).toBeInTheDocument();
    });
    // Label id
    expect(screen.getByText("id")).toBeInTheDocument();
    // Visibility, EyeIcon switch
    const eyeIcon = screen.getByLabelText("Hide layer");
    expect(eyeIcon).toBeInTheDocument();
    const buttonSwitch = screen.getByTestId("visibility-toggle");
    buttonSwitch.click();
    await waitFor(() => {
      const EyeSlashIcon = screen.getByLabelText("Show layer");
      expect(EyeSlashIcon).toBeInTheDocument();
    });
  });
  it("Displays the map if there is metadata and a path in the props layer.", () => {
    render(
      <PageContext.Provider value={mockPageContext}>
        <AppContext.Provider value={mockAppContexte}>
          <LayerControlEntry {...props} />
        </AppContext.Provider>
      </PageContext.Provider>
    );
    expect(screen.getByText("Zoom to map feature")).toBeInTheDocument();
  });
  it("Choice of opacity, therefore display of the slider", async () => {
    render(
      <PageContext.Provider value={mockPageContext}>
        <AppContext.Provider value={mockAppContexte}>
          <LayerControlEntry {...props} />
        </AppContext.Provider>
      </PageContext.Provider>
    );
    expect(screen.getByText("Opacity")).toBeInTheDocument();
    const slider = screen.getByRole("slider");
    expect(slider).toBeInTheDocument();
    expect(screen.getByText("50%")).toBeInTheDocument();
    expect(slider).toHaveValue("0.5");

    // Change the slider value to 0.5
    fireEvent.change(slider, { target: { value: "1" } });
    expect(slider.value).toBe("1");

    // Verify that the new value is displayed
    await waitFor(() => {
      expect(screen.getByText("100%")).toBeInTheDocument();
    });
    expect(slider).toHaveValue("1");

    // Test another value
    fireEvent.change(slider, { target: { value: "0.3" } });

    await waitFor(() => {
      expect(screen.getByText("30%")).toBeInTheDocument();
    });
    expect(slider).toHaveValue("0.3");
  });
  it("Test of isFeatureStateWidthExpression's slider", async () => {
    // I don't know why, but I have to recreate the getLayer function, otherwise it doesn't recognize it.
    const mockGetLayer2 = jest.fn().mockReturnValue(true);
    const mockGetPaintProperty2 = jest
      .fn()
      .mockReturnValue(["interpolate", 100]);
    const mockSetPaintProperty2 = jest.fn();
    const mockMap2 = {
      getLayer: mockGetLayer2,
      getPaintProperty: mockGetPaintProperty2,
      setPaintProperty: mockSetPaintProperty2,
    };
    const testProps = {
      ...props,
      maps: [mockMap2],
      layer: {
        id: "id",
        type: "line",
        layout: { visibility: false },
        metadata: { path: "/", shouldHaveOpacityControl: true },
      },
    };

    render(
      <PageContext.Provider value={mockPageContext}>
        <AppContext.Provider value={mockAppContexte}>
          <LayerControlEntry {...testProps} />
        </AppContext.Provider>
      </PageContext.Provider>
    );
    expect(screen.getByText("Width factor")).toBeInTheDocument();
    const slider = screen.getByLabelText("Width factor");
    expect(slider).toBeInTheDocument();

    // initialWidth :  11.764705882352942
    expect(screen.getByText("11.8")).toBeInTheDocument(); // rounded
    expect(slider).toHaveValue("10");
  });

  it("Does not render width factor slider when shouldFixLineWidth is enabled", () => {
    const mockGetLayer2 = jest.fn().mockReturnValue(true);
    const mockGetPaintProperty2 = jest.fn().mockReturnValue(["interpolate", 100]);
    const mockMap2 = {
      getLayer: mockGetLayer2,
      getPaintProperty: mockGetPaintProperty2,
      setPaintProperty: jest.fn(),
    };

    const testProps = {
      ...props,
      maps: [mockMap2],
      layer: {
        id: "id",
        type: "line",
        layout: { visibility: false },
        metadata: {
          path: "/",
          shouldHaveOpacityControl: true,
          shouldFixLineWidth: true,
          fixedLineWidth: 3,
        },
      },
      state: {
        ...props.state,
        layers: {
          id: {
            shouldFixLineWidth: true,
            fixedLineWidth: 3,
          },
        },
      },
    };

    render(
      <PageContext.Provider value={mockPageContext}>
        <AppContext.Provider value={mockAppContexte}>
          <LayerControlEntry {...testProps} />
        </AppContext.Provider>
      </PageContext.Provider>
    );

    expect(screen.queryByText("Width factor")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Width factor")).not.toBeInTheDocument();
  });

  it("uses a layer defaultWidthFactor on initialisation", async () => {
    const mockMap2 = {
      getLayer: jest.fn().mockReturnValue(true),
      getPaintProperty: jest.fn((layerId, propertyName) => {
        if (propertyName?.includes("opacity")) return 0.5;
        if (propertyName === "circle-radius") {
          // Simulate useFeatureStateUpdater having already applied defaultWidthFactor: 0.3
          // calculateMaxWidthFactor(7.5, 'circle-radius') = 7.5 / 25 = 0.3
          return ["interpolate", ["linear"], ["feature-state", "value"], 0, 2, 10, 7.5];
        }
        return 0.5;
      }),
      setPaintProperty: jest.fn(),
    };

    const testProps = {
      ...props,
      maps: [mockMap2],
      layer: {
        id: "id",
        type: "circle",
        layout: { visibility: false },
        metadata: {
          path: "/",
          shouldHaveOpacityControl: true,
          defaultWidthFactor: 0.3,
        },
      },
      state: {
        ...props.state,
      },
    };

    render(
      <MapContext.Provider value={{ state: testProps.state, dispatch: jest.fn() }}>
        <PageContext.Provider value={mockPageContext}>
          <AppContext.Provider value={mockAppContexte}>
            <LayerControlEntry {...testProps} />
          </AppContext.Provider>
        </PageContext.Provider>
      </MapContext.Provider>
    );

    const slider = screen.getByLabelText("Width factor");
    expect(slider).toHaveValue("0.3");
    expect(screen.getByText("0.3")).toBeInTheDocument();
  });

  it("dispatches width factor updates when the slider changes", async () => {
    const dispatch = jest.fn();
    const mockMap2 = {
      getLayer: jest.fn().mockReturnValue(true),
      getPaintProperty: jest.fn((layerId, propertyName) => {
        if (propertyName?.includes("opacity")) return 0.5;
        if (propertyName === "line-width") return ["interpolate", ["linear"], ["feature-state", "value"], 0, 1, 10, 8.5];
        return 0.5;
      }),
      setPaintProperty: jest.fn(),
    };

    const testProps = {
      ...props,
      maps: [mockMap2],
      layer: {
        id: "id",
        type: "line",
        layout: { visibility: false },
        metadata: {
          path: "/",
          shouldHaveOpacityControl: true,
          defaultWidthFactor: 0.3,
        },
      },
      state: {
        ...props.state,
      },
    };

    render(
      <MapContext.Provider value={{ state: testProps.state, dispatch }}>
        <PageContext.Provider value={mockPageContext}>
          <AppContext.Provider value={mockAppContexte}>
            <LayerControlEntry {...testProps} />
          </AppContext.Provider>
        </PageContext.Provider>
      </MapContext.Provider>
    );

    fireEvent.change(screen.getByLabelText("Width factor"), {
      target: { value: "0.6" },
    });

    await waitFor(() => {
      expect(dispatch).toHaveBeenCalledWith({
        type: "UPDATE_LAYER_WIDTH_FACTOR",
        payload: {
          layerName: "id",
          widthFactor: 0.6,
        },
      });
    });
  });
  it("Test", () => {
    const mockMapContext = {
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
            metadata: {
              source: "UNEP",
              updated: "2025-08-20",
            },
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
    const props2 = {
      ...props,
      layer: {
        ...props.layer,
        id: "id",
        metadata: {
          ...props.layer.metadata,
          isStylable: true,
        },
      },
      state: {
        ...props.state,
        layers: [],
      },
    };
    const mockPageContext2 = {
      ...mockPageContext,
      pageName: "Side-by-Side",
    };
    render(
      <MapContext.Provider value={mockMapContext}>
        <PageContext.Provider value={mockPageContext2}>
          <AppContext.Provider value={mockAppContexte}>
            <LayerControlEntry {...props2} />
          </AppContext.Provider>
        </PageContext.Provider>
      </MapContext.Provider>
    );
    expect(screen.getByText("Colour scheme")).toBeInTheDocument();
    expect(screen.getByText("Classification method")).toBeInTheDocument();
  });

  it("does not render edit banding when enforceNoCustomBanding is enabled", () => {
    const props2 = {
      ...props,
      layer: {
        ...props.layer,
        metadata: {
          ...props.layer.metadata,
          isStylable: true,
          enforceNoCustomBanding: true,
        },
      },
      state: {
        ...props.state,
        visualisations: {
          id: {
            id: "id",
            name: "Test Visualisation",
            style: "line-continuous",
            queryParams: {},
            data: [{ value: 10 }, { value: 20 }, { value: 30 }],
          },
        },
        layers: {
          id: {
            class_method: "d",
          },
        },
      },
    };

    render(
      <MapContext.Provider
        value={{
          state: props2.state,
          dispatch: jest.fn(),
        }}
      >
        <PageContext.Provider value={mockPageContext}>
          <AppContext.Provider value={mockAppContexte}>
            <LayerControlEntry {...props2} />
          </AppContext.Provider>
        </PageContext.Provider>
      </MapContext.Provider>
    );

    expect(screen.getByText("Colour scheme")).toBeInTheDocument();
    expect(screen.getByText("Classification method")).toBeInTheDocument();
    expect(screen.queryByText("Edit banding")).not.toBeInTheDocument();
  });

  it("updates zone boundaries line-opacity when the opacity slider changes", async () => {
    const mockSetPaintProperty = jest.fn();
    const mockGetLayer = jest.fn((id) => id === "id" || id === "id-boundaries");
    const mockGetPaintProperty = jest.fn((id, prop) => (prop === "fill-opacity" ? 0.5 : undefined));
    const testMap = {
      getLayer: mockGetLayer,
      getPaintProperty: mockGetPaintProperty,
      setPaintProperty: mockSetPaintProperty,
    };

    const testProps = {
      ...props,
      maps: [testMap],
      layer: {
        id: "id",
        type: "fill",
        layout: { visibility: true },
        metadata: { path: "/", shouldHaveOpacityControl: true },
        switchableBoundaries: true,
      },
    };

    render(
      <PageContext.Provider value={mockPageContext}>
        <AppContext.Provider value={mockAppContexte}>
          <LayerControlEntry {...testProps} />
        </AppContext.Provider>
      </PageContext.Provider>
    );

    const slider = screen.getByRole("slider");
    expect(slider).toBeInTheDocument();

    fireEvent.change(slider, { target: { value: "0.3" } });

    expect(mockSetPaintProperty).toHaveBeenCalledWith(
      "id",
      "fill-opacity",
      0.3
    );
    expect(mockSetPaintProperty).toHaveBeenCalledWith(
      "id-boundaries",
      "line-opacity",
      0.3
    );
  });

  it("synchronises zone boundaries line-opacity when toggling boundaries visible", () => {
    const mockSetLayoutProperty = jest.fn();
    const mockSetPaintProperty = jest.fn();
    const mockGetLayer = jest.fn((id) => id === "id" || id === "id-boundaries");
    const mockGetPaintProperty = jest.fn((id, prop) => (prop === "fill-opacity" ? 0.7 : undefined));
    const testMap = {
      style: {},
      getLayer: mockGetLayer,
      getPaintProperty: mockGetPaintProperty,
      setLayoutProperty: mockSetLayoutProperty,
      setPaintProperty: mockSetPaintProperty,
    };

    const testProps = {
      ...props,
      maps: [testMap],
      layer: {
        id: "id",
        type: "fill",
        layout: { visibility: true },
        metadata: { path: "/", shouldHaveOpacityControl: true },
        switchableBoundaries: true,
        boundariesVisibleByDefault: false,
      },
    };

    render(
      <PageContext.Provider value={mockPageContext}>
        <AppContext.Provider value={mockAppContexte}>
          <LayerControlEntry {...testProps} />
        </AppContext.Provider>
      </PageContext.Provider>
    );

    const checkbox = screen.getByRole("checkbox", { name: /show zone boundaries/i });
    expect(checkbox).not.toBeChecked();

    fireEvent.click(checkbox);

    expect(mockSetLayoutProperty).toHaveBeenCalledWith(
      "id-boundaries",
      "visibility",
      "visible"
    );
    expect(mockSetPaintProperty).toHaveBeenCalledWith(
      "id-boundaries",
      "line-opacity",
      0.7
    );
  });
});

describe("layer controls on a side-by-side page", () => {
  it("describe the left pane: its own params and data, not both panes' together", () => {
    const metricSpy = jest.spyOn(require("utils/map"), "getMetricDefinition");
    const leftData = [{ value: 1 }, { value: 2 }];
    const state = {
      ...props.state,
      layers: [],
      mapGrid: resolveMapGrid({
        type: "DualMapLayout",
        config: { visualisations: [{ name: "id", type: "joinDataToMap" }] },
      }),
      visualisations: {
        id: {
          id: "id",
          style: "line-continuous",
          queryParams: { scenario: { value: "base", required: true } },
          data: [...leftData, { value: 100 }],
        },
      },
      paneOverrides: { left: { id: { queryParams: { scenario: { value: "left only", required: true } } } } },
      paneData: { left: { id: leftData }, right: { id: [{ value: 100 }] } },
    };
    render(
      <MapContext.Provider value={{ state, dispatch: jest.fn() }}>
        <PageContext.Provider value={mockPageContext}>
          <AppContext.Provider value={mockAppContexte}>
            <LayerControlEntry
              {...props}
              layer={{ ...props.layer, id: "id", metadata: { ...props.layer.metadata, isStylable: true } }}
              state={state}
            />
          </AppContext.Provider>
        </PageContext.Provider>
      </MapContext.Provider>
    );

    const queryParamsUsed = metricSpy.mock.calls.map(([, , queryParams]) => queryParams);
    expect(queryParamsUsed.length).toBeGreaterThan(0);
    queryParamsUsed.forEach((queryParams) =>
      expect(queryParams.scenario.value).toBe("left only")
    );
  });

  it("describe the visualisation joined to the layer, on the first pane showing the layer", () => {
    const metricSpy = jest.spyOn(require("utils/map"), "getMetricDefinition");
    const grid = resolveMapGrid({
      type: "MapLayout",
      config: {
        layers: [{ name: "id" }, { name: "other" }],
        visualisations: [
          { name: "first", type: "joinDataToMap" },
          { name: "joined", type: "joinDataToMap" },
        ],
        grid: {
          columns: 2,
          rows: 1,
          cells: [
            { id: "a", layers: ["other"], visualisations: ["first"] },
            { id: "b", column: 2, layers: ["id"], visualisations: ["joined"] },
          ],
        },
      },
    });
    const state = {
      ...props.state,
      layers: [],
      mapGrid: grid,
      visualisations: {
        first: { id: "first", joinLayer: "other", style: "line-continuous", queryParams: { scenario: { value: "first", required: true } } },
        joined: { id: "joined", joinLayer: "id", style: "line-continuous", queryParams: { scenario: { value: "page", required: true } } },
      },
      paneOverrides: { b: { joined: { queryParams: { scenario: { value: "pane b", required: true } } } } },
      paneData: { b: { joined: [{ value: 1 }] } },
    };
    render(
      <MapContext.Provider value={{ state, dispatch: jest.fn() }}>
        <PageContext.Provider value={mockPageContext}>
          <AppContext.Provider value={mockAppContexte}>
            <LayerControlEntry
              {...props}
              layer={{ ...props.layer, id: "id", metadata: { ...props.layer.metadata, isStylable: true } }}
              state={state}
            />
          </AppContext.Provider>
        </PageContext.Provider>
      </MapContext.Provider>
    );

    const scenarios = metricSpy.mock.calls.map(([, , queryParams]) => queryParams.scenario.value);
    expect(scenarios.length).toBeGreaterThan(0);
    scenarios.forEach((scenario) => expect(scenario).toBe("pane b"));
  });
});
