jest.mock("services", () => ({
  api: {
    geodataService: {
      getLayer: jest.fn().mockResolvedValue({
        type: "FeatureCollection",
        features: [],
      }),
      buildTileLayerUrl: jest
        .fn()
        .mockReturnValue("valueReturnedBy: buildTileLayerUrl"),
    },
  },
}));

import { render, screen, waitFor } from "@testing-library/react";
import { Layer } from "./Layer";
import { MapContext, FilterContext } from "contexts";
import { mapStyles } from "defaults";
import { api } from "services";

const mockMapContext = {
  state: {
    visualisations: {
      calloutCard: {},
      calloutCard1: {},
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
        moveLayer: jest.fn(),
        isStyleLoaded: jest.fn(() => true),
        style: {},
      },
    ],
    paramNameToUuidMap: {
      paramToReplace1: "first",
      paramToReplace2: "second",
    },
  },
  dispatch: jest.fn(),
};
const mockFilterContext = {
  state: {
    filter: {
      first: "first",
    },
    first: "ici",
    second: "la",
  },
};

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

let props = {
  layer: {
    bufferSize: 0,
    geometryType: "polygon",
    isHoverable: true,
    isStylable: true,
    name: "Accessibility",
    path: "/api/vectortiles/zones/5/{z}/{x}/{y}",
    shouldHaveLabel: false,
    shouldHaveTooltipOnHover: true,
    source: "api",
    sourceLayer: "zones",
    // type: "tile",
    uniqueId: "BsipZoneVectorTile",
    visualisationName: "Bus Accessibility",
  },
};

describe("Basic use Layer compoennt with type = 'tile'", () => {
  beforeEach(() => {
    // type = "tile"
    props = {
      ...props,
      layer: {
        ...props.layer,
        type: "tile",
      },
    };
    api.geodataService.buildTileLayerUrl.mockReturnValue("/url");
  });
  afterEach(() => {
    jest.clearAllMocks();
  });
  it("Basic use", () => {
    render(
      <MapContext.Provider value={mockMapContext}>
        <Layer {...props} />
      </MapContext.Provider>
    );
    // layer.source = api and layer.type = "tile", so it should call buildTileLayerUrl
    expect(api.geodataService.buildTileLayerUrl).toHaveBeenCalledWith(
      props.layer.path
    );

    expect(mockMapContext.state.maps[0].addSource).toHaveBeenCalledWith(
      props.layer.name,
      {
        type: "vector",
        tiles: ["/url"],
        promoteId: "id",
      }
    );

    // switchableBoundaries defaults to true for polygon tile layers
    expect(mockMapContext.state.maps[0].addLayer).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        id: "Accessibility-boundaries",
        source: "Accessibility",
        "source-layer": "zones",
        type: "line",
        layout: { visibility: "none" },
        paint: {
          "line-color": "#444444",
          "line-opacity": 0.65,
          "line-width": 1,
        },
        metadata: { isStylable: false },
      })
    );

    // isHoverable = true, test if this part is well throw
    expect(mockMapContext.state.maps[0].addLayer).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        id: "Accessibility-hover",
        source: "Accessibility",
        "source-layer": "zones",
        type: "line",
        metadata: expect.objectContaining({
          isStylable: false,
        }),
      })
    );

    // last addLayer called when type = "tile"
    expect(mockMapContext.state.maps[0].addLayer).toHaveBeenNthCalledWith(
      4,
      expect.objectContaining({
        id: "Accessibility-select",
        type: "line",
        paint: {
          "line-color": ["case", expect.any(Array), "#f00", "transparent"],
          "line-width": 2,
        },
        source: "Accessibility",
        "source-layer": "zones",
        metadata: { isStylable: false },
      })
    );
  });

  it("moves Geoapify town and city labels above the application layer", () => {
    const map = mockMapContext.state.maps[0];

    map.getLayer.mockImplementation((layerId) => {
      const geoapifyTownCityLabelIds = [
        "place_town",
        "place_city",
        "place_capital",
        "place_city_large",
      ];

      return geoapifyTownCityLabelIds.includes(layerId)
        ? { id: layerId }
        : undefined;
    });

    render(
      <MapContext.Provider value={mockMapContext}>
        <Layer {...props} />
      </MapContext.Provider>
    );

    expect(map.moveLayer).toHaveBeenNthCalledWith(1, "place_town");
    expect(map.moveLayer).toHaveBeenNthCalledWith(2, "place_city");
    expect(map.moveLayer).toHaveBeenNthCalledWith(3, "place_capital");
    expect(map.moveLayer).toHaveBeenNthCalledWith(4, "place_city_large");
  });

  it("does not move town or city labels when the active map style does not contain them", () => {
    const map = mockMapContext.state.maps[0];

    map.getLayer.mockReturnValue(undefined);

    render(
      <MapContext.Provider value={mockMapContext}>
        <Layer {...props} />
      </MapContext.Provider>
    );

    expect(map.moveLayer).not.toHaveBeenCalled();
  });

  it("Does not add boundaries layer when switchableBoundaries is false", () => {
    props = {
      ...props,
      layer: {
        ...props.layer,
        switchableBoundaries: false,
      },
    };

    render(
      <MapContext.Provider value={mockMapContext}>
        <Layer {...props} />
      </MapContext.Provider>
    );

    expect(mockMapContext.state.maps[0].addLayer).not.toHaveBeenCalledWith(
      expect.objectContaining({
        id: "Accessibility-boundaries",
      })
    );
  });
});

