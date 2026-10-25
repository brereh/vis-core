import { VisualisationManager } from "./VisualisationManager";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MapContext } from "contexts";
import { DockedLayoutContext } from "contexts/DockedLayoutContext";

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

jest.mock("./CalloutCards/BaseCalloutCardVisualisation", () => ({
  BaseCalloutCardVisualisation: ({
    visualisationName,
    cardName,
    onFirstVisible,
    onVisibilityChange,
    onCardUpdated,
    onCardUpdateAcknowledged,
    type,
    sidebarIsOpen,
  }) => {
    return (
      <div data-testid="callout-card-visualisation" data-name={visualisationName}>
        Mock BaseCalloutCardVisualisation - {visualisationName} - {cardName} - {type} - {sidebarIsOpen}
        <button onClick={onFirstVisible}>first visible: {cardName}</button>
        <button onClick={() => onVisibilityChange(true)}>visible: {cardName}</button>
        <button onClick={() => onVisibilityChange(false)}>hidden: {cardName}</button>
        <button onClick={onCardUpdated}>updated: {cardName}</button>
        <button onClick={onCardUpdateAcknowledged}>acknowledged: {cardName}</button>
      </div>
    );
  },
}));

jest.mock("./MapVisualisation", () => ({
  MapVisualisation: ({ visualisationName, map, maps, left }) => {
    return (
      <div data-testid="callout-card-visualisation">
        Mock CalloutCardVisualisation - {visualisationName} -{" "}
        {JSON.stringify(map)} - {JSON.stringify(maps)} - {left}
      </div>
    );
  },
}));

jest.mock("Components/ScrollableContainer", () => ({
  ScrollableContainer: ({
    children,
    showOnMobile,
    hideCardHandleOnMobile,
    updatedCardNames = [],
    updatedCardExpiresAtByName = {},
    onUpdatedCardsClicked,
  }) => {
    return (
      <div
        data-testid="scrollable-container"
        data-show-on-mobile={showOnMobile.toString()}
      >
        Mock ScrollableContainer - {showOnMobile.toString()} - {hideCardHandleOnMobile.toString()}
        <span data-testid="updated-card-names">{updatedCardNames.join(",")}</span>
        <span data-testid="updated-card-expiries">{JSON.stringify(updatedCardExpiresAtByName)}</span>
        <button onClick={onUpdatedCardsClicked}>clear all updates</button>
        {children}
      </div>
    );
  }
}))

const mockMapContext = {
  state: {
    visualisations: {
      calloutCard: {},
      calloutCard1: {}
    },
  },
};

