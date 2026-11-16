/**
 * In-memory stand-in for MapLibre GL, shared by the map tests.
 *
 * Unlike a bag of `jest.fn()` stubs, a fake map keeps real state: layers,
 * sources, feature state and camera, and it dispatches events to the handlers
 * registered with `on`, including layer-scoped ones. Tests can then assert on
 * what a component did to the map ("the right map has the selected feature")
 * rather than how it called it.
 *
 * Every method is a `jest.fn` wrapping the fake behaviour, so call assertions
 * still work. Spies are created inside `createFakeMap`, never at module load,
 * because the jest config sets `resetMocks: true`, which would strip
 * module-level implementations before each test.
 *
 * Known gaps, none relied on by current tests:
 * - layer-scoped handlers fire whenever `fire` names their layer; the payload has no
 *   `features`, and array layer ids (`on(type, [ids], fn)`) aren't supported;
 * - `once(type)` without a handler doesn't return a Promise;
 * - `removeSource` doesn't refuse a source still used by layers, and `setFeatureState`
 *   doesn't check the source exists or that vector sources are given a `sourceLayer`.
 *
 * Usage in a test file:
 *
 *   jest.mock("maplibre-gl", () => require("testing/mapLibreFake").mapLibreModule());
 *   import { createFakeMap, FakePopup } from "testing/mapLibreFake";
 */

const featureStateKey = ({ source, sourceLayer, id }) =>
  `${source}|${sourceLayer ?? ""}|${id}`;

/**
 * Creates a fake map.
 *
 * @param {Object} [options]
 * @param {string} [options.name] - Label for debugging and assertions (e.g. "left").
 * @param {number} [options.zoom=10]
 * @param {[number, number]} [options.center=[0, 0]]
 * @param {{ x: number, y: number }} [options.projectionOffset={ x: 0, y: 0 }] - Added by
 *   `project` (and removed by `unproject`), so two maps can place the same lng/lat at
 *   different screen points, as synced maps of different sizes do.
 * @param {Array|Function} [options.renderedFeatures=[]] - Features returned by
 *   `queryRenderedFeatures`. An array is filtered by `options.layers`; a function receives
 *   `(geometry, options)` and returns the features.
 * @param {Array|Function} [options.sourceFeatures=[]] - Features returned by
 *   `querySourceFeatures`, as an array or `(sourceId, options) => features`.
 * @param {Object<string, Object>} [options.initialSources={}] - Sources already in the style
 *   (e.g. the base map), keyed by id.
 * @param {Array<Object>} [options.initialLayers=[]] - Layers already in the style.
 * @returns {Object} The fake map.
 */