describe("Basic use Layer compoennt with type = 'geojson'", () => {
  beforeEach(() => {
    // type = "geojson"
    props = {
      ...props,
      layer: {
        ...props.layer,
        type: "geojson",
      },
    };
    api.geodataService.getLayer.mockResolvedValue("getLayer returned");
  });
  afterEach(() => {
    jest.clearAllMocks();
  });
  it("Basic use", async () => {
    render(
      <MapContext.Provider value={mockMapContext}>
        <Layer {...props} />
      </MapContext.Provider>
    );
    await waitFor(() => {
      expect(mockMapContext.state.maps[0].addSource).toHaveBeenCalledWith(
        props.layer.name,
        { type: "geojson", data: "getLayer returned" }
      );
    });

    await waitFor(() => {
      expect(mockMapContext.state.maps[0].addLayer).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "Accessibility",
          bufferSize: 0,
          type: "fill",
          source: "Accessibility",
          paint: {
            "fill-color": "rgba(255, 255, 0, 0)",
            "fill-outline-color": "rgba(195, 195, 195, 1)",
            "fill-opacity": 0,
          },
          maxzoom: 24,
          minzoom: 0,
          layout: { visibility: "visible" },
          metadata: expect.objectContaining({
            isStylable: true,
            defaultOpacity: 0.65,
            path: "/api/vectortiles/zones/5/{z}/{x}/{y}",
            shouldShowInLegend: true,
            shouldHaveOpacityControl: true,
            enforceNoColourSchemeSelector: false,
            enforceNoClassificationMethod: false,
            enforceNoCustomBanding: false,
            hideOutOfBandWarning: true,
            zoomToFeaturePlaceholderText: "",
            shouldFixLineWidth: false,
            fixedLineWidth: null,
            legendCacheField: null,
          }),
        })
      );
    });

    // isHoverable = true, test if this part is well throw
    await waitFor(() => {
      expect(mockMapContext.state.maps[0].addLayer).toHaveBeenCalledWith({
        id: "Accessibility-hover",
        type: "line",
        paint: {
          "line-color": ["case", expect.any(Array), "red", "transparent"],
          "line-width": [
            "interpolate",
            expect.any(Array),
            expect.any(Array),
            5,
            1,
            10,
            2,
            15,
            4,
            20,
            8,
          ],
        },
        source: "Accessibility",
      });
    });

    await waitFor(() => {
      expect(mockMapContext.state.maps[0].addLayer).toHaveBeenCalledWith({
        id: "Accessibility-select",
        type: "line",
        paint: {
          "line-color": ["case", expect.any(Array), "#f00", "transparent"],
          "line-width": 2,
        },
        source: "Accessibility",
      });
    });
  });

  it("Respects shouldShowInLegend = false", async () => {
    props = {
      ...props,
      layer: {
        ...props.layer,
        type: "geojson",
        isStylable: true,
        shouldShowInLegend: false,
      },
    };
    api.geodataService.getLayer.mockResolvedValue("getLayer returned");

    render(
      <MapContext.Provider value={mockMapContext}>
        <Layer {...props} />
      </MapContext.Provider>
    );

    await waitFor(() => {
      expect(mockMapContext.state.maps[0].addLayer).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "Accessibility",
          metadata: expect.objectContaining({
            shouldShowInLegend: false,
          }),
        })
      );
    });
  });

  it("passes enforceNoCustomBanding into layer metadata", async () => {
    props = {
      ...props,
      layer: {
        ...props.layer,
        type: "geojson",
        enforceNoCustomBanding: true,
      },
    };
    api.geodataService.getLayer.mockResolvedValue("getLayer returned");

    render(
      <MapContext.Provider value={mockMapContext}>
        <Layer {...props} />
      </MapContext.Provider>
    );

    await waitFor(() => {
      expect(mockMapContext.state.maps[0].addLayer).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "Accessibility",
          metadata: expect.objectContaining({
            enforceNoCustomBanding: true,
          }),
        })
      );
    });
  });

  it("passes hideOutOfBandWarning: false into layer metadata", async () => {
    props = {
      ...props,
      layer: {
        ...props.layer,
        type: "geojson",
        hideOutOfBandWarning: false,
      },
    };
    api.geodataService.getLayer.mockResolvedValue("getLayer returned");

    render(
      <MapContext.Provider value={mockMapContext}>
        <Layer {...props} />
      </MapContext.Provider>
    );

    await waitFor(() => {
      expect(mockMapContext.state.maps[0].addLayer).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "Accessibility",
          metadata: expect.objectContaining({
            hideOutOfBandWarning: false,
          }),
        })
      );
    });
  });
});

