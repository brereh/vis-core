/**
 * Map view memory: the camera and filter values of a map page, kept in sessionStorage for the
 * browser tab, so leaving the page (for example to a detail page) and coming back restores the
 * view as it was. Enabled by page `config.rememberMapView` or app-level `rememberMapView`.
 */

const STORAGE_PREFIX = "vis-core.mapView:";

/** Whether the page remembers its view. The page setting wins over the app default. */
export const isMapViewMemoryEnabled = (appContext, pageContext) =>
  Boolean(pageContext?.config?.rememberMapView ?? appContext?.rememberMapView);

/**
 * A key for a filter that is stable between visits (filter ids are generated on each load).
 * @param {Object} filter - The filter configuration object.
 * @returns {string} The key.
 */
export const filterMemoryKey = (filter) =>
  [
    filter.paramName ?? "",
    filter.filterName ?? "",
    filter.type ?? "",
    (filter.actions ?? []).map((a) => a.action).join(","),
  ].join("|");

/**
 * Reads a page's remembered view.
 * @param {string} pageUrl - The page's url.
 * @returns {{centre?: number[], zoom?: number, filters?: Object}|null} The view, or null.
 */
export const readMapView = (pageUrl) => {
  try {
    const raw = sessionStorage.getItem(STORAGE_PREFIX + pageUrl);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

/**
 * Merges part of a page's view into what is remembered.
 * @param {string} pageUrl - The page's url.
 * @param {Object} part - `{ centre, zoom }` or `{ filters }`.
 */
export const writeMapView = (pageUrl, part) => {
  try {
    const next = { ...(readMapView(pageUrl) ?? {}), ...part };
    sessionStorage.setItem(STORAGE_PREFIX + pageUrl, JSON.stringify(next));
  } catch {
    // Storage unavailable (private mode, quota): the page still works, it just won't remember.
  }
};
