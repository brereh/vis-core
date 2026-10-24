import { render, screen, waitFor } from "@testing-library/react";
import { DownloadSection } from "Components/Sidebar/Selectors/DownloadSelection";
import { AppContext } from "contexts/AppContext";
import { PageContext } from "contexts/PageContext";
import { FilterContext } from "contexts/FilterContext";
import { api } from "services";

jest.mock("services", () => ({
  api: {
    baseService: { post: jest.fn(), get: jest.fn() },
    downloadService: {
      checkGetRequestSize: jest.fn(() => ({ isValid: true, error: null })),
      downloadFile: jest.fn(),
    },
  },
}));
jest.mock("Components/Sidebar/Accordion", () => ({
  AccordionSection: ({ children }) => <div>{children}</div>,
}));
jest.mock("Components/Sidebar/Selectors/Dropdown", () => ({
  Dropdown: ({ filter }) => (
    <div data-testid="dropdown">{filter.values.values.map((v) => v.displayValue).join(",")}</div>
  ),
}));

const filters = [
  { paramName: "scenario", filterName: "Scenario", type: "dropdown", values: { source: "api" } },
];

const renderSection = (pageConfig = {}, appConfig = {}) =>
  render(
    <AppContext.Provider value={{ apiSchema: { paths: {} }, ...appConfig }}>
      <PageContext.Provider
        value={{ config: { visualisations: [{ dataPath: "/api/data" }], ...pageConfig } }}
      >
        <FilterContext.Provider value={{ state: {}, dispatch: jest.fn() }}>
          <DownloadSection filters={filters} downloadPath="/api/download" bgColor="#123456" />
        </FilterContext.Provider>
      </PageContext.Provider>
    </AppContext.Provider>
  );

describe("DownloadSection metadata path", () => {
  beforeEach(() => {
    api.baseService.post.mockResolvedValue([{ field_name: "scenario", distinct_values: ["A", "B"] }]);
  });

  it("keeps TAME's /api/tame/mvdata by default", async () => {
    renderSection();
    await waitFor(() => expect(screen.getByTestId("dropdown")).toHaveTextContent("A,B"));
    expect(api.baseService.post).toHaveBeenCalledWith(
      "/api/tame/mvdata",
      { dataPath: "/api/data" },
      { skipAuth: false }
    );
  });

  it("uses downloadMetadataPath from config", async () => {
    renderSection({ downloadMetadataPath: "/api/meta/distinct" });
    await waitFor(() => expect(screen.getByTestId("dropdown")).toBeInTheDocument());
    expect(api.baseService.post).toHaveBeenCalledWith(
      "/api/meta/distinct",
      { dataPath: "/api/data" },
      { skipAuth: false }
    );
  });
});