describe("Test to render a CalloutVisualisationCard", () => {
  const props = {
    visualisationConfigs: {
      calloutCard: {
        type: "calloutCard",
        cardName: "Test Card",
        queryParams: {},
      },
      calloutCard1: {
        type: "calloutCard",
        cardType: "small",
        cardName: "Test Card1",
        queryParams: {},
      },
    },
    map: {},
    maps: {},
    sidebarIsOpen: false,
    left: "left"
  };
  it("classic use", () => {
    render(
      <MapContext.Provider value={mockMapContext}>
        <VisualisationManager {...props} />
      </MapContext.Provider>
    );
    const cardName = screen.getByText(/Mock BaseCalloutCardVisualisation - calloutCard - Test Card/i);
    const cardName1 = screen.getByText(/Mock BaseCalloutCardVisualisation - calloutCard1 - Test Card1/i);
    expect(cardName).toBeInTheDocument();
    expect(cardName1).toBeInTheDocument();
  });
  it("sets show-on-mobile based on presence of configured cards", () => {
    const { rerender } = render(
      <MapContext.Provider value={mockMapContext}>
        <VisualisationManager {...props} />
      </MapContext.Provider>
    );
    expect(screen.getByTestId("scrollable-container")).toHaveAttribute(
      "data-show-on-mobile",
      "true"
    );

    // Re-render with no cards
    rerender(
      <MapContext.Provider value={mockMapContext}>
        <VisualisationManager {...props} visualisationConfigs={{}} />
      </MapContext.Provider>
    );
    
    expect(screen.getByTestId("scrollable-container")).toHaveAttribute(
      "data-show-on-mobile",
      "false"
    );
  });

  it("tells the docked layout which feature is showing", async () => {
    const setSelection = jest.fn();
    const dockedProps = {
      ...props,
      visualisationConfigs: {
        ...props.visualisationConfigs,
        calloutCard: {
          ...props.visualisationConfigs.calloutCard,
          pathParams: { id: { value: "Site 42" } },
        },
      },
    };
    const { unmount } = render(
      <DockedLayoutContext.Provider value={{ calloutSlot: null, setSelection }}>
        <MapContext.Provider value={mockMapContext}>
          <VisualisationManager {...dockedProps} />
        </MapContext.Provider>
      </DockedLayoutContext.Provider>
    );
    expect(setSelection).toHaveBeenLastCalledWith({ hasSelection: false, announcement: "" });

    await userEvent.click(screen.getByRole("button", { name: "visible: Test Card" }));
    expect(setSelection).toHaveBeenLastCalledWith({
      hasSelection: true,
      announcement: "Showing Test Card for Site 42",
    });

    await userEvent.click(screen.getByRole("button", { name: "hidden: Test Card" }));
    expect(setSelection).toHaveBeenLastCalledWith({
      hasSelection: false,
      announcement: "Selection cleared",
    });

    await userEvent.click(screen.getByRole("button", { name: "visible: Test Card" }));
    unmount();
    expect(setSelection).toHaveBeenLastCalledWith({ hasSelection: false, announcement: "" });
  });

  it("moves a card to the top only the first time it becomes visible", async () => {
    const user = userEvent.setup();

    render(
      <MapContext.Provider value={mockMapContext}>
        <VisualisationManager {...props} />
      </MapContext.Provider>
    );

    expect(screen.getAllByTestId("callout-card-visualisation").map((el) => el.dataset.name)).toEqual([
      "calloutCard",
      "calloutCard1",
    ]);

    await user.click(screen.getByRole("button", { name: "first visible: Test Card1" }));
    expect(screen.getAllByTestId("callout-card-visualisation").map((el) => el.dataset.name)).toEqual([
      "calloutCard1",
      "calloutCard",
    ]);

    await user.click(screen.getByRole("button", { name: "first visible: Test Card1" }));
    expect(screen.getAllByTestId("callout-card-visualisation").map((el) => el.dataset.name)).toEqual([
      "calloutCard1",
      "calloutCard",
    ]);
  });

  it("tracks and clears updated card markers", async () => {
    const user = userEvent.setup();

    render(
      <MapContext.Provider value={mockMapContext}>
        <VisualisationManager {...props} />
      </MapContext.Provider>
    );

    await user.click(screen.getByRole("button", { name: "updated: Test Card1" }));
    expect(screen.getByTestId("updated-card-names")).toHaveTextContent("calloutCard1");

    await user.click(screen.getByRole("button", { name: "acknowledged: Test Card1" }));
    expect(screen.getByTestId("updated-card-names")).toHaveTextContent("");

    await user.click(screen.getByRole("button", { name: "updated: Test Card" }));
    await user.click(screen.getByRole("button", { name: "updated: Test Card1" }));
    expect(screen.getByTestId("updated-card-names")).toHaveTextContent("calloutCard,calloutCard1");

    await user.click(screen.getByText("clear all updates"));
    expect(screen.getByTestId("updated-card-names")).toHaveTextContent("");
  });

  it("preserves existing update expiry when another card updates", async () => {
    const user = userEvent.setup();
    let now = 0;
    const nowSpy = jest.spyOn(Date, "now").mockImplementation(() => now);

    render(
      <MapContext.Provider value={mockMapContext}>
        <VisualisationManager {...props} />
      </MapContext.Provider>
    );

    await user.click(screen.getByRole("button", { name: "updated: Test Card" }));
    expect(screen.getByTestId("updated-card-expiries")).toHaveTextContent(
      JSON.stringify({ calloutCard: 2800 })
    );

    now = 1000;
    await user.click(screen.getByRole("button", { name: "updated: Test Card1" }));
    expect(screen.getByTestId("updated-card-expiries")).toHaveTextContent(
      JSON.stringify({ calloutCard: 2800, calloutCard1: 3800 })
    );

    nowSpy.mockRestore();
  });
});

describe("Test to render a Map", () => {
  const propsType1 = {
    visualisationConfigs: {
      map: {
        type: "geojson",
        queryParams: {},
      },
    },
    map: {},
    maps: {},
  };
  const propsType2 = {
    visualisationConfigs: {
      map: {
        type: "geojson",
        queryParams: {},
      },
    },
    map: {},
    maps: {},
  };
  it("render a map with the geojson type", () => {
    render(
      <MapContext.Provider value={mockMapContext}>
        <VisualisationManager {...propsType1} />
      </MapContext.Provider>
    );
    expect(
      screen.getByText(/Mock CalloutCardVisualisation/)
    ).toBeInTheDocument();
  });
  it("render a map with the joinDataToMap type", () => {
    render(
      <MapContext.Provider value={mockMapContext}>
        <VisualisationManager {...propsType2} />
      </MapContext.Provider>
    );
    expect(
      screen.getByText(/Mock CalloutCardVisualisation/)
    ).toBeInTheDocument();
  });
});
