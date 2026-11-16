import {
  bufferedBox,
  buildTooltip,
  fetchCustomTooltip,
  hoverableLayerIds,
  hoverBufferSize,
  HOVER_BUFFER_FLOOR,
  layerClickHtml,
  mergeTooltip,
  metadataHtml,
  resolveBaseLayerId,
  spiderOverlayLayerIds,
  tooltipFeatures,
  TOOLTIP_DIVIDER,
  uniqueById,
} from "./tooltipContent";
import { createFakeMap, createFeature } from "testing/mapLibreFake";

jest.mock("services", () => ({ api: { baseService: { get: jest.fn() } } }));
import { api } from "services";

const zone = (overrides = {}) =>
  createFeature({ id: 7, layerId: "zones", properties: { name: "Leeds" }, state: { value: 12 }, ...overrides });

describe("resolveBaseLayerId", () => {
  it.each([
    ["stations-spider", "stations"],
    ["stations-spider-links", "stations"],
    ["stations", "stations"],
  ])("%s → %s", (id, expected) => {
    expect(resolveBaseLayerId(id)).toBe(expected);
  });
});

describe("spiderOverlayLayerIds", () => {
  it("lists the spider layers present on the map for the page's layers", () => {
    const map = createFakeMap();
    map.addLayer({ id: "stations-spider" });
    map.addLayer({ id: "stations-spider-links" });
    map.addLayer({ id: "zones" });
    expect(spiderOverlayLayerIds(map, { stations: {}, zones: {} })).toEqual([
      "stations-spider",
      "stations-spider-links",
    ]);
  });
});

describe("hoverableLayerIds", () => {
  // Built per test: the jest config resets mock implementations before each one.
  let map;
  beforeEach(() => {
    map = createFakeMap();
    map.addLayer({ id: "hover" });
    map.addLayer({ id: "click" });
  });
  const layers = {
    hover: { shouldHaveTooltipOnHover: true },
    click: { shouldHaveTooltipOnClick: true },
    absent: { shouldHaveTooltipOnHover: true },
  };

  it("lists hover-tooltip layers that are on the map", () => {
    expect(hoverableLayerIds(map, layers)).toEqual(["hover"]);
  });

  it("adds click-tooltip layers when asked (touch devices)", () => {
    expect(hoverableLayerIds(map, layers, { includeClickTooltips: true })).toEqual(["hover", "click"]);
  });
});

describe("hoverBufferSize", () => {
  it("never goes below the floor", () => {
    expect(hoverBufferSize(["a"], { a: { bufferSize: 1 } })).toBe(HOVER_BUFFER_FLOOR);
  });

  it("takes the largest layer buffer, or the given minimum", () => {
    const layers = { a: { bufferSize: 5 }, b: { bufferSize: 9 } };
    expect(hoverBufferSize(["a", "b"], layers)).toBe(9);
    expect(hoverBufferSize(["a"], layers, { minimum: 12 })).toBe(12);
  });

  it("adds half the line width for line layers, assuming 7.5 for expressions", () => {
    const layers = {
      fixed: { geometryType: "line", bufferSize: 2, mapLayer: { paint: { "line-width": 6 } } },
      expr: { geometryType: "line", mapLayer: { paint: { "line-width": ["get", "w"] } } },
    };
    expect(hoverBufferSize(["fixed"], layers)).toBe(5);
    expect(hoverBufferSize(["expr"], layers)).toBe(3.75);
  });
});

describe("bufferedBox", () => {
  it("returns the box around the point", () => {
    expect(bufferedBox({ x: 10, y: 20 }, 3)).toEqual([
      [7, 17],
      [13, 23],
    ]);
  });

  it("returns null for a point that isn't finite", () => {
    expect(bufferedBox({ x: NaN, y: 1 }, 3)).toBeNull();
    expect(bufferedBox({}, 3)).toBeNull();
  });
});

