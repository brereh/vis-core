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
  // Swallows the props ScrollableContainer adds to each card, except `docked`.
  const ZoneSummaryCard = ({ docked }) => (
    <section aria-label="Zone summary" data-docked={String(!!docked)}>
      Zone summary card
    </section>
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

// A map-click filter: its hint shows in the filters in overlay mode only.
const mapClickFilter = {
  id: "site-click",
  type: "map",
  paramName: "site",
  filterName: "Click a site on the map to select it",
  actions: [],
  values: { source: "local", values: [] },
};

const mapState = {
  layers: {},
  visualisations: {},
  metadataTables: {},
  filters: [mapClickFilter],
  isLoading: false,
  visualisationLoadingCount: 0,
  pageIsReady: false,
};

const renderLayout = ({ config = {}, appContext = {}, visualisations = {} } = {}) => {
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
      <AppContext.Provider value={{ appPages: [{ url: "/", pageName: "Traffic counts" }], apiSchema: { paths: {} }, ...appContext }}>
        <PageContext.Provider value={pageContext}>
          <FilterContext.Provider value={{ state: {}, dispatch: jest.fn() }}>
            <MapContext.Provider value={{ state: { ...mapState, visualisations }, dispatch: jest.fn() }}>
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
    // Cards are told to fill the column instead of keeping the overlay width.
    expect(within(column).getByRole("region", { name: "Zone summary" })).toHaveAttribute("data-docked", "true");
  });

  // jsdom can't compute contrast for jest-axe, so pin the text to the body text token.
  it("uses the body text colour for the description and prompt", () => {
    renderLayout({ config: { layout: "docked" } });

    expect(window.getComputedStyle(screen.getByText("Counts at permanent sites.")).color).toBe("var(--text-icon)");
    expect(window.getComputedStyle(screen.getByText("Counts at permanent sites.")).fontSize).toBe("0.875rem");
    expect(
      window.getComputedStyle(screen.getByText("Click a feature on the map to see its summary")).color
    ).toBe("var(--text-icon)");
  });

  it("drops the map-click hint from the filters column", () => {
    renderLayout({ config: { layout: "docked" } });

    expect(screen.getByRole("complementary", { name: "Filters" })).toBeInTheDocument();
    expect(screen.queryByText("Click a site on the map to select it")).not.toBeInTheDocument();
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

  it("keeps the overlay layout when a callout card is fullscreen", () => {
    renderLayout({
      config: { layout: "docked" },
      visualisations: { Detail: { type: "calloutCard", cardType: "fullscreen" } },
    });

    expect(screen.queryByRole("complementary")).not.toBeInTheDocument();
    expect(screen.getByTestId("map")).toHaveAttribute("data-resize-with-container", "false");
  });

  it("keeps the default overlay layout when no layout is set", () => {
    renderLayout();

    expect(screen.getByText("Click a site on the map to select it")).toBeInTheDocument();
    expect(screen.queryByRole("complementary")).not.toBeInTheDocument();
    expect(within(screen.getByTestId("map")).getByText("Zone summary card")).toBeInTheDocument();
    expect(screen.getByText("Filters", { selector: "span" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Zone summary" })).toHaveAttribute("data-docked", "false");
  });

  describe("column widths", () => {
    const widths = () => ({
      filters: window.getComputedStyle(screen.getByRole("complementary", { name: "Filters" })).width,
      selection: window.getComputedStyle(screen.getByRole("complementary", { name: "Selected feature" })).width,
    });

    it("defaults to 320px and 360px", () => {
      renderLayout({ config: { layout: "docked" } });
      expect(widths()).toEqual({ filters: "320px", selection: "360px" });
    });

    it("uses the page config", () => {
      renderLayout({ config: { layout: "docked", dockedFilterWidth: 300, dockedSelectionWidth: "24rem" } });
      expect(widths()).toEqual({ filters: "300px", selection: "24rem" });
    });

    it("uses the app defaults, with the page value winning", () => {
      renderLayout({
        config: { layout: "docked", dockedSelectionWidth: 400 },
        appContext: { defaultDockedFilterWidth: 340, defaultDockedSelectionWidth: 380 },
      });
      expect(widths()).toEqual({ filters: "340px", selection: "400px" });
    });
  });

  it("has no automated accessibility violations", async () => {
    const { container } = renderLayout({ config: { layout: "docked" } });
    await screen.findByText("Zone summary card");

    expect(await axe(container)).toHaveNoViolations();
  });
});
