import {
  clearHover,
  createHoverSession,
  CUSTOM_TOOLTIP_DELAY_MS,
  HOVER_POPUP_OFFSET,
  queryHoverFeatures,
  hoverTargets,
  sameTargets,
  showHoverTooltip,
  updateHoverState,
} from "./hoverTooltip";
import { createFakeMap, createFeature, FakePopup } from "testing/mapLibreFake";

jest.mock("maplibre-gl", () => require("testing/mapLibreFake").mapLibreModule());
jest.mock("services", () => ({ api: { baseService: { get: jest.fn() } } }));
import { api } from "services";

const LNG_LAT = { lng: -1.5, lat: 53.8 };
const layers = {
  zones: { visualisationName: "Vis" },
  custom: { customTooltip: { url: "/api/zones/{id}", htmlTemplate: "<p>Total {total}</p>" } },
};

const feature = (id, layerId = "zones", value = id * 10) =>
  createFeature({ id, layerId, properties: { name: `Zone ${id}` }, state: { value } });

const hoverState = (map, id, layerId = "zones") =>
  map.getFeatureState({ source: layerId, id }).hover;

/** Lets queued promise callbacks (the fetch chain and Promise.all) run. */
const flushPromises = async () => {
  for (let i = 0; i < 10; i += 1) await Promise.resolve();
};

let map;
let session;
const show = (features, lngLat = LNG_LAT) =>
  showHoverTooltip({ map, session, features, lngLat, layers, visualisations: {} });

beforeEach(() => {
  FakePopup.reset();
  map = createFakeMap();
  session = createHoverSession();
});

describe("hover targets", () => {
  it("compares targets by layer and feature id, in order", () => {
    const a = hoverTargets([feature(1), feature(2)]);
    expect(sameTargets(a, hoverTargets([feature(1), feature(2)]))).toBe(true);
    expect(sameTargets(a, hoverTargets([feature(2), feature(1)]))).toBe(false);
    expect(sameTargets(a, hoverTargets([feature(1)]))).toBe(false);
  });

  it("moves the hover state, only touching features that change", () => {
    updateHoverState(map, [], hoverTargets([feature(1), feature(2)]));
    map.setFeatureState.mockClear();

    updateHoverState(map, hoverTargets([feature(1), feature(2)]), hoverTargets([feature(2), feature(3)]));

    expect(hoverState(map, 1)).toBe(false);
    expect(hoverState(map, 2)).toBe(true);
    expect(hoverState(map, 3)).toBe(true);
    expect(map.setFeatureState).toHaveBeenCalledTimes(2);
  });
});

describe("showHoverTooltip", () => {
  it("opens a tooltip for the top-most feature and marks it hovered", () => {
    show([feature(1), feature(2)]);

    const [popup] = FakePopup.open();
    expect(popup.map).toBe(map);
    expect(popup.lngLat).toEqual(LNG_LAT);
    expect(popup.html).toContain("Zone 1");
    expect(popup.html).not.toContain("Zone 2");
    expect(popup.options).toMatchObject({ closeButton: false, closeOnClick: false });
    expect(hoverState(map, 1)).toBe(true);
    expect(hoverState(map, 2)).toBeUndefined();
  });

  it("only moves the popup while the pointer stays on the same feature", () => {
    show([feature(1)]);
    show([feature(1)], { lng: 0, lat: 0 });

    expect(FakePopup.instances).toHaveLength(1);
    expect(FakePopup.open()[0].lngLat).toEqual({ lng: 0, lat: 0 });
  });

  it("replaces the popup and hover state when the pointer moves to another feature", () => {
    show([feature(1)]);
    show([feature(2)]);

    expect(FakePopup.open()).toHaveLength(1);
    expect(FakePopup.open()[0].html).toContain("Zone 2");
    expect(hoverState(map, 1)).toBe(false);
    expect(hoverState(map, 2)).toBe(true);
  });

  it("clears everything when no feature should have a tooltip", () => {
    show([feature(1)]);
    show([feature(9, "unconfigured")]);

    expect(FakePopup.open()).toEqual([]);
    expect(hoverState(map, 1)).toBe(false);
    expect(session.hovered).toEqual([]);
  });

  describe("custom tooltips", () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    it("fetches after a short delay and fills in the popup", async () => {
      api.baseService.get.mockResolvedValue({ total: 42 });
      show([feature(1, "custom")]);
      expect(api.baseService.get).not.toHaveBeenCalled();

      jest.advanceTimersByTime(CUSTOM_TOOLTIP_DELAY_MS);
      await flushPromises();

      expect(api.baseService.get).toHaveBeenCalledTimes(1);
      expect(FakePopup.open()[0].html).toContain("Total 42");
    });

    it("doesn't fetch if the pointer leaves before the delay", () => {
      show([feature(1, "custom")]);
      clearHover(map, session);
      jest.advanceTimersByTime(CUSTOM_TOOLTIP_DELAY_MS * 2);
      expect(api.baseService.get).not.toHaveBeenCalled();
    });

    it("drops a response that arrives after the pointer moved on", async () => {
      let resolve;
      api.baseService.get.mockReturnValue(new Promise((r) => (resolve = r)));
      show([feature(1, "custom")]);
      jest.advanceTimersByTime(CUSTOM_TOOLTIP_DELAY_MS);

      show([feature(2)]);
      resolve({ total: 42 });
      await flushPromises();

      expect(FakePopup.open()).toHaveLength(1);
      expect(FakePopup.open()[0].html).toContain("Zone 2");
      expect(FakePopup.open()[0].html).not.toContain("Total 42");
    });
  });
});