describe("tooltipFeatures", () => {
  const layers = { zones: {}, dataOnly: { shouldHaveHoverOnlyOnData: true }, stations: {} };

  it("drops features without a layer or a configured layer", () => {
    const features = [zone(), { ...zone(), layer: undefined }, zone({ layerId: "unknown" }), null];
    expect(tooltipFeatures(features, layers)).toEqual([features[0]]);
  });

  it("keeps features without an id (tapped GeoJSON features often have none)", () => {
    const noId = { ...zone(), id: undefined };
    expect(tooltipFeatures([noId], layers)).toEqual([noId]);
  });

  it("drops features without data on layers that only hover on data", () => {
    const withData = zone({ layerId: "dataOnly", state: { value: 0 } });
    const without = zone({ layerId: "dataOnly", state: {} });
    expect(tooltipFeatures([withData, without], layers)).toEqual([withData]);
  });

  it("uses the base layer's config for spider features", () => {
    const spider = zone({ layerId: "stations-spider" });
    expect(tooltipFeatures([spider], layers)).toEqual([spider]);
  });
});

describe("uniqueById", () => {
  it("keeps the first feature with each id", () => {
    const a = zone();
    const b = zone({ layerId: "other" });
    const c = zone({ id: 8 });
    expect(uniqueById([a, b, c])).toEqual([a, c]);
  });
});

describe("metadataHtml", () => {
  it("lists properties other than id, name and value", () => {
    const html = metadataHtml({ id: 1, name: "Leeds", value: 3, district: "West Yorkshire" });
    expect(html).toContain('class="metadata-section"');
    expect(html).toContain("district:");
    expect(html).toContain("West Yorkshire");
    expect(html).not.toContain("Leeds");
  });

  it("is empty when there is nothing else", () => {
    expect(metadataHtml({ id: 1, name: "Leeds" })).toBe("");
    expect(metadataHtml(undefined)).toBe("");
  });
});

describe("buildTooltip", () => {
  const visualisations = {
    Vis: { legendText: [{ displayValue: "Jobs", legendSubtitleText: "people" }] },
  };
  const build = (layerConfig, feature = zone()) =>
    buildTooltip({
      features: [feature],
      layers: { zones: { visualisationName: "Vis", ...layerConfig } },
      visualisations,
    });

  it("describes the feature with its formatted value and the legend's labels", () => {
    const { sections, requests } = build({}, zone({ state: { value: 1234.5678 } }));
    expect(sections).toHaveLength(1);
    expect(sections[0]).toContain("Leeds");
    expect(sections[0]).toContain("1,235");
    expect(sections[0]).toContain("Jobs");
    expect(requests).toEqual([null]);
  });

  it("leaves the value out with hideValueInTooltip", () => {
    const { sections } = build({ hideValueInTooltip: true }, zone({ state: { value: 4321 } }));
    expect(sections[0]).toContain("Leeds");
    expect(sections[0]).not.toContain("4,321");
  });

  it("describes a feature with no feature state", () => {
    const feature = zone();
    delete feature.state;
    expect(build({}, feature).sections[0]).toContain("Leeds");
  });

  it.each([
    ["hoverNulls is false", { hoverNulls: false }],
    ["the layer only hovers on data", { shouldHaveHoverOnlyOnData: true }],
  ])("skips a feature without data when %s", (_, config) => {
    expect(build(config, zone({ state: {} })).sections).toEqual([]);
  });

  it("prefers the layer's own labels over the legend's", () => {
    const { sections } = build({ defaultTooltipValueName: "Count", defaultTooltipUnitName: "trips" });
    expect(sections[0]).toContain("Count");
    expect(sections[0]).toContain("trips");
  });

  it("adds the metadata section when asked", () => {
    const feature = zone({ properties: { name: "Leeds", district: "West Yorkshire" } });
    expect(build({ hoverTipShouldIncludeMetadata: true }, feature).sections[0]).toContain("West Yorkshire");
  });

  it("uses a loading placeholder and a request for a custom tooltip", () => {
    const { sections, requests } = build({ customTooltip: { url: "/x/{id}" } });
    expect(sections[0]).toContain("Leeds");
    expect(requests[0]).toMatchObject({ layerId: "zones", featureName: "Leeds", joinToDefault: false });
  });

  it("keeps the default section and adds a loading part when joining a custom tooltip to it", () => {
    const { sections, requests } = build({
      customTooltip: { url: "/x/{id}", joinToDefaultTooltip: true, defaultValueName: "Total" },
    });
    expect(sections[0]).toContain("Total");
    expect(requests[0]).toMatchObject({ joinToDefault: true });
  });
});

