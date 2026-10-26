import { filterMemoryKey, isMapViewMemoryEnabled, readMapView, writeMapView } from "./mapViewMemory";
import { fillLinkTemplate } from "Components/TableLayout/TableLayout";

describe("mapViewMemory", () => {
  beforeEach(() => sessionStorage.clear());

  it("is enabled by the page setting, else the app default", () => {
    expect(isMapViewMemoryEnabled({ rememberMapView: true }, { config: {} })).toBe(true);
    expect(isMapViewMemoryEnabled({ rememberMapView: true }, { config: { rememberMapView: false } })).toBe(false);
    expect(isMapViewMemoryEnabled({}, { config: {} })).toBe(false);
  });

  it("merges camera and filters for a page and keeps pages apart", () => {
    writeMapView("/a", { centre: [-3, 53.4], zoom: 11 });
    writeMapView("/a", { filters: { k: 1 } });
    expect(readMapView("/a")).toEqual({ centre: [-3, 53.4], zoom: 11, filters: { k: 1 } });
    expect(readMapView("/b")).toBeNull();
  });

  it("keys filters by stable fields, not generated ids", () => {
    const f = { id: "uuid-1", paramName: "time_period", filterName: "Time period", type: "dropdown", actions: [{ action: "UPDATE_QUERY_PARAMS" }] };
    expect(filterMemoryKey(f)).toBe(filterMemoryKey({ ...f, id: "uuid-2" }));
  });
});

describe("fillLinkTemplate", () => {
  it("fills and encodes row fields", () => {
    expect(fillLinkTemplate("/sites/{id}/{name}", { id: 7, name: "A b" })).toBe("/sites/7/A%20b");
  });
});
