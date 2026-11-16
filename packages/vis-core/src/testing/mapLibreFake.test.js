import {
  createFakeMap,
  createFeature,
  FakePopup,
  FakeMapConstructor,
  mapLibreModule,
  resetMapLibreFake,
} from "testing/mapLibreFake";

describe("createFakeMap", () => {
  it("dispatches map-wide handlers and layer-scoped handlers only for their layer", () => {
    const map = createFakeMap();
    const anywhere = jest.fn();
    const onZones = jest.fn();
    map.on("click", anywhere);
    map.on("click", "zones", onZones);

    map.fire("click", { point: { x: 1, y: 2 } });
    expect(anywhere).toHaveBeenCalledWith(
      expect.objectContaining({ type: "click", target: map, point: { x: 1, y: 2 } })
    );
    expect(onZones).not.toHaveBeenCalled();

    map.fire("click", {}, { layerId: "zones" });
    expect(onZones).toHaveBeenCalledTimes(1);
  });

  it("removes exactly the handler passed to off, and counts listeners", () => {
    const map = createFakeMap();
    const a = jest.fn();
    const b = jest.fn();
    map.on("mousemove", a);
    map.on("mousemove", b);
    map.on("mouseenter", "zones", a);
    expect(map.listenerCount("mousemove")).toBe(2);

    map.off("mousemove", a);
    map.fire("mousemove");
    expect(a).not.toHaveBeenCalled();
    expect(b).toHaveBeenCalledTimes(1);
    expect(map.listenerCount("mousemove")).toBe(1);
    expect(map.listenerCount("mouseenter", "zones")).toBe(1);
  });

  it("runs once handlers a single time", () => {
    const map = createFakeMap();
    const handler = jest.fn();
    map.once("load", handler);
    map.fire("load");
    map.fire("load");
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("keeps layers and sources, and reports duplicates as MapLibre does", () => {
    const map = createFakeMap({ initialSources: { default: { type: "vector" } } });
    map.addSource("zones", { type: "geojson", data: null });
    map.addLayer({ id: "zones", type: "fill", source: "zones" });
    map.addLayer({ id: "zones-hover", type: "line", source: "zones" });
    map.addLayer({ id: "zones-under", type: "fill", source: "zones" }, "zones");

    expect(map.getStyle().layers.map((l) => l.id)).toEqual(["zones-under", "zones", "zones-hover"]);
    expect(Object.keys(map.getStyle().sources)).toEqual(["default", "zones"]);
    expect(() => map.addSource("zones", {})).toThrow(/already exists/);
    const onError = jest.fn();
    map.on("error", onError);
    map.addLayer({ id: "zones" });
    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.objectContaining({ message: expect.stringMatching(/already exists/) }) })
    );
    expect(map.getStyle().layers.filter((l) => l.id === "zones")).toHaveLength(1);

    map.setPaintProperty("zones", "fill-color", "red");
    map.setLayoutProperty("zones", "visibility", "none");
    expect(map.getLayer("zones").paint["fill-color"]).toBe("red");
    expect(map.getLayoutProperty("zones", "visibility")).toBe("none");

    map.getSource("zones").setData({ type: "FeatureCollection", features: [] });
    expect(map.getSource("zones").data).toEqual({ type: "FeatureCollection", features: [] });

    map.removeLayer("zones-under");
    map.removeSource("zones");
    expect(map.getLayer("zones-under")).toBeUndefined();
    expect(map.getSource("zones")).toBeUndefined();
  });

  it("merges feature state per feature", () => {
    const map = createFakeMap();
    const target = { source: "zones", sourceLayer: "z", id: 7 };
    map.setFeatureState(target, { hover: true });
    map.setFeatureState(target, { selected: true });
    expect(map.getFeatureState(target)).toEqual({ hover: true, selected: true });
    expect(map.getFeatureState({ source: "zones", id: 7 })).toEqual({});
  });

  it("filters rendered features by the requested layers", () => {
    const zone = createFeature({ id: 1, layerId: "zones" });
    const link = createFeature({ id: 2, layerId: "links", type: "line" });
    const map = createFakeMap({ renderedFeatures: [zone, link] });

    expect(map.queryRenderedFeatures([0, 0], { layers: ["links"] })).toEqual([link]);
    expect(map.queryRenderedFeatures([0, 0])).toEqual([zone, link]);

    map.setRenderedFeatures((point) => (point.x > 5 ? [zone] : []));
    expect(map.queryRenderedFeatures({ x: 6, y: 0 })).toEqual([zone]);
    expect(map.queryRenderedFeatures({ x: 1, y: 0 })).toEqual([]);
  });

  it("projects with its own offset so two maps can disagree on screen position", () => {
    const left = createFakeMap();
    const right = createFakeMap({ projectionOffset: { x: 100, y: 0 } });
    expect(left.project({ lng: 1, lat: 2 })).toEqual({ x: 1, y: 2 });
    expect(right.project({ lng: 1, lat: 2 })).toEqual({ x: 101, y: 2 });
    expect(right.unproject({ x: 101, y: 2 })).toEqual({ lng: 1, lat: 2 });
  });

  it("announces camera changes as MapLibre does", () => {
    const map = createFakeMap({ zoom: 5 });
    const events = [];
    ["movestart", "move", "moveend", "zoomstart", "zoom", "zoomend"].forEach((type) =>
      map.on(type, () => events.push(type))
    );

    map.panTo([1, 1]);
    expect(events).toEqual(["movestart", "move", "moveend"]);

    events.length = 0;
    map.setZoom(6);
    expect(events).toEqual(["movestart", "zoomstart", "move", "zoom", "moveend", "zoomend"]);
  });

  it("centres on fitted bounds", () => {
    const map = createFakeMap();
    map.fitBounds([[-2, 53], [0, 55]], { padding: 10 });
    expect(map.getCenter()).toEqual({ lng: -1, lat: 54 });
  });

  it("records errors, logging them when nothing listens", () => {
    const log = jest.spyOn(console, "error").mockImplementation(() => {});
    const map = createFakeMap();
    map.addLayer({ id: "a" });
    map.addLayer({ id: "a" });
    expect(map.errors).toHaveLength(1);
    expect(log).toHaveBeenCalledTimes(1);
  });

  it("tracks the camera through jumpTo and the convenience setters", () => {
    const map = createFakeMap({ zoom: 5, center: [1, 2] });
    map.jumpTo({ center: [3, 4], zoom: 8, bearing: 10, pitch: 20 });
    expect(map.getCenter()).toEqual({ lng: 3, lat: 4 });
    expect(map.getZoom()).toBe(8);
    expect(map.getBearing()).toBe(10);
    expect(map.getPitch()).toBe(20);
    map.setZoom(9);
    map.setCenter({ lng: 5, lat: 6 });
    expect(map.inspect().camera).toEqual({ zoom: 9, center: { lng: 5, lat: 6 }, bearing: 10, pitch: 20 });
  });

  it("tracks interaction handlers being turned on and off", () => {
    const map = createFakeMap();
    map.dragPan.disable();
    map.touchZoomRotate.disableRotation();
    expect(map.dragPan.isEnabled()).toBe(false);
    expect(map.touchZoomRotate.isRotationEnabled()).toBe(false);
    map.dragPan.enable();
    expect(map.dragPan.isEnabled()).toBe(true);
  });

  it("records removal", () => {
    const map = createFakeMap();
    map.remove();
    expect(map.inspect().removed).toBe(true);
  });
});