describe("One missing param in the layer param", () => {
  beforeEach(() => {
    props = {
      ...props,
      layer: {
        ...props.layer,
        missingParams: ["firstMissingParam"],
      },
    };

    mockMapContext.state.maps[0].getLayer.mockReturnValue({ id: "Accessibility" });
    mockMapContext.state.maps[0].getSource.mockReturnValue({ id: "mock-source" });
  });
  afterEach(() => {
    jest.clearAllMocks();
  });
  it("Basic use", () => {
    render(
      <MapContext.Provider value={mockMapContext}>
        <Layer {...props} />
      </MapContext.Provider>
    );

    expect(mockMapContext.state.maps[0].removeLayer).toHaveBeenCalledWith(
      props.layer.name
    );
    expect(mockMapContext.state.maps[0].removeLayer).toHaveBeenCalledWith(
      `${props.layer.name}-hover`
    );
    expect(mockMapContext.state.maps[0].removeLayer).toHaveBeenCalledWith(
      `${props.layer.name}-select`
    );
    expect(mockMapContext.state.maps[0].removeSource).toHaveBeenCalledWith(
      props.layer.name
    );
  });
});

describe("One customTooltip in the layer param", () => {
  beforeEach(() => {
    props = {
      ...props,
      layer: {
        ...props.layer,
        customTooltip: {
          url: "/url",
          htmlTemplate: "<p>ImAParagraph</p>",
        },
      },
    };
  });
  afterEach(() => {
    jest.clearAllMocks();
  });
  it("Basic use", () => {
    render(
      <FilterContext.Provider value={mockFilterContext}>
        <MapContext.Provider value={mockMapContext}>
          <Layer {...props} />
        </MapContext.Provider>
      </FilterContext.Provider>
    );

    expect(mockMapContext.dispatch).toHaveBeenCalledWith({
      type: "UPDATE_LAYER_TOOLTIP_URL",
      payload: { layerName: "Accessibility", requestUrl: "/url" },
    });
  });

  it("Test without url inside the part layer.customTooltip", () => {
    props = {
      ...props,
      layer: {
        ...props.layer,
        customTooltip: {
          // url: "/url", // <= url is missing
          htmlTemplate: "<p>ImAParagraph</p>",
        },
      },
    };

    render(
      <FilterContext.Provider value={mockFilterContext}>
        <MapContext.Provider value={mockMapContext}>
          <Layer {...props} />
        </MapContext.Provider>
      </FilterContext.Provider>
    );

    expect(mockMapContext.dispatch).not.toHaveBeenCalled();
  });

  it("Param inside the url to replace", () => {
    props = {
      ...props,
      layer: {
        ...props.layer,
        customTooltip: {
          url: "/url-{paramToReplace1}-{paramToReplace2}",
          htmlTemplate: "<p>ImAParagraph</p>",
        },
      },
    };
    render(
      <FilterContext.Provider value={mockFilterContext}>
        <MapContext.Provider value={mockMapContext}>
          <Layer {...props} />
        </MapContext.Provider>
      </FilterContext.Provider>
    );

    expect(mockMapContext.dispatch).toHaveBeenCalledWith({
      type: "UPDATE_LAYER_TOOLTIP_URL",
      payload: { layerName: "Accessibility", requestUrl: "/url-ici-la" }, // first and second replaced
    });
  });
});

