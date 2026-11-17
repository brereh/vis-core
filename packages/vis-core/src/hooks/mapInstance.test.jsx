/**
 * Creating and tearing down the MapLibre instance behind a map pane.
 *
 * Every pane builds its map with `useMap`. (Dual pages used a separate `useDualMaps` until
 * Phase 3 of docs/Map Panes Consolidation Plan.md; its drift, §2.2(2)–(4), was fixed in
 * Phase 1, and camera sync between panes is now the map group's job: map/mapGroup.test.js.)
 */
import { renderHook } from "@testing-library/react";
import { FakeMapConstructor, resetMapLibreFake } from "testing/mapLibreFake";
import { useMapBrowserEnv } from "testing/browserEnv";
import { defaultMapStyle } from "defaults";

jest.mock("maplibre-gl", () => require("testing/mapLibreFake").mapLibreModule());
jest.mock("js-cookie", () => ({ __esModule: true, default: { get: jest.fn() } }));
jest.mock("services", () => ({
  api: { baseService: { buildAbsoluteUrl: jest.fn() } },
}));

import Cookies from "js-cookie";
import { api } from "services";
import { useMap } from "hooks/useMap";

const API_ORIGIN = "http://localhost:8000";
const API_TILE_URL = `${API_ORIGIN}/api/vectortiles/zones/1/2/3`;

const containerRef = () => ({ current: document.createElement("div") });

const builtMaps = () => FakeMapConstructor.instances.map(({ map }) => map);

useMapBrowserEnv();

beforeEach(() => {
  resetMapLibreFake();
  api.baseService.buildAbsoluteUrl.mockReturnValue(`${API_ORIGIN}/`);
  Cookies.get.mockReturnValue("secret-token");
});

/** What a map's transformRequest does to a request for one of our API's tiles. */
const requestFor = (map, url = API_TILE_URL) => map.constructorOptions.transformRequest(url, "Tile");

describe("useMap (single pane)", () => {
  it("sends the user's token with requests to our API", () => {
    renderHook(() => useMap(containerRef(), undefined, undefined, undefined, ""));
    const [map] = builtMaps();
    expect(requestFor(map)).toEqual({
      url: API_TILE_URL,
      headers: { Authorization: "Bearer secret-token" },
    });
  });

  it("starts from the default base style when the page sets none", () => {
    renderHook(() => useMap(containerRef(), undefined, undefined, undefined, ""));
    const [map] = builtMaps();
    expect(map.constructorOptions.style).toEqual(defaultMapStyle());
  });

  it("removes the map when the pane unmounts", () => {
    const { unmount } = renderHook(() => useMap(containerRef(), undefined, undefined, undefined, ""));
    const [map] = builtMaps();
    unmount();
    expect(map.inspect().removed).toBe(true);
  });
});

describe("useMap options", () => {
  const renderMap = (options) =>
    renderHook(() => useMap(containerRef(), undefined, undefined, undefined, "TfN", options));

  it("shows the full attribution by default and a compact one when asked", () => {
    renderMap();
    renderMap({ compactAttribution: true });
    const [full, compact] = builtMaps().map(
      (map) => map.inspect().controls.find(({ position }) => position === "bottom-right").control
    );
    expect(full.options).toMatchObject({ compact: false });
    expect(compact.options).toMatchObject({ compact: true });
    expect(compact.options.customAttribution).toContain("TfN");
  });

  it("passes the tile cache size to the map", () => {
    renderMap({ tileCacheSize: 250 });
    expect(builtMaps()[0].constructorOptions.maxTileCacheSize).toBe(250);
  });

  it("resizes the map when its container changes size", () => {
    const observed = [];
    global.ResizeObserver = class {
      constructor(callback) {
        this.callback = callback;
      }
      observe(element) {
        observed.push({ element, callback: this.callback });
      }
      disconnect() {}
    };
    const ref = containerRef();
    renderHook(() => useMap(ref, undefined, undefined, undefined, ""));
    const [map] = builtMaps();
    const container = observed.find(({ element }) => element === ref.current);
    expect(container).toBeDefined();
    map.resize.mockClear();
    container.callback();
    expect(map.resize).toHaveBeenCalled();
  });
});

/** A container inside the page, as on mobile `useMap` wraps it in a parent element. */
const attachedContainerRef = () => {
  const parent = document.createElement("div");
  document.body.appendChild(parent);
  const container = document.createElement("div");
  parent.appendChild(container);
  return { current: container };
};

describe("useMap touch policy", () => {
  describe("on a touch-only phone", () => {
    useMapBrowserEnv({
      matches: (query) => ["(max-width: 900px)", "(pointer: coarse)", "(any-pointer: coarse)"].includes(query),
    });

    it("pans with one finger and turns off mouse and keyboard gestures", () => {
      renderHook(() => useMap(attachedContainerRef(), undefined, undefined, undefined, ""));
      const [map] = builtMaps();
      expect(map.dragPan.isEnabled()).toBe(true);
      expect(map.touchZoomRotate.isRotationEnabled()).toBe(false);
      expect(map.scrollZoom.isEnabled()).toBe(false);
      expect(map.doubleClickZoom.isEnabled()).toBe(false);
      expect(map.keyboard.isEnabled()).toBe(false);
    });
  });

  describe("in a narrow desktop window", () => {
    useMapBrowserEnv({
      matches: (query) => ["(max-width: 900px)", "(pointer: fine)", "(any-pointer: fine)"].includes(query),
    });

    it("keeps drag pan and scroll zoom", () => {
      renderHook(() => useMap(attachedContainerRef(), undefined, undefined, undefined, ""));
      const [map] = builtMaps();
      expect(map.dragPan.isEnabled()).toBe(true);
      expect(map.scrollZoom.isEnabled()).toBe(true);
    });
  });
});
