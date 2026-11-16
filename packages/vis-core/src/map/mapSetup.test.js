import {
  attributionText,
  createTransformRequest,
  DEFAULT_TILE_CACHE_SIZE,
  mapOptions,
  rememberInitialBaseSources,
  resolveMapStyle,
} from "./mapSetup";
import { getInitialBaseSources } from "./baseSources";
import { defaultMapStyle, defaultMapCentre, defaultMapZoom } from "defaults";
import { createFakeMap } from "testing/mapLibreFake";

jest.mock("js-cookie", () => ({ __esModule: true, default: { get: jest.fn() } }));
jest.mock("services", () => ({ api: { baseService: { buildAbsoluteUrl: jest.fn() } } }));
import Cookies from "js-cookie";
import { api } from "services";

const API_ORIGIN = "http://localhost:8000";

beforeEach(() => {
  api.baseService.buildAbsoluteUrl.mockReturnValue(`${API_ORIGIN}/`);
  Cookies.get.mockReturnValue("secret");
});

describe("resolveMapStyle", () => {
  it("uses the page's style, calling it if it's a function, else the default", () => {
    expect(resolveMapStyle("https://style.json")).toBe("https://style.json");
    expect(resolveMapStyle(() => ({ version: 8 }))).toEqual({ version: 8 });
    expect(resolveMapStyle(undefined)).toEqual(defaultMapStyle());
  });
});

describe("createTransformRequest", () => {
  it("adds the OS key and spatial reference to OS requests, except styles", () => {
    const transform = createTransformRequest();
    const { url } = transform("https://api.os.uk/maps/vector/v1/vts/tile/1/2/3.pbf", "Tile");
    const params = new URL(url).searchParams;
    expect(params.has("key")).toBe(true);
    expect(params.get("srs")).toBe("3857");

    const style = "https://api.os.uk/maps/vector/v1/vts/resources/styles";
    expect(transform(style, "Style")).toEqual({ url: style });
  });

  it("keeps an OS key that is already there", () => {
    const { url } = createTransformRequest()("https://api.os.uk/x?key=mine&srs=27700", "Tile");
    expect(new URL(url).searchParams.get("key")).toBe("mine");
    expect(new URL(url).searchParams.get("srs")).toBe("27700");
  });

  it("sends the user's token to our API only", () => {
    const transform = createTransformRequest();
    expect(transform(`${API_ORIGIN}/tiles/1`, "Tile")).toEqual({
      url: `${API_ORIGIN}/tiles/1`,
      headers: { Authorization: "Bearer secret" },
    });
    expect(transform("https://elsewhere.example/tiles/1", "Tile")).toEqual({
      url: "https://elsewhere.example/tiles/1",
    });
  });

  it("sends no header when the user isn't signed in", () => {
    Cookies.get.mockReturnValue(undefined);
    expect(createTransformRequest()(`${API_ORIGIN}/tiles/1`, "Tile")).toEqual({ url: `${API_ORIGIN}/tiles/1` });
  });

  it("leaves requests alone when the API origin can't be worked out", () => {
    api.baseService.buildAbsoluteUrl.mockImplementation(() => {
      throw new Error("no base url");
    });
    expect(createTransformRequest()(`${API_ORIGIN}/tiles/1`, "Tile")).toEqual({ url: `${API_ORIGIN}/tiles/1` });
  });
});

describe("mapOptions", () => {
  it("fills in the defaults", () => {
    const container = document.createElement("div");
    const options = mapOptions({ container });
    // Compared by identity: a deep match on a DOM element recurses through jsdom.
    expect(options.container).toBe(container);
    expect(options).toMatchObject({
      style: defaultMapStyle(),
      center: defaultMapCentre,
      zoom: defaultMapZoom,
      attributionControl: false,
      maxTileCacheSize: DEFAULT_TILE_CACHE_SIZE,
      transformRequest: expect.any(Function),
    });
  });

  it("uses the page's view and a zoom of 0", () => {
    const options = mapOptions({ mapCentre: [1, 2], mapZoom: 0, tileCacheSize: 250 });
    expect(options).toMatchObject({ center: [1, 2], zoom: 0, maxTileCacheSize: 250 });
  });
});

describe("attributionText", () => {
  it("credits OS for this year and appends the page's text", () => {
    const year = new Date().getFullYear();
    expect(attributionText()).toBe(`Contains OS data © Crown copyright and database right ${year}`);
    expect(attributionText("TfN")).toBe(`Contains OS data © Crown copyright and database right ${year} | TfN`);
  });
});

describe("rememberInitialBaseSources", () => {
  it("records the first style's sources once", () => {
    const map = createFakeMap({ initialSources: { base: { type: "vector" } } });
    rememberInitialBaseSources(map);
    map.addSource("app", { type: "geojson" });
    rememberInitialBaseSources(map);
    expect([...getInitialBaseSources(map)]).toEqual(["base"]);
  });
});