describe("customTooltip with a multi-parameter filter", () => {
  it("fills each date range placeholder with its own value", () => {
    const dispatch = jest.fn();
    const mapContext = {
      state: {
        ...mockMapContext.state,
        paramNameToUuidMap: { date_from: "dates", date_to: "dates" },
        filters: [{ id: "dates", type: "dateRange", paramName: ["date_from", "date_to"] }],
      },
      dispatch,
    };
    const layerProps = {
      ...props,
      layer: {
        ...props.layer,
        customTooltip: { url: "/tip?from={date_from}&to={date_to}", htmlTemplate: "<p>x</p>" },
      },
    };
    render(
      <FilterContext.Provider value={{ state: { dates: ["2025-10-06", "2025-10-19"] }, dispatch: jest.fn() }}>
        <MapContext.Provider value={mapContext}>
          <Layer {...layerProps} />
        </MapContext.Provider>
      </FilterContext.Provider>
    );

    expect(dispatch).toHaveBeenCalledWith({
      type: "UPDATE_LAYER_TOOLTIP_URL",
      payload: { layerName: "Accessibility", requestUrl: "/tip?from=2025-10-06&to=2025-10-19" },
    });
  });
});

describe("Cleanup function to remove layers and sources when the component unmounts", () => {
  beforeEach(() => {
    props = {
      layer: {
        bufferSize: 0,
        geometryType: "polygon",
        isHoverable: true,
        isStylable: true,
        name: "Accessibility",
        path: "/api/vectortiles/zones/5/{z}/{x}/{y}",
        shouldHaveLabel: false,
        shouldHaveTooltipOnHover: true,
        source: "api",
        sourceLayer: "zones",
        type: "tile", // ✅ Définir le type ici
        uniqueId: "BsipZoneVectorTile",
        visualisationName: "Bus Accessibility",
      },
    };
    mockMapContext.state.maps[0].getLayer.mockReturnValue({ id: "mock-layer" });
    mockMapContext.state.maps[0].getSource.mockReturnValue({ id: "mock-source" });
  });
  it("functions to remove", () => {
    const { unmount } = render(
      <MapContext.Provider value={mockMapContext}>
        <Layer {...props} />
      </MapContext.Provider>
    );

        expect(mockMapContext.state.maps[0].removeSource).not.toHaveBeenCalledWith(
      "selected-feature-source"
    );

    unmount();

    expect(mockMapContext.state.maps[0].removeLayer).toHaveBeenCalledWith(
      props.layer.name
    );
    expect(mockMapContext.state.maps[0].removeLayer).toHaveBeenCalledWith(
      `${props.layer.name}-hover`
    );
    expect(mockMapContext.state.maps[0].removeLayer).toHaveBeenCalledWith(
      `${props.layer.name}-select`
    );
    expect(mockMapContext.state.maps[0].removeLayer).toHaveBeenCalledWith(
      `${props.layer.name}-label`
    );

    expect(mockMapContext.state.maps[0].removeSource).toHaveBeenCalledWith(
      props.layer.name
    );
    expect(mockMapContext.state.maps[0].removeLayer).toHaveBeenCalledWith(
      "selected-feature-layer"
    );
    expect(mockMapContext.state.maps[0].removeSource).toHaveBeenCalledWith(
      "selected-feature-source"
    );
  });
});

describe("Layer zone boundaries dark mode colour inversion", () => {
  let layerProps;
  let customMapContext;

  beforeEach(() => {
    layerProps = {
      layer: {
        name: "TestZones",
        type: "tile",
        geometryType: "polygon",
        source: "api",
        sourceLayer: "zones",
        switchableBoundaries: true,
      },
    };
    customMapContext = {
      state: {
        baseMapId: "darkMatter",
        maps: [
          {
            getLayer: jest.fn(),
            removeLayer: jest.fn(),
            removeSource: jest.fn(),
            getSource: jest.fn(),
            addSource: jest.fn(),
            addLayer: jest.fn(),
            setPaintProperty: jest.fn(),
            isStyleLoaded: jest.fn(() => true),
            style: {},
          },
        ],
      },
      dispatch: jest.fn(),
    };
    api.geodataService.buildTileLayerUrl.mockReturnValue("/test-tiles");
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it("sets zone boundaries line-color to white (#ffffff) in dark mode by default", () => {
    render(
      <FilterContext.Provider value={mockFilterContext}>
        <MapContext.Provider value={customMapContext}>
          <Layer {...layerProps} />
        </MapContext.Provider>
      </FilterContext.Provider>
    );

    expect(customMapContext.state.maps[0].addLayer).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "TestZones-boundaries",
        type: "line",
        paint: expect.objectContaining({
          "line-color": "#ffffff",
        }),
      })
    );
  });

  it("inverts custom black boundariesColor to white in dark mode", () => {
    layerProps.layer.boundariesColor = "#000000";
    render(
      <FilterContext.Provider value={mockFilterContext}>
        <MapContext.Provider value={customMapContext}>
          <Layer {...layerProps} />
        </MapContext.Provider>
      </FilterContext.Provider>
    );

    expect(customMapContext.state.maps[0].addLayer).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "TestZones-boundaries",
        type: "line",
        paint: expect.objectContaining({
          "line-color": "#ffffff",
        }),
      })
    );
  });

  it("uses custom boundariesDarkColor when provided in dark mode", () => {
    layerProps.layer.boundariesDarkColor = "#ff00ff";
    render(
      <FilterContext.Provider value={mockFilterContext}>
        <MapContext.Provider value={customMapContext}>
          <Layer {...layerProps} />
        </MapContext.Provider>
      </FilterContext.Provider>
    );

    expect(customMapContext.state.maps[0].addLayer).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "TestZones-boundaries",
        type: "line",
        paint: expect.objectContaining({
          "line-color": "#ff00ff",
        }),
      })
    );
  });


});

