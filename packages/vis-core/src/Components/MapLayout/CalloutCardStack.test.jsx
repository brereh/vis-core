import { CalloutCardStack } from "./CalloutCardStack";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MapContext } from "contexts";

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
  MapVisualisation: ({ visualisationName }) => (
    <div data-testid="map-visualisation">Mock MapVisualisation - {visualisationName}</div>
  ),
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
    sidebarIsOpen: false,
    left: "left"
  };
  it("classic use", () => {
    render(
      <MapContext.Provider value={mockMapContext}>
        <CalloutCardStack {...props} />
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
        <CalloutCardStack {...props} />
      </MapContext.Provider>
    );
    expect(screen.getByTestId("scrollable-container")).toHaveAttribute(
      "data-show-on-mobile",
      "true"
    );

    // Re-render with no cards
    rerender(
      <MapContext.Provider value={mockMapContext}>
        <CalloutCardStack {...props} visualisationConfigs={{}} />
      </MapContext.Provider>
    );
    
    expect(screen.getByTestId("scrollable-container")).toHaveAttribute(
      "data-show-on-mobile",
      "false"
    );
  });

  it("moves a card to the top only the first time it becomes visible", async () => {
    const user = userEvent.setup();

    render(
      <MapContext.Provider value={mockMapContext}>
        <CalloutCardStack {...props} />
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
        <CalloutCardStack {...props} />
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
        <CalloutCardStack {...props} />
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

describe("map visualisations", () => {
  it("are left to the map panes: the card stack draws only callout cards", () => {
    render(
      <MapContext.Provider value={mockMapContext}>
        <CalloutCardStack
          visualisationConfigs={{
            zones: { type: "joinDataToMap", queryParams: {} },
            flows: { type: "geojson", queryParams: {} },
            summary: { type: "calloutCard" },
          }}
        />
      </MapContext.Provider>
    );
    expect(screen.queryByTestId("map-visualisation")).not.toBeInTheDocument();
    expect(screen.getAllByTestId("callout-card-visualisation")).toHaveLength(1);
  });
});
