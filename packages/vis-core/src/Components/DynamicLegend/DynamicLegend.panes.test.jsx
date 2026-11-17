import React from "react";
import { render } from "@testing-library/react";
import { DynamicLegend } from "./DynamicLegend";
import { MapContext } from "contexts/MapContext";
import { AppContext, PageContext } from "contexts";
import { resolveMapGrid } from "../../map/resolveMapGrid";

const recordedGroups = [];
jest.mock("./LegendLayerGroup", () => ({
  __esModule: true,
  default: (props) => {
    recordedGroups.push(props);
    return <div data-testid={`legend-${props.item.layerId}`} />;
  },
}));

jest.mock("maplibre-gl", () => ({ Map: jest.fn() }));

const VIS = "Zones vis";
const config = {
  layers: [{ name: "Zones" }],
  visualisations: [{ name: VIS, type: "joinDataToMap" }],
};

const legendMap = () => ({
  on: jest.fn(),
  off: jest.fn(),
  getStyle: () => ({
    layers: [
      {
        id: "Zones",
        type: "fill",
        source: "zones",
        metadata: { isStylable: true },
        paint: { "fill-color": "#00ffff" },
      },
    ],
  }),
});

const renderLegend = (state, props) =>
  render(
    <MapContext.Provider value={{ state }}>
      <AppContext.Provider value={{ defaultBands: [] }}>
        <PageContext.Provider value={{ pageName: "test", config: { filters: [] } }}>
          <DynamicLegend map={legendMap()} {...props} />
        </PageContext.Provider>
      </AppContext.Provider>
    </MapContext.Provider>
  );

const lastDataFor = (layerId) =>
  recordedGroups.filter((props) => props.item.layerId === layerId).at(-1)?.visualisationDataByLayer?.[layerId];

const baseState = {
  filters: [],
  layers: {},
  currentZoom: 10,
  visualisations: { [VIS]: { name: VIS, joinLayer: "Zones", style: "polygon-continuous", data: ["page copy"] } },
};

beforeEach(() => {
  recordedGroups.length = 0;
});

describe("DynamicLegend data per pane", () => {
  const ownGrid = resolveMapGrid({
    type: "MapLayout",
    config: {
      ...config,
      grid: { columns: 3, rows: 1, cells: [{ id: "a" }, { id: "b", column: 2 }, { id: "c", column: 3, classification: "own" }] },
    },
  });
  const paneData = { a: { [VIS]: [{ value: 1 }] }, b: { [VIS]: [{ value: 2 }] }, c: { [VIS]: [{ value: 3 }] } };

  it("gives a shared group's legend the group's data together", () => {
    renderLegend({ ...baseState, mapGrid: ownGrid, paneData }, { paneId: "b" });
    expect(lastDataFor("Zones")).toEqual([{ value: 1 }, { value: 2 }]);
  });

  it("gives an own-classification pane's legend that pane's data only", () => {
    renderLegend({ ...baseState, mapGrid: ownGrid, paneData }, { paneId: "c" });
    expect(lastDataFor("Zones")).toEqual([{ value: 3 }]);
  });

  it("gives a side-by-side page's legend both panes' data, as the page copy held", () => {
    const dual = resolveMapGrid({ type: "DualMapLayout", config });
    renderLegend(
      { ...baseState, mapGrid: dual, paneData: { left: { [VIS]: [{ value: 1 }] }, right: { [VIS]: [{ value: 2 }] } } },
      { paneId: "right" }
    );
    expect(lastDataFor("Zones")).toEqual([{ value: 1 }, { value: 2 }]);
  });

  it("uses the primary pane without a pane, and the page copy where no pane has data", () => {
    renderLegend({ ...baseState }, {});
    expect(lastDataFor("Zones")).toEqual(["page copy"]);
  });
});