describe("Layer zone boundaries opacity", () => {
  let layerProps;
  let customMapContext;

  beforeEach(() => {
    layerProps = {
      layer: {
        name: "TestZones",
        type: "tile",
        geometryType: "polygon",
        source: "api",
        sourceLayer: "zones",
        switchableBoundaries: true,
      },
    };
    customMapContext = {
      state: {
        mapStyle: mapStyles.geoapifyPositron,
        maps: [
          {
            getLayer: jest.fn(),
            removeLayer: jest.fn(),
            removeSource: jest.fn(),
            getSource: jest.fn(),
            addSource: jest.fn(),
            addLayer: jest.fn(),
            setPaintProperty: jest.fn(),
            isStyleLoaded: jest.fn(() => true),
            style: {},
          },
        ],
      },
      dispatch: jest.fn(),
    };
    api.geodataService.buildTileLayerUrl.mockReturnValue("/test-tiles");
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it("sets zone boundaries line-opacity to match layer defaultOpacity", () => {
    layerProps.layer.defaultOpacity = 0.45;
    render(
      <FilterContext.Provider value={mockFilterContext}>
        <MapContext.Provider value={customMapContext}>
          <Layer {...layerProps} />
        </MapContext.Provider>
      </FilterContext.Provider>
    );

    expect(customMapContext.state.maps[0].addLayer).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "TestZones-boundaries",
        type: "line",
        paint: expect.objectContaining({
          "line-opacity": 0.45,
        }),
      })
    );
  });

  it("prioritises explicit boundariesOpacity over defaultOpacity", () => {
    layerProps.layer.defaultOpacity = 0.45;
    layerProps.layer.boundariesOpacity = 0.9;
    render(
      <FilterContext.Provider value={mockFilterContext}>
        <MapContext.Provider value={customMapContext}>
          <Layer {...layerProps} />
        </MapContext.Provider>
      </FilterContext.Provider>
    );

    expect(customMapContext.state.maps[0].addLayer).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "TestZones-boundaries",
        type: "line",
        paint: expect.objectContaining({
          "line-opacity": 0.9,
        }),
      })
    );
  });

  it("applies boundaryThemePaint overrides when configured", () => {
    layerProps.layer.boundaryThemePaint = {
      light: { "line-color": "#112233" },
      dark: { "line-color": "#445566" },
    };
    render(
      <FilterContext.Provider value={mockFilterContext}>
        <MapContext.Provider value={customMapContext}>
          <Layer {...layerProps} />
        </MapContext.Provider>
      </FilterContext.Provider>
    );

    expect(customMapContext.state.maps[0].addLayer).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "TestZones-boundaries",
        type: "line",
        paint: expect.objectContaining({
          "line-color": "#112233",
        }),
      })
    );
  });

  it("respects boundariesOpacityMode fixed", () => {
    layerProps.layer.boundariesOpacityMode = "fixed";
    layerProps.layer.boundariesOpacity = 0.85;
    layerProps.layer.defaultOpacity = 0.3;
    render(
      <FilterContext.Provider value={mockFilterContext}>
        <MapContext.Provider value={customMapContext}>
          <Layer {...layerProps} />
        </MapContext.Provider>
      </FilterContext.Provider>
    );

    expect(customMapContext.state.maps[0].addLayer).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "TestZones-boundaries",
        type: "line",
        paint: expect.objectContaining({
          "line-opacity": 0.85,
        }),
      })
    );
  });
});
