/**
 * Settings every MapLibre map in the app is created with, whichever pane it belongs to.
 */
import Cookies from "js-cookie";
import { api } from "services";
import { defaultMapStyle, defaultMapCentre, defaultMapZoom } from "defaults";
import { registerInitialBaseSources, getInitialBaseSources } from "./baseSources";

/** Tiles kept in memory per map. */
export const DEFAULT_TILE_CACHE_SIZE = 500;

/**
 * The style to create a map with: the page's (or the result of calling it, if it's a
 * function), otherwise the default base style.
 *
 * @param {string|Object|Function} [mapStyle]
 * @returns {string|Object}
 */
export function resolveMapStyle(mapStyle) {
  if (typeof mapStyle === "function") return mapStyle();
  return mapStyle || defaultMapStyle();
}

/** The origin of our API, or null if it can't be worked out. */
function apiOrigin() {
  try {
    return new URL(api.baseService.buildAbsoluteUrl("/")).origin;
  } catch {
    return null;
  }
}

/**
 * Builds a MapLibre `transformRequest` that:
 * - adds the OS Maps API key and spatial reference to OS requests (except styles), and
 * - sends the signed-in user's token with requests to our own API (tiles, sprites, glyphs).
 *
 * The API origin is read once, when the map is created.
 *
 * @returns {(url: string, resourceType: string) => { url: string, headers?: Object }}
 */
export function createTransformRequest() {
  const origin = apiOrigin();

  return (url, resourceType) => {
    if (resourceType !== "Style" && url.startsWith("https://api.os.uk")) {
      const osUrl = new URL(url);
      if (!osUrl.searchParams.has("key")) {
        osUrl.searchParams.append("key", import.meta.env.VITE_APP_MAP_API_TOKEN);
      }
      if (!osUrl.searchParams.has("srs")) osUrl.searchParams.append("srs", 3857);
      return { url: osUrl.href };
    }

    try {
      if (origin && new URL(url, window.location.origin).origin === origin) {
        const token = Cookies.get("token");
        if (token) return { url, headers: { Authorization: `Bearer ${token}` } };
      }
    } catch {
      /* not a URL we can parse: leave it alone */
    }

    return { url };
  };
}

/**
 * Options for `new maplibregl.Map(...)` shared by every map.
 *
 * @param {Object} args
 * @param {HTMLElement} args.container
 * @param {string|Object|Function} [args.mapStyle]
 * @param {number[]} [args.mapCentre]
 * @param {number} [args.mapZoom]
 * @param {number} [args.tileCacheSize]
 * @returns {Object}
 */
export function mapOptions({ container, mapStyle, mapCentre, mapZoom, tileCacheSize }) {
  return {
    container,
    style: resolveMapStyle(mapStyle),
    center: mapCentre || defaultMapCentre,
    zoom: mapZoom != null ? mapZoom : defaultMapZoom,
    attributionControl: false,
    fadeDuration: 0,
    refreshExpiredTiles: false,
    maxTileCacheSize: tileCacheSize ?? DEFAULT_TILE_CACHE_SIZE,
    transformRequest: createTransformRequest(),
  };
}

/**
 * The attribution line shown on every map.
 *
 * @param {string} [extraCopyrightText] - Page-specific text appended after a separator.
 * @returns {string}
 */
export function attributionText(extraCopyrightText) {
  const year = new Date().getFullYear();
  const extra = extraCopyrightText ? ` | ${extraCopyrightText}` : "";
  return `Contains OS data © Crown copyright and database right ${year}${extra}`;
}

/**
 * Records which sources belong to the base style the first time it loads, so later code
 * can tell base-map layers from application layers.
 *
 * @param {Object} map - MapLibre map; call from its "style.load" handler.
 */
export function rememberInitialBaseSources(map) {
  const style = map.getStyle?.();
  if (style?.sources && !getInitialBaseSources(map)) {
    registerInitialBaseSources(map, new Set(Object.keys(style.sources)));
  }
}