export function createFakeMap(options = {}) {
  const {
    name = "map",
    zoom: initialZoom = 10,
    center: initialCenter = [0, 0],
    projectionOffset = { x: 0, y: 0 },
    renderedFeatures = [],
    sourceFeatures = [],
    initialSources = {},
    initialLayers = [],
  } = options;

  const handlers = [];
  const layers = initialLayers.map((layer) => ({ ...layer }));
  const sources = {};
  const featureStates = new Map();
  const controls = [];
  const camera = {
    zoom: initialZoom,
    center: { lng: initialCenter[0], lat: initialCenter[1] },
    bearing: 0,
    pitch: 0,
  };
  let rendered = renderedFeatures;
  let sourceFeatureResult = sourceFeatures;
  let removed = false;

  const canvas = document.createElement("canvas");
  const container = document.createElement("div");
  container.appendChild(canvas);

  const makeSource = (id, spec) => {
    const source = { id, ...spec };
    source.setData = jest.fn((data) => {
      source.data = data;
    });
    source.setTiles = jest.fn((tiles) => {
      source.tiles = tiles;
    });
    return source;
  };
  Object.entries(initialSources).forEach(([id, spec]) => {
    sources[id] = makeSource(id, spec);
  });

  const toggle = () => {
    let enabled = true;
    return {
      enable: jest.fn(() => {
        enabled = true;
      }),
      disable: jest.fn(() => {
        enabled = false;
      }),
      isEnabled: () => enabled,
    };
  };
  const touchZoomRotate = toggle();
  let rotationEnabled = true;
  touchZoomRotate.disableRotation = jest.fn(() => {
    rotationEnabled = false;
  });
  touchZoomRotate.enableRotation = jest.fn(() => {
    rotationEnabled = true;
  });
  touchZoomRotate.isRotationEnabled = () => rotationEnabled;

  const map = {
    name,
    dragPan: toggle(),
    scrollZoom: toggle(),
    doubleClickZoom: toggle(),
    boxZoom: toggle(),
    keyboard: toggle(),
    touchZoomRotate,
  };

  // --- events ---------------------------------------------------------------

  const register = (type, layerOrHandler, maybeHandler, once) => {
    const layerId = typeof layerOrHandler === "function" ? null : layerOrHandler;
    const handler = typeof layerOrHandler === "function" ? layerOrHandler : maybeHandler;
    handlers.push({ type, layerId, handler, once });
    return map;
  };
  map.on = jest.fn((type, a, b) => register(type, a, b, false));
  map.once = jest.fn((type, a, b) => register(type, a, b, true));
  map.off = jest.fn((type, a, b) => {
    const layerId = typeof a === "function" ? null : a;
    const handler = typeof a === "function" ? a : b;
    const index = handlers.findIndex(
      (h) => h.type === type && h.layerId === layerId && h.handler === handler
    );
    if (index !== -1) handlers.splice(index, 1);
    return map;
  });

  /**
   * Dispatches an event to the registered handlers.
   *
   * Map-wide handlers always run. Layer-scoped handlers run only when `options.layerId`
   * names their layer, which is how a test says "the pointer is over this layer".
   *
   * @param {string} type - Event type, e.g. "mousemove".
   * @param {Object} [event={}] - Event payload; `target` and `type` are filled in.
   * @param {Object} [fireOptions]
   * @param {string} [fireOptions.layerId]
   */
  map.fire = (type, event = {}, fireOptions = {}) => {
    const payload = { type, target: map, ...event };
    [...handlers]
      .filter(
        (h) =>
          h.type === type && (h.layerId === null || h.layerId === fireOptions.layerId)
      )
      .forEach((h) => {
        if (h.once) {
          const i = handlers.indexOf(h);
          if (i !== -1) handlers.splice(i, 1);
        }
        h.handler(payload);
      });
    return map;
  };

  /** Number of handlers registered for an event type (optionally for one layer). */
  map.listenerCount = (type, layerId) =>
    handlers.filter(
      (h) => h.type === type && (layerId === undefined || h.layerId === layerId)
    ).length;

  // --- errors ----------------------------------------------------------------

  /** Errors the map reported, in order, whether or not anything listened. */
  map.errors = [];

  /** As MapLibre does: fire "error", or log it when nothing listens. */
  const reportError = (error) => {
    map.errors.push(error);
    if (map.listenerCount("error") > 0) map.fire("error", { error });
    else console.error(error);
  };

  // --- style: layers and sources -------------------------------------------

  // As in MapLibre, a duplicate layer id is reported through an "error" event rather than
  // thrown (a duplicate source id, below, does throw).
  map.addLayer = jest.fn((layer, beforeId) => {
    if (layers.some((l) => l.id === layer.id)) {
      reportError(new Error(`Layer with id "${layer.id}" already exists on this map`));
      return map;
    }
    const index = beforeId ? layers.findIndex((l) => l.id === beforeId) : -1;
    if (index === -1) layers.push({ ...layer });
    else layers.splice(index, 0, { ...layer });
    return map;
  });
  map.getLayer = jest.fn((id) => layers.find((l) => l.id === id));
  map.removeLayer = jest.fn((id) => {
    const index = layers.findIndex((l) => l.id === id);
    if (index !== -1) layers.splice(index, 1);
    return map;
  });
  map.moveLayer = jest.fn((id, beforeId) => {
    const index = layers.findIndex((l) => l.id === id);
    if (index === -1) return map;
    const [layer] = layers.splice(index, 1);
    const target = beforeId ? layers.findIndex((l) => l.id === beforeId) : -1;
    if (target === -1) layers.push(layer);
    else layers.splice(target, 0, layer);
    return map;
  });
  map.setLayoutProperty = jest.fn((id, property, value) => {
    const layer = layers.find((l) => l.id === id);
    if (layer) layer.layout = { ...layer.layout, [property]: value };
    return map;
  });
  map.getLayoutProperty = jest.fn((id, property) => {
    return layers.find((l) => l.id === id)?.layout?.[property];
  });
  map.setPaintProperty = jest.fn((id, property, value) => {
    const layer = layers.find((l) => l.id === id);
    if (layer) layer.paint = { ...layer.paint, [property]: value };
    return map;
  });
  map.getPaintProperty = jest.fn((id, property) => {
    return layers.find((l) => l.id === id)?.paint?.[property];
  });
  map.setFilter = jest.fn((id, filter) => {
    const layer = layers.find((l) => l.id === id);
    if (layer) layer.filter = filter;
    return map;
  });
  map.getFilter = jest.fn((id) => layers.find((l) => l.id === id)?.filter);

  map.addSource = jest.fn((id, spec) => {
    if (sources[id]) {
      throw new Error(`Source "${id}" already exists on this map`);
    }
    sources[id] = makeSource(id, spec);
    return map;
  });
  map.getSource = jest.fn((id) => sources[id]);
  map.removeSource = jest.fn((id) => {
    delete sources[id];
    return map;
  });

  map.getStyle = jest.fn(() => ({
    version: 8,
    layers: layers.map((l) => ({ ...l })),
    sources: Object.fromEntries(Object.entries(sources).map(([id, s]) => [id, { ...s }])),
  }));
  map.setStyle = jest.fn();
  map.isStyleLoaded = jest.fn(() => true);
  map.loaded = jest.fn(() => true);

  // --- feature state ---------------------------------------------------------

  map.setFeatureState = jest.fn((target, state) => {
    const key = featureStateKey(target);
    featureStates.set(key, { ...(featureStates.get(key) ?? {}), ...state });
  });
  map.getFeatureState = jest.fn((target) => ({
    ...(featureStates.get(featureStateKey(target)) ?? {}),
  }));
  map.removeFeatureState = jest.fn((target) => {
    featureStates.delete(featureStateKey(target));
  });

  // --- queries -----------------------------------------------------------------

  map.queryRenderedFeatures = jest.fn((geometry, queryOptions = {}) => {
    if (typeof rendered === "function") return rendered(geometry, queryOptions);
    const wanted = queryOptions.layers;
    return wanted ? rendered.filter((f) => wanted.includes(f.layer?.id)) : [...rendered];
  });
  map.querySourceFeatures = jest.fn((sourceId, queryOptions) =>
    typeof sourceFeatureResult === "function"
      ? sourceFeatureResult(sourceId, queryOptions)
      : [...sourceFeatureResult]
  );
  /** Replaces what `queryRenderedFeatures` returns. */
  map.setRenderedFeatures = (next) => {
    rendered = next;
  };
  /** Replaces what `querySourceFeatures` returns. */
  map.setSourceFeatures = (next) => {
    sourceFeatureResult = next;
  };

  // --- camera ------------------------------------------------------------------

  const toLngLat = (value) =>
    Array.isArray(value) ? { lng: value[0], lat: value[1] } : { lng: value.lng, lat: value.lat };

  // As in MapLibre, every camera change is applied at once and announced with
  // movestart/move/moveend (and zoomstart/zoom/zoomend when the zoom changes), so code
  // that follows the camera, such as syncMaps, is exercised for real.
  map.jumpTo = jest.fn((view = {}) => {
    const zoomChanged = view.zoom != null && view.zoom !== camera.zoom;
    if (view.center) camera.center = toLngLat(view.center);
    if (view.zoom != null) camera.zoom = view.zoom;
    if (view.bearing != null) camera.bearing = view.bearing;
    if (view.pitch != null) camera.pitch = view.pitch;
    map.fire("movestart");
    if (zoomChanged) map.fire("zoomstart");
    map.fire("move");
    if (zoomChanged) map.fire("zoom");
    map.fire("moveend");
    if (zoomChanged) map.fire("zoomend");
    return map;
  });
  map.getZoom = jest.fn(() => camera.zoom);
  map.setZoom = jest.fn((zoom) => map.jumpTo({ zoom }));
  map.getCenter = jest.fn(() => ({ ...camera.center }));
  map.setCenter = jest.fn((center) => map.jumpTo({ center }));
  map.getBearing = jest.fn(() => camera.bearing);
  map.getPitch = jest.fn(() => camera.pitch);
  // Animated moves finish at once.
  map.flyTo = jest.fn((view) => map.jumpTo(view));
  map.easeTo = jest.fn((view) => map.jumpTo(view));
  map.panTo = jest.fn((center) => map.jumpTo({ center }));
  /** Centres on the bounds; the zoom is left alone, as the fake has no viewport size. */
  map.fitBounds = jest.fn((bounds) => {
    const [[west, south], [east, north]] = bounds;
    return map.jumpTo({ center: [(west + east) / 2, (south + north) / 2] });
  });
  map.getBounds = jest.fn(() => ({
    getWest: () => camera.center.lng - 1,
    getSouth: () => camera.center.lat - 1,
    getEast: () => camera.center.lng + 1,
    getNorth: () => camera.center.lat + 1,
  }));
  map.project = jest.fn((lngLat) => {
    const { lng, lat } = toLngLat(lngLat);
    return { x: lng + projectionOffset.x, y: lat + projectionOffset.y };
  });
  map.unproject = jest.fn((point) => {
    const x = Array.isArray(point) ? point[0] : point.x;
    const y = Array.isArray(point) ? point[1] : point.y;
    return { lng: x - projectionOffset.x, lat: y - projectionOffset.y };
  });

  // --- DOM, controls, lifecycle -------------------------------------------------

  map.getCanvas = jest.fn(() => canvas);
  map.getContainer = jest.fn(() => container);
  map.addControl = jest.fn((control, position) => {
    controls.push({ control, position });
    return map;
  });
  map.removeControl = jest.fn((control) => {
    const index = controls.findIndex((c) => c.control === control);
    if (index !== -1) controls.splice(index, 1);
    return map;
  });
  map.hasControl = jest.fn((control) => controls.some((c) => c.control === control));
  map.resize = jest.fn(() => map);
  map.triggerRepaint = jest.fn();
  map.remove = jest.fn(() => {
    removed = true;
  });

  /** Test-only view of internal state. */
  map.inspect = () => ({
    layers: layers.map((l) => ({ ...l })),
    sources: { ...sources },
    featureStates: Object.fromEntries(featureStates),
    controls: [...controls],
    camera: { ...camera, center: { ...camera.center } },
    removed,
  });

  return map;
}

