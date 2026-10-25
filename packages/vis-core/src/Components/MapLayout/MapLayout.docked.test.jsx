import { render, screen, within, waitFor } from "@testing-library/react";
import { axe } from "jest-axe";
import { ThemeProvider } from "styled-components";
import { MapLayout } from ".";
import { AppContext, FilterContext, MapContext, PageContext } from "contexts";

jest.mock("maplibre-gl", () => ({ Map: jest.fn() }));

jest.mock("Components/Dimmer", () => ({ Dimmer: () => null }));

jest.mock("Components/Sidebar/Accordion", () => ({
  ...jest.requireActual("Components/Sidebar/Accordion"),
  MapLayerSection: () => <div>MapLayerSection</div>,
}));

// Stand-in for the real map: renders a callout card through the real
// ScrollableContainer, the way VisualisationManager does.
jest.mock("./Map", () => {
  const { ScrollableContainer } = jest.requireActual(
    "Components/ScrollableContainer/ScrollableContainer"
  );
  // Swallows the props ScrollableContainer adds to each card.
  const ZoneSummaryCard = () => (
    <section aria-label="Zone summary">Zone summary card</section>
  );
  return {
    __esModule: true,
    default: ({ resizeWithContainer }) => (
      <div data-testid="map" data-resize-with-container={String(!!resizeWithContainer)}>
        <ScrollableContainer>
          <ZoneSummaryCard />
        </ScrollableContainer>
      </div>
    ),
  };
});

const theme = { mq: { mobile: "(max-width: 900px)" } };

const mapState = {
  layers: {},
  visualisations: {},
  metadataTables: {},
  filters: [],
  isLoading: false,
  visualisationLoadingCount: 0,
  pageIsReady: false,
};

const renderLayout = ({ config = {}, appContext = {} } = {}) => {
  const pageContext = {
    type: "MapLayout",
    pageName: "Traffic counts",
    description: "Counts at permanent sites.",
    about: "About text",
    legalText: "Legal text",
    config,
  };
  return render(
    <ThemeProvider theme={theme}>
      <AppContext.Provider value={{ appPages: [], ...appContext }}>
        <PageContext.Provider value={pageContext}>
          <FilterContext.Provider value={{ state: {}, dispatch: jest.fn() }}>
            <MapContext.Provider value={{ state: mapState, dispatch: jest.fn() }}>
              <MapLayout />
            </MapContext.Provider>
          </FilterContext.Provider>
        </PageContext.Provider>
      </AppContext.Provider>
    </ThemeProvider>
  );
};

const mockMatchMedia = (matches) => {
  window.matchMedia = jest.fn().mockImplementation((query) => ({
    matches: query.includes("min-width") ? matches : false,
    media: query,
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
  }));
};

describe("MapLayout docked layout", () => {
  const originalMatchMedia = window.matchMedia;

  beforeEach(() => mockMatchMedia(true));
  afterEach(() => {
    window.matchMedia = originalMatchMedia;
  });

  it("renders the filters in a fixed column with no collapse toggle", () => {
    renderLayout({ config: { layout: "docked" } });

    const filters = screen.getByRole("complementary", { name: "Filters" });
    expect(within(filters).getByRole("heading", { name: "Traffic counts" })).toBeInTheDocument();
    expect(within(filters).getByText("Counts at permanent sites.")).toBeInTheDocument();
    // Every remaining button is an accordion header; the "<" toggle and mobile bar are gone.
    within(filters)
      .getAllByRole("button")
      .forEach((button) => expect(button).toHaveAttribute("aria-controls"));
    expect(screen.queryByText("Filters", { selector: "span" })).not.toBeInTheDocument();
    expect(screen.getByTestId("map")).toHaveAttribute("data-resize-with-container", "true");
  });

  it("renders the callout card in the selected feature column", async () => {
    renderLayout({ config: { layout: "docked" } });

    const column = screen.getByRole("complementary", { name: "Selected feature" });
    await waitFor(() =>
      expect(within(column).getByRole("region", { name: "Zone summary" })).toBeInTheDocument()
    );
    expect(within(screen.getByTestId("map")).queryByText("Zone summary card")).not.toBeInTheDocument();
    expect(within(column).getByRole("status")).toHaveAttribute("aria-live", "polite");
  });

  it("shows the page prompt while nothing is selected", () => {
    renderLayout({ config: { layout: "docked", dockedPrompt: "Click a site on the map to see its summary" } });

    expect(screen.getByText("Click a site on the map to see its summary")).toBeInTheDocument();
  });

  it("can be switched on by the app-level default", () => {
    renderLayout({ appContext: { defaultMapLayout: "docked" } });

    expect(screen.getByRole("complementary", { name: "Filters" })).toBeInTheDocument();
  });

  it("falls back to the overlay layout on narrow screens", () => {
    mockMatchMedia(false);
    renderLayout({ config: { layout: "docked" } });

    expect(screen.queryByRole("complementary")).not.toBeInTheDocument();
    expect(screen.getByTestId("map")).toHaveAttribute("data-resize-with-container", "false");
  });

  it("keeps the default overlay layout when no layout is set", () => {
    renderLayout();

    expect(screen.queryByRole("complementary")).not.toBeInTheDocument();
    expect(within(screen.getByTestId("map")).getByText("Zone summary card")).toBeInTheDocument();
    expect(screen.getByText("Filters", { selector: "span" })).toBeInTheDocument();
  });

  it("has no automated accessibility violations", async () => {
    const { container } = renderLayout({ config: { layout: "docked" } });
    await screen.findByText("Zone summary card");

    expect(await axe(container)).toHaveNoViolations();
  });
});