describe("FakePopup", () => {
  beforeEach(() => FakePopup.reset());

  it("records every popup and which are open", () => {
    const map = createFakeMap();
    const first = new FakePopup({ closeButton: false }).setLngLat({ lng: 1, lat: 2 }).setHTML("<p>a</p>").addTo(map);
    new FakePopup().setHTML("<p>b</p>");
    expect(FakePopup.instances).toHaveLength(2);
    expect(FakePopup.open()).toEqual([first]);
    expect(first.coords).toEqual({ lng: 1, lat: 2 });
    first.remove();
    expect(FakePopup.open()).toEqual([]);
  });
});

describe("resetMapLibreFake", () => {
  it("clears recorded popups and maps", () => {
    new FakePopup();
    new FakeMapConstructor({});
    resetMapLibreFake();
    expect(FakePopup.instances).toEqual([]);
    expect(FakeMapConstructor.instances).toEqual([]);
  });
});

describe("mapLibreModule", () => {
  beforeEach(() => resetMapLibreFake());

  it("builds fake maps through both default and named exports, keeping the options", () => {
    const module = mapLibreModule();
    const map = new module.default.Map({ zoom: 7, center: [1, 1], style: "s" });
    expect(map.getZoom()).toBe(7);
    expect(module.Map).toBe(module.default.Map);
    expect(FakeMapConstructor.instances[0]).toEqual({ map, options: { zoom: 7, center: [1, 1], style: "s" } });
  });
});