/**
 * Creates a rendered feature as `queryRenderedFeatures` returns it.
 *
 * @param {Object} spec
 * @param {string|number} spec.id
 * @param {string} spec.layerId
 * @param {string} [spec.source] - Defaults to the layer id.
 * @param {string} [spec.sourceLayer]
 * @param {string} [spec.type="fill"] - Layer type.
 * @param {Object} [spec.properties={}]
 * @param {Object} [spec.state={}] - Feature state (e.g. `{ value: 12 }`).
 * @param {Object} [spec.geometry]
 * @returns {Object}
 */
export function createFeature({
  id,
  layerId,
  source = layerId,
  sourceLayer,
  type = "fill",
  properties = {},
  state = {},
  geometry = { type: "Point", coordinates: [0, 0] },
}) {
  const feature = {
    id,
    type: "Feature",
    properties: { id, ...properties },
    state,
    geometry,
    layer: { id: layerId, type, source, ...(sourceLayer ? { "source-layer": sourceLayer } : {}) },
    source,
    sourceLayer,
  };
  feature.toJSON = () => ({
    type: "Feature",
    id,
    properties: feature.properties,
    geometry,
  });
  return feature;
}

/**
 * Fake popup. Every instance is recorded in `FakePopup.instances` so tests can find
 * the popups a component opened; call `FakePopup.reset()` in `beforeEach`.
 */