describe("features without an id", () => {
  it("get a tooltip but no hover state", () => {
    const noId = { ...feature(1), id: undefined };
    show([noId]);

    expect(FakePopup.open()[0].html).toContain("Zone 1");
    expect(map.setFeatureState).not.toHaveBeenCalled();

    clearHover(map, session);
    expect(map.setFeatureState).not.toHaveBeenCalled();
    expect(FakePopup.open()).toEqual([]);
  });
});

describe("aborting custom tooltip fetches", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  const signalOfLastFetch = () => api.baseService.get.mock.calls.at(-1)[1].signal;

  it("aborts an in-flight fetch when the pointer moves to another feature", () => {
    api.baseService.get.mockReturnValue(new Promise(() => {}));
    show([feature(1, "custom")]);
    jest.advanceTimersByTime(CUSTOM_TOOLTIP_DELAY_MS);
    const signal = signalOfLastFetch();

    show([feature(2)]);

    expect(signal.aborted).toBe(true);
  });

  it("aborts an in-flight fetch when the hover is cleared", () => {
    api.baseService.get.mockReturnValue(new Promise(() => {}));
    show([feature(1, "custom")]);
    jest.advanceTimersByTime(CUSTOM_TOOLTIP_DELAY_MS);
    const signal = signalOfLastFetch();

    clearHover(map, session);

    expect(signal.aborted).toBe(true);
  });
});

describe("separate sessions", () => {
  it("fill in both maps' custom tooltips when both move to new features at once", async () => {
    jest.useFakeTimers();
    try {
      const other = createFakeMap();
      const otherSession = createHoverSession();
      api.baseService.get.mockResolvedValue({ total: 7 });

      show([feature(1, "custom")]);
      showHoverTooltip({
        map: other,
        session: otherSession,
        features: [feature(2, "custom")],
        lngLat: LNG_LAT,
        layers,
        visualisations: {},
      });
      jest.advanceTimersByTime(CUSTOM_TOOLTIP_DELAY_MS);
      await flushPromises();

      const popups = FakePopup.open();
      expect(popups).toHaveLength(2);
      popups.forEach((popup) => expect(popup.html).toContain("Total 7"));
    } finally {
      jest.useRealTimers();
    }
  });

  it("keep two maps' tooltips independent", () => {
    const other = createFakeMap();
    const otherSession = createHoverSession();
    show([feature(1)]);
    showHoverTooltip({ map: other, session: otherSession, features: [feature(2)], lngLat: LNG_LAT, layers, visualisations: {} });

    clearHover(map, session);

    expect(FakePopup.open()).toHaveLength(1);
    expect(FakePopup.open()[0].map).toBe(other);
    expect(hoverState(other, 2)).toBe(true);
  });
});

describe("hover-style integration", () => {
  it("offsets the tooltip from the cursor", () => {
    show([feature(1)]);
    expect(FakePopup.open()[0].options.offset).toBe(HOVER_POPUP_OFFSET);
  });

  it("syncs a layer's hover highlight before marking a newly hovered feature", () => {
    const hoverStyle = require("../hoverStyle");
    const sync = jest.spyOn(hoverStyle, "syncHoverLayers");
    show([feature(1)]);
    show([feature(1)]);
    expect(sync).toHaveBeenCalledTimes(1);
    expect(sync).toHaveBeenCalledWith(map, "zones");
  });
});

describe("queryHoverFeatures", () => {
  const link = (id) => createFeature({ id, layerId: "links", type: "line" });
  const a = link(1);
  const b = link(2);
  let linesMap;

  beforeEach(() => {
    // A point query finds only B (under the pointer); any box finds A first, then B.
    linesMap = createFakeMap({
      renderedFeatures: (geometry) => (typeof geometry[0] === "number" ? [b] : [a, b]),
    });
    linesMap.addLayer({ id: "links", type: "line", source: "links" });
  });

  it("prefers the feature under the pointer over a neighbour within tolerance", () => {
    const features = queryHoverFeatures(linesMap, session, { x: 5, y: 5 }, ["links"], 6, () => true);
    expect(features).toEqual([b]);
  });

  it("keeps the feature already hovered while the pointer stays close to it", () => {
    session.hovered = hoverTargets([a]);
    const features = queryHoverFeatures(linesMap, session, { x: 5, y: 5 }, ["links"], 6, () => true);
    expect(features).toEqual([a]);
  });
});