describe("fetchCustomTooltip", () => {
  const layers = (extra = {}) => ({
    zones: {
      customTooltip: { url: "/api/zones/{id}", htmlTemplate: "<p>{name}: {total}</p>" },
      ...extra,
    },
  });
  const request = (joinToDefault = false) => ({ feature: zone(), layerId: "zones", featureName: "Leeds", joinToDefault });

  it("fills the template from the response", async () => {
    api.baseService.get.mockResolvedValue({ name: "Leeds", total: 5 });
    const html = await fetchCustomTooltip(request(), layers(), new AbortController().signal);
    expect(api.baseService.get).toHaveBeenCalledWith(expect.stringContaining("7"), expect.objectContaining({ signal: expect.any(AbortSignal) }));
    expect(html).toContain("Leeds");
    expect(html).toContain("5");
  });

  it("shows the most recent record and counts the rest with showAllDataInTooltipForEachGeom", async () => {
    api.baseService.get.mockResolvedValue([
      { name: "old", total: 1 },
      { name: "new", total: 2 },
    ]);
    const html = await fetchCustomTooltip(
      request(),
      layers({ showAllDataInTooltipForEachGeom: true }),
      new AbortController().signal
    );
    expect(html).toContain("new");
    expect(html).not.toContain("old");
    expect(html).toContain("1 more record(s)");
  });

  it("falls back when the request fails", async () => {
    jest.spyOn(console, "error").mockImplementation(() => {});
    api.baseService.get.mockRejectedValue(new Error("boom"));
    await expect(fetchCustomTooltip(request(true), layers(), new AbortController().signal)).resolves.toBe(
      "<p>Data unavailable.</p>"
    );
    await expect(fetchCustomTooltip(request(false), layers(), new AbortController().signal)).resolves.toContain(
      "Leeds"
    );
  });

  it("doesn't log aborted requests", async () => {
    const error = jest.spyOn(console, "error").mockImplementation(() => {});
    api.baseService.get.mockRejectedValue(Object.assign(new Error("aborted"), { name: "AbortError" }));
    await fetchCustomTooltip(request(true), layers(), new AbortController().signal);
    expect(error).not.toHaveBeenCalled();
  });

  it("falls back without fetching if the layer has no custom tooltip", async () => {
    await expect(fetchCustomTooltip(request(true), { zones: {} }, new AbortController().signal)).resolves.toBe(
      "<p>Data unavailable.</p>"
    );
    expect(api.baseService.get).not.toHaveBeenCalled();
  });
});

describe("mergeTooltip", () => {
  it("replaces placeholders, joins custom parts into defaults, and keeps the rest", () => {
    const sections = ["<div>plain</div>", "<p>loading</p>", '<div class="popup-content">default</div>'];
    const requests = [null, { joinToDefault: false }, { joinToDefault: true }];
    const html = mergeTooltip(sections, requests, [undefined, "<p>custom</p>", "<p>joined</p>"]);
    const parts = html.split(TOOLTIP_DIVIDER);
    expect(parts[0]).toBe("<div>plain</div>");
    expect(parts[1]).toBe("<p>custom</p>");
    expect(parts[2]).toContain("default");
    expect(parts[2]).toContain("joined");
  });
});

describe("layerClickHtml", () => {
  it("shows the name, id and value, with 0 for a feature without data", () => {
    expect(layerClickHtml(zone({ properties: { name: "Leeds", id: 7 } }))).toBe(
      "<p>Leeds</p><p> Id: 7</p><p>Value: 12</p>"
    );
    const noState = zone();
    delete noState.state;
    expect(layerClickHtml(noState)).toContain("Value: 0");
  });
});
