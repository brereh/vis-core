import { CARD_CONSTANTS } from "defaults";
import { act, render, screen, waitFor } from "@testing-library/react";
import { CalloutCardVisualisation } from "./CalloutCardVisualisation";
import { MapContext } from "contexts/MapContext";
import userEvent from "@testing-library/user-event";
import { useFetchVisualisationData } from "hooks/useFetchVisualisationData";
import { ThemeProvider } from "styled-components";

jest.mock("@heroicons/react/24/solid", () => ({
  ChevronRightIcon: (props) => <span>ChevronRight</span>,
  ChevronLeftIcon: (props) => <span>ChevronLeft</span>,
}));
jest.mock("hooks", () => ({
  useFetchVisualisationData: jest.fn(),
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
let mockMapContext = {
  state: {
    mapStyle: "default",
    mapCentre: [0, 0],
    mapZoom: 10,
    layers: {},
    visualisations: {
      test: {
        name: "Detailed Information",
        type: "calloutCard",
        cardType: "fullscreen",
        cardName: "",
        dataSource: "api",
        dataPath: "/api/avp/pca/locations/{id}",
        htmlFragment:
          "<p>{programme_id}-{label}-{location_id}-{text_with_placeholders}</p>",
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

const theme = {
  mq: { mpbile: false },
};

let props = {
  cardName: "cardName",
  onUpdate: jest.fn(),
  data: {
    programme_id: 1,
    label: "label",
    location_id: "location_id",
    text_with_placeholders: "text_with_placeholders",
  },
  isLoading: false,
  visualisationName: "test",
};
describe("Tests when useFetchVisualisationData return valid values", () => {
  afterEach(() => {
    jest.clearAllMocks();
  });
  it("Test the render of the html fragment, and the click on the toggle button", async () => {
    render(
      <ThemeProvider theme={theme}>
        <MapContext.Provider value={mockMapContext}>
          <CalloutCardVisualisation {...props} />
        </MapContext.Provider>
      </ThemeProvider>
    );
    expect(screen.getByText("cardName")).toBeInTheDocument();
    // Html fragment
    const htmlFragment = screen.getByText(
      "1-label-location_id-text_with_placeholders"
    );
    expect(htmlFragment).toBeInTheDocument();
    expect(htmlFragment.tagName).toBe("P"); // To be a <p/> element
    // check the button
    const button = screen.getByRole("button");
    expect(button).toBeInTheDocument();
    // Wait for the card to become visible (requestAnimationFrame transition)
    await waitFor(() => {
      expect(screen.getByText("ChevronRight")).toBeInTheDocument();
    });
    await userEvent.click(button);
    await waitFor(() => {
      expect(screen.getByText("ChevronLeft")).toBeInTheDocument();
    });
  });

  it.each([
    [false, `${CARD_CONSTANTS.CARD_WIDTH}px`],
    [true, "100%"],
  ])("sizes the card for docked=%s", async (docked, expectedWidth) => {
    const { container } = render(
      <ThemeProvider theme={theme}>
        <MapContext.Provider value={mockMapContext}>
          <CalloutCardVisualisation {...props} docked={docked} />
        </MapContext.Provider>
      </ThemeProvider>
    );
    const parent = await waitFor(() => {
      const el = container.querySelector("[data-callout-card-name]");
      expect(el).not.toBeNull();
      return el;
    });
    expect(window.getComputedStyle(parent.firstChild).width).toBe(expectedWidth);
    if (docked) expect(window.getComputedStyle(parent).width).toBe("100%");
  });

  it("Function onUpdate have been called", () => {
    render(
      <ThemeProvider theme={theme}>
        <MapContext.Provider value={mockMapContext}>
          <CalloutCardVisualisation {...props} />
        </MapContext.Provider>
      </ThemeProvider>
    );
    // customFormattingFunctions function to have been called
    expect(props.onUpdate).toHaveBeenCalled();
  });

  it("reports visibility when renderable data is available", async () => {
    const onVisibilityChange = jest.fn();

    render(
      <ThemeProvider theme={theme}>
        <MapContext.Provider value={mockMapContext}>
          <CalloutCardVisualisation {...props} onVisibilityChange={onVisibilityChange} />
        </MapContext.Provider>
      </ThemeProvider>
    );

    await waitFor(() => {
      expect(onVisibilityChange).toHaveBeenCalledWith(true);
    });
  });

  it("shows an update badge for changed data and acknowledges it when opened", async () => {
    const onCardUpdated = jest.fn();
    const onCardUpdateAcknowledged = jest.fn();
    const user = userEvent.setup();

    const { rerender } = render(
      <ThemeProvider theme={theme}>
        <MapContext.Provider value={mockMapContext}>
          <CalloutCardVisualisation
            {...props}
            onCardUpdated={onCardUpdated}
            onCardUpdateAcknowledged={onCardUpdateAcknowledged}
          />
        </MapContext.Provider>
      </ThemeProvider>
    );

    await waitFor(() => {
      expect(screen.getByText("ChevronRight")).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: /hide cardName/i }));

    await waitFor(() => {
      expect(screen.getByText("ChevronLeft")).toBeInTheDocument();
    });

    rerender(
      <ThemeProvider theme={theme}>
        <MapContext.Provider value={mockMapContext}>
          <CalloutCardVisualisation
            {...props}
            data={{ ...props.data, label: "updated label" }}
            onCardUpdated={onCardUpdated}
            onCardUpdateAcknowledged={onCardUpdateAcknowledged}
          />
        </MapContext.Provider>
      </ThemeProvider>
    );

    await waitFor(() => {
      expect(onCardUpdated).toHaveBeenCalledTimes(1);
      expect(screen.getByRole("status")).toHaveTextContent("Updated");
    });

    await user.click(screen.getByRole("button", { name: /show cardName/i }));

    expect(onCardUpdateAcknowledged).toHaveBeenCalledTimes(1);
  });

  it("uses the same expiry timestamp for the update callback and local badge", async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
    const onCardUpdated = jest.fn();

    const { rerender } = render(
      <ThemeProvider theme={theme}>
        <MapContext.Provider value={mockMapContext}>
          <CalloutCardVisualisation {...props} onCardUpdated={onCardUpdated} />
        </MapContext.Provider>
      </ThemeProvider>
    );

    await waitFor(() => {
      expect(screen.getByText("ChevronRight")).toBeInTheDocument();
    });

    rerender(
      <ThemeProvider theme={theme}>
        <MapContext.Provider value={mockMapContext}>
          <CalloutCardVisualisation
            {...props}
            data={{ ...props.data, label: "updated label" }}
            onCardUpdated={onCardUpdated}
          />
        </MapContext.Provider>
      </ThemeProvider>
    );

    await waitFor(() => {
      expect(onCardUpdated).toHaveBeenCalledWith({
        autoClearAt: Date.now() + 2800,
        timeoutMs: 2800,
      });
      expect(screen.getByRole("status")).toHaveTextContent("Updated");
    });

    act(() => {
      jest.advanceTimersByTime(2799);
    });
    expect(screen.getByRole("status")).toHaveTextContent("Updated");

    act(() => {
      jest.advanceTimersByTime(1);
    });
    expect(screen.queryByRole("status")).not.toBeInTheDocument();

    jest.useRealTimers();
  });
});

describe("Tests when useFetchVisualisationData return isLoading", () => {
  const propsWithLoading = {
    ...props,
    isLoading: true
  }
  afterEach(() => {
    jest.clearAllMocks();
  });
  it("Check the isLoading texts", () => {
    render(
      <ThemeProvider theme={theme}>
        <MapContext.Provider value={mockMapContext}>
          <CalloutCardVisualisation {...propsWithLoading} />
        </MapContext.Provider>
      </ThemeProvider>
    );
    const textsIsLoading = screen.getAllByText("Loading...");
    const h2Element = textsIsLoading.find((el) => el.tagName === "H2");
    const h3Element = textsIsLoading.find((el) => el.tagName === "H3");
    expect(h2Element).toBeInTheDocument();
    expect(h3Element).toBeInTheDocument();
  });
  it("hides the desktop toggle while loading in mobile stack mode", () => {
    render(
      <ThemeProvider theme={theme}>
        <MapContext.Provider value={mockMapContext}>
          <CalloutCardVisualisation {...propsWithLoading} hideHandleOnMobile />
        </MapContext.Provider>
      </ThemeProvider>
    );

    expect(screen.getAllByText("Loading...")).toHaveLength(2);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
  it("Click on the toggle button", async () => {
    render(
      <ThemeProvider theme={theme}>
        <MapContext.Provider value={mockMapContext}>
          <CalloutCardVisualisation {...props} />
        </MapContext.Provider>
      </ThemeProvider>
    );
    const toggleButton = screen.getByRole("button");
    // Wait for the card to become visible (requestAnimationFrame transition)
    await waitFor(() => {
      expect(screen.getByText("ChevronRight")).toBeInTheDocument();
    });
    await userEvent.click(toggleButton);
    await waitFor(() => {
      expect(screen.getByText("ChevronLeft")).toBeInTheDocument();
    });
  });
});

describe("Tests for mobile stacked cards", () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it("renders loaded card content without the desktop toggle", () => {
    render(
      <ThemeProvider theme={theme}>
        <MapContext.Provider value={mockMapContext}>
          <CalloutCardVisualisation {...props} hideHandleOnMobile />
        </MapContext.Provider>
      </ThemeProvider>
    );

    expect(screen.getByText("cardName")).toBeInTheDocument();
    expect(screen.getByText("1-label-location_id-text_with_placeholders")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});

describe("Tests when isLoading is false and without data", () => {
  const propsEmpty = {
    ...props,
    data: undefined,
    isLoading: undefined,
    visualisationName: "test"
  }
  afterEach(() => {
    jest.clearAllMocks();
  });
  it("Check the empty returned", () => {
    const onVisibilityChange = jest.fn();
    const { container } = render(
      <ThemeProvider theme={theme}>
        <MapContext.Provider value={mockMapContext}>
          <CalloutCardVisualisation {...propsEmpty} onVisibilityChange={onVisibilityChange} />
        </MapContext.Provider>
      </ThemeProvider>
    );
    expect(container).toBeEmptyDOMElement();
    expect(onVisibilityChange).toHaveBeenCalledWith(false);
  });
});

describe("Tests formatNumberWithUnit in callout card", () => {
  it("renders card value with unit from mainValues.units", () => {
    const layoutContext = {
      ...mockMapContext,
      state: {
        ...mockMapContext.state,
        visualisations: {
          layoutTest: {
            name: "Summary Card",
            type: "calloutCard",
            layout: [
              {
                type: "html",
                fragment: '<div class="value">{formatNumberWithUnit(value)}</div>',
              },
            ],
          },
        },
      },
    };

    const layoutProps = {
      ...props,
      visualisationName: "layoutTest",
      data: {
        mainValues: {
          metric: "Total Floorspace",
          value: "123456",
          units: "sqm",
        },
      },
    };

    render(
      <ThemeProvider theme={theme}>
        <MapContext.Provider value={layoutContext}>
          <CalloutCardVisualisation {...layoutProps} />
        </MapContext.Provider>
      </ThemeProvider>
    );

    expect(screen.getByText("123.46K sqm")).toBeInTheDocument();
  });
});

describe("Per-feature download", () => {
  const { api } = jest.requireActual("services");

  it("renders the configured download button with the feature id and current filters", async () => {
    const downloadSpy = jest
      .spyOn(api.downloadService, "downloadFile")
      .mockResolvedValue({ filename: "site-72.csv" });
    const context = {
      ...mockMapContext,
      state: {
        ...mockMapContext.state,
        visualisations: {
          test: {
            ...mockMapContext.state.visualisations.test,
            pathParams: { id: { value: 72 } },
            queryParams: { day_type: { value: "neutral" }, vehicle_class: { value: null } },
            download: { path: "/api/download/counts/atc/sites/{id}", label: "Site CSV" },
          },
        },
      },
    };

    render(
      <ThemeProvider theme={theme}>
        <MapContext.Provider value={context}>
          <CalloutCardVisualisation {...props} />
        </MapContext.Provider>
      </ThemeProvider>
    );

    await userEvent.click(screen.getByRole("button", { name: "Site CSV" }));
    expect(downloadSpy).toHaveBeenCalledWith("/api/download/counts/atc/sites/72", {
      queryParams: { day_type: "neutral" },
      skipAuth: false,
      method: "GET",
    });
  });

  it("renders no download button without config", () => {
    render(
      <ThemeProvider theme={theme}>
        <MapContext.Provider value={mockMapContext}>
          <CalloutCardVisualisation {...props} />
        </MapContext.Provider>
      </ThemeProvider>
    );
    expect(screen.queryByRole("button", { name: /csv/i })).not.toBeInTheDocument();
  });
});
