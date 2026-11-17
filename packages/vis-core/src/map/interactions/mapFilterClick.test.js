import { applyMapFilterClick } from "./mapFilterClick";
import { createMapGroup } from "../mapGroup";
import { createFakeMap, createFeature } from "testing/mapLibreFake";

const LNG_LAT = { lng: -1.5, lat: 53.8 };
const POINT = { x: 10, y: 20 };

const zone = (id, layerId = "zones") =>
  createFeature({ id, layerId, source: layerId, sourceLayer: "z", properties: { zoneId: id * 100 } });

/** A map with the given layers, rendering `features` under any point. */
const mapWith = (name, features, layerIds = ["zones"]) => {
  const map = createFakeMap({ name, renderedFeatures: features, initialSources: { zones: {}, links: {} } });
  layerIds.forEach((id) => map.addLayer({ id, type: "fill", source: id }));
  return map;
};

const zoneFilter = (extra = {}) => ({
  id: "zone",
  type: "map",
  layer: "zones",
  field: "zoneId",
  actions: [{ action: "UPDATE_QUERY_PARAMS" }],
  ...extra,
});

let dispatch;
let filterDispatch;
let selections;
beforeEach(() => {
  dispatch = jest.fn();
  filterDispatch = jest.fn();
  selections = createMapGroup();
});

const click = (groupMaps, filters, sourcePaneId = Object.keys(groupMaps)[0]) =>
  applyMapFilterClick({
    sourcePaneId,
    point: POINT,
    lngLat: LNG_LAT,
    groupMaps,
    filters,
    selections,
    dispatch,
    filterDispatch,
  });

const queryDispatches = () =>
  dispatch.mock.calls.map(([action]) => [action.payload.panes, action.payload.value]);

describe("applyMapFilterClick on a single map", () => {
  it("selects the clicked feature and sets the filter to its value", () => {
    const map = mapWith("main", [zone(7)]);
    expect(click({ main: map }, [zoneFilter()])).toBe(true);

    expect(map.getFeatureState({ source: "zones", sourceLayer: "z", id: 7 })).toEqual({ selected: true });
    expect(dispatch).toHaveBeenCalledWith({
      type: "UPDATE_QUERY_PARAMS",
      payload: { filter: zoneFilter(), value: 700, panes: ["main"] },
    });
    expect(filterDispatch).toHaveBeenCalledWith({
      type: "SET_FILTER_VALUE",
      payload: { filterId: "zone", value: 700 },
    });
  });

  it("keeps the action's own payload, including a target of its own", () => {
    const map = mapWith("main", [zone(7)]);
    const filter = zoneFilter({ actions: [{ action: "UPDATE_PARAMETERISED_LAYER", payload: { targetLayer: "links" } }] });
    click({ main: map }, [filter]);
    expect(dispatch.mock.calls[0][0].payload).toMatchObject({ targetLayer: "links", value: 700 });
  });

  it("moves the selection on the next click", () => {
    const map = mapWith("main", [zone(7)]);
    click({ main: map }, [zoneFilter()]);
    map.setRenderedFeatures([zone(8)]);
    click({ main: map }, [zoneFilter()]);
    expect(map.getFeatureState({ source: "zones", sourceLayer: "z", id: 7 })).toEqual({ selected: false });
    expect(map.getFeatureState({ source: "zones", sourceLayer: "z", id: 8 })).toEqual({ selected: true });
  });

  it("changes nothing on a click with no feature, keeping the selection", () => {
    const map = mapWith("main", [zone(7)]);
    click({ main: map }, [zoneFilter()]);
    dispatch.mockClear();
    map.setRenderedFeatures([]);

    expect(click({ main: map }, [zoneFilter()])).toBe(false);
    expect(dispatch).not.toHaveBeenCalled();
    expect(map.getFeatureState({ source: "zones", sourceLayer: "z", id: 7 })).toEqual({ selected: true });
  });

  it("lets the top-most feature decide between filters on different layers", () => {
    const link = createFeature({ id: 3, layerId: "links", source: "links", properties: { linkId: 30 } });
    const map = mapWith("main", (geometry, { layers }) =>
      [link, zone(7)].filter((f) => layers.includes(f.layer.id)), ["zones", "links"]);
    const linkFilter = { id: "link", type: "map", layer: "links", field: "linkId", actions: [{ action: "A" }] };

    click({ main: map }, [zoneFilter(), linkFilter]);

    expect(filterDispatch.mock.calls.map(([a]) => a.payload.filterId)).toEqual(["link"]);
  });

  it("applies only the first of several filters on the clicked layer", () => {
    const map = mapWith("main", [zone(7)]);
    const second = zoneFilter({ id: "zone-again" });
    click({ main: map }, [zoneFilter(), second]);
    expect(filterDispatch.mock.calls.map(([a]) => a.payload.filterId)).toEqual(["zone"]);
  });

  it("ignores filters whose layer isn't on the map", () => {
    const map = mapWith("main", [zone(7)], []);
    expect(click({ main: map }, [zoneFilter()])).toBe(false);
  });

  it("does nothing without map filters", () => {
    expect(click({ main: mapWith("main", [zone(7)]) }, [{ type: "dropdown" }])).toBe(false);
  });
});

