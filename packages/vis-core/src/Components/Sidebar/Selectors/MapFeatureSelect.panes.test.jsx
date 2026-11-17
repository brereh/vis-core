import { render } from "@testing-library/react";
import { BaseMapFeatureSelect } from "./MapFeatureSelect";
import { resolveMapGrid } from "../../../map/resolveMapGrid";
import { MapContext } from "contexts";

const selectMaps = [];
jest.mock("hooks/useFeatureSelect", () => ({
  useFeatureSelect: (map) => {
    selectMaps.push(map);
    return [];
  },
}));
jest.mock("./FeatureSelect.jsx", () => ({ FeatureSelect: () => null }));
jest.mock("polished", () => ({ darken: (amount, color) => color ?? "#cccccc" }));
jest.mock("maplibre-gl", () => ({ Map: jest.fn() }));

const filter = { id: "select", type: "mapFeatureSelect", layer: "Zones", panes: ["b"] };
const grid = resolveMapGrid({
  type: "MapLayout",
  config: { layers: [{ name: "Zones" }], visualisations: [], grid: { columns: 2, rows: 1, cells: [{ id: "a" }, { id: "b", column: 2 }] } },
});
const mapA = { name: "a" };
const mapB = { name: "b" };

const renderSelect = (state) =>
  render(
    <MapContext.Provider value={{ state: { visualisations: {}, layers: { Zones: { path: "/zones" } }, currentZoom: 10, ...state } }}>
      <BaseMapFeatureSelect filter={filter} value={[]} onChange={jest.fn()} showControls={false} />
    </MapContext.Provider>
  );

beforeEach(() => {
  selectMaps.length = 0;
});

describe("BaseMapFeatureSelect on a configured grid", () => {
  it("selects on the pane hosting the draw control", () => {
    renderSelect({ mapGrid: grid, filters: [filter], mapsByPane: { a: mapA, b: mapB }, map: mapA });
    expect(selectMaps.at(-1)).toBe(mapB);
  });

  it("waits for that pane's map rather than using the primary map", () => {
    renderSelect({ mapGrid: grid, filters: [filter], mapsByPane: { a: mapA }, map: mapA });
    expect(selectMaps.at(-1)).toBeNull();
  });
});

describe("BaseMapFeatureSelect on a side-by-side page", () => {
  it("selects on the primary pane's map, falling back to state.map", () => {
    const dual = resolveMapGrid({ type: "DualMapLayout", config: { layers: [], visualisations: [] } });
    renderSelect({ mapGrid: dual, filters: [{ ...filter, panes: ["right"] }], mapsByPane: {}, map: mapA });
    expect(selectMaps.at(-1)).toBe(mapA);
  });
});