export class FakePopup {
  static instances = [];

  static reset() {
    FakePopup.instances = [];
  }

  /** Popups that were added to a map and not removed since. */
  static open() {
    return FakePopup.instances.filter((p) => p.map && !p.removed);
  }

  constructor(options = {}) {
    this.options = options;
    this.html = undefined;
    this.lngLat = undefined;
    this.map = null;
    this.removed = false;
    FakePopup.instances.push(this);
  }

  setLngLat(lngLat) {
    this.lngLat = lngLat;
    // Kept for older assertions that read `coords`.
    this.coords = lngLat;
    return this;
  }

  setHTML(html) {
    this.html = html;
    return this;
  }

  addTo(map) {
    this.map = map;
    this.removed = false;
    return this;
  }

  remove() {
    this.removed = true;
    return this;
  }

  isOpen() {
    return Boolean(this.map) && !this.removed;
  }
}

class FakeControl {
  constructor(options = {}) {
    this.options = options;
    this._container = document.createElement("div");
  }

  onAdd() {
    return this._container;
  }

  onRemove() {}
}

/** Fake `NavigationControl`. */
export class FakeNavigationControl extends FakeControl {}

/** Fake `AttributionControl`; its container holds the inner element `useMap` reads. */
export class FakeAttributionControl extends FakeControl {
  constructor(options) {
    super(options);
    const inner = document.createElement("div");
    inner.className = "maplibregl-ctrl-attrib-inner";
    inner.innerHTML = options?.customAttribution ?? "";
    this._container.appendChild(inner);
  }
}