describe("applyMapFilterClick across panes", () => {
  const panes = (left, right) => ({
    left: mapWith("left", left),
    right: mapWith("right", right),
  });

  it("gives each targeted pane the feature under the click on its own map", () => {
    const maps = panes([zone(1)], [zone(2)]);
    click(maps, [zoneFilter({ panes: ["left", "right"] })], "left");

    expect(queryDispatches()).toEqual([
      [["left"], 100],
      [["right"], 200],
    ]);
    expect(maps.right.project).toHaveBeenCalledWith(LNG_LAT);
  });

  it("clears a targeted pane with no feature there, and shows the other pane's value", () => {
    const maps = panes([], [zone(2)]);
    click(maps, [zoneFilter({ panes: ["left", "right"] })], "left");

    expect(queryDispatches()).toEqual([
      [["left"], null],
      [["right"], 200],
    ]);
    expect(filterDispatch).toHaveBeenCalledWith({
      type: "SET_FILTER_VALUE",
      payload: { filterId: "zone", value: 200 },
    });
  });

  it("only changes the panes the filter targets", () => {
    const maps = panes([zone(1)], [zone(2)]);
    click(maps, [zoneFilter({ panes: ["left"] })], "right");
    expect(queryDispatches()).toEqual([[["left"], 100]]);
  });

  it("ignores a click with no feature on any targeted pane", () => {
    const maps = panes([], []);
    expect(click(maps, [zoneFilter({ panes: ["left", "right"] })], "left")).toBe(false);
    expect(dispatch).not.toHaveBeenCalled();
    expect(filterDispatch).not.toHaveBeenCalled();
  });

  it("applies a Left and a Right filter on the same layer, each to its own pane", () => {
    const maps = panes([zone(1)], [zone(2)]);
    const left = zoneFilter({ id: "left-zone", panes: ["left"] });
    const right = zoneFilter({ id: "right-zone", panes: ["right"] });
    click(maps, [left, right], "left");

    expect(queryDispatches()).toEqual([
      [["left"], 100],
      [["right"], 200],
    ]);
    expect(filterDispatch.mock.calls.map(([a]) => [a.payload.filterId, a.payload.value])).toEqual([
      ["left-zone", 100],
      ["right-zone", 200],
    ]);
  });

  it("applies only the first filter on a layer to each pane", () => {
    const maps = panes([zone(1)], [zone(2)]);
    click(maps, [zoneFilter({ panes: ["left", "right"] }), zoneFilter({ id: "again", panes: ["right"] })], "left");
    expect(filterDispatch.mock.calls.map(([a]) => a.payload.filterId)).toEqual(["zone"]);
  });

  it("keeps each pane's selection separately", () => {
    const maps = panes([zone(1)], [zone(2)]);
    click(maps, [zoneFilter({ panes: ["left", "right"] })], "left");
    expect(selections.selection("left")).toEqual({ source: "zones", sourceLayer: "z", id: 1 });
    expect(selections.selection("right")).toEqual({ source: "zones", sourceLayer: "z", id: 2 });
  });
});
