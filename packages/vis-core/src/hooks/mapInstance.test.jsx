/**
 * Creating and tearing down the MapLibre instance behind a map pane.
 *
 * `useMap` (single pane) and `useDualMaps` (two panes) should agree on how a map is built.
 * The `useMap` tests pin the behaviour to keep. The `useDualMaps` "known drift" tests use
 * `test.failing`: they state that same behaviour for both panes and fail today because of
 * §2.2(2)–(4) of docs/Map Panes Consolidation Plan.md. Phase 1 fixes them; Phase 3 deletes
 * `useDualMaps`, and the pane tests move onto the single hook.
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
import { useDualMaps } from "hooks/useDualMaps";

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

describe("useDualMaps (two panes)", () => {
  const renderDual = () =>
    renderHook(() => useDualMaps(containerRef(), containerRef(), undefined, undefined, undefined, ""));

  it("builds one map per pane, each with navigation controls", () => {
    renderDual();
    const maps = builtMaps();
    expect(maps).toHaveLength(2);
    maps.forEach((map) => {
      expect(map.inspect().controls.some(({ position }) => position === "bottom-left")).toBe(true);
    });
  });

  it("keeps the two panes' cameras together", () => {
    renderDual();
    const [left, right] = builtMaps();
    left.jumpTo({ center: [-1.5, 53.8], zoom: 11 });
    expect(right.getCenter()).toEqual({ lng: -1.5, lat: 53.8 });
    expect(right.getZoom()).toBe(11);
  });

  describe("known drift (plan §2.2(2)–(4))", () => {
    test.failing("sends the user's token with requests to our API, on both panes", () => {
      renderDual();
      expect(builtMaps()).toHaveLength(2);
      builtMaps().forEach((map) => {
        expect(requestFor(map)).toEqual({
          url: API_TILE_URL,
          headers: { Authorization: "Bearer secret-token" },
        });
      });
    });

    test.failing("starts both panes from the default base style when the page sets none", () => {
      renderDual();
      expect(builtMaps()).toHaveLength(2);
      builtMaps().forEach((map) => {
        expect(map.constructorOptions.style).toEqual(defaultMapStyle());
      });
    });

    test.failing("removes both maps when the panes unmount", () => {
      const { unmount } = renderDual();
      const maps = builtMaps();
      expect(maps).toHaveLength(2);
      unmount();
      maps.forEach((map) => expect(map.inspect().removed).toBe(true));
    });

    test.failing("stops syncing the panes when they unmount", () => {
      const { unmount } = renderDual();
      const [left, right] = builtMaps();
      unmount();
      expect(left.listenerCount("move")).toBe(0);
      expect(right.listenerCount("move")).toBe(0);
    });
  });
});