class FakeLngLatBounds {
  constructor() {
    this.points = [];
  }

  extend(point) {
    this.points.push(point);
    return this;
  }

  getNorthEast() {
    return { lng: 1, lat: 1 };
  }

  getSouthWest() {
    return { lng: -1, lat: -1 };
  }
}

/**
 * Every map built through the mocked `maplibregl.Map` constructor, with the options it was
 * given, so hook tests can reach the instances (`FakeMapConstructor.instances[0].map`).
 */
export class FakeMapConstructor {
  static instances = [];

  static reset() {
    FakeMapConstructor.instances = [];
  }

  constructor(options = {}) {
    const map = createFakeMap({
      name: `map-${FakeMapConstructor.instances.length}`,
      zoom: options.zoom,
      center: options.center,
    });
    map.constructorOptions = options;
    FakeMapConstructor.instances.push({ map, options });
    // Returning an object from a constructor makes `new` yield that object.
    return map;
  }
}

/**
 * Clears the fake's static records (popups and constructed maps). Call it in `beforeEach`:
 * `resetMocks` in the jest config doesn't touch them.
 */
export function resetMapLibreFake() {
  FakePopup.reset();
  FakeMapConstructor.reset();
}

/**
 * Module shape for `jest.mock("maplibre-gl", () => require("testing/mapLibreFake").mapLibreModule())`.
 * Covers both `import maplibregl from` and named imports.
 */
export function mapLibreModule() {
  const api = {
    Map: FakeMapConstructor,
    Popup: FakePopup,
    NavigationControl: FakeNavigationControl,
    AttributionControl: FakeAttributionControl,
    LngLatBounds: FakeLngLatBounds,
  };
  return { __esModule: true, default: api, ...api };
}
