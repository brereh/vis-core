/**
 * Reading map-pane state. Components use these instead of reaching into the slices, so the
 * layout of pane state can change in one place.
 */
import { panesShowing } from "../map/resolveMapGrid";
import { gridOf } from "./paneState";

export { gridOf as selectMapGrid };

/**
 * Ids of the panes showing a visualisation or layer, in grid order.
 *
 * @param {Object} state
 * @param {{ visualisation?: string, layer?: string }} what
 * @returns {string[]}
 */
export const selectPanesShowing = (state, what) => panesShowing(gridOf(state), what);

/**
 * A visualisation as one pane draws it: the page's copy, with the pane's own params on top.
 * Returns the page's copy itself when the pane has no params of its own.
 *
 * @param {Object} state
 * @param {string} paneId
 * @param {string} visualisationName
 * @returns {Object|undefined}
 */
export function selectPaneVisualisation(state, paneId, visualisationName) {
  const visualisation = state.visualisations?.[visualisationName];
  const overrides = state.paneOverrides?.[paneId]?.[visualisationName];
  return mergeOverrides(visualisation, overrides);
}

/**
 * Applies a pane's param overrides to the page's copy of a visualisation.
 *
 * @param {Object|undefined} visualisation
 * @param {Object|undefined} overrides - `{ queryParams?, pathParams? }`.
 * @returns {Object|undefined}
 */
export function mergeOverrides(visualisation, overrides) {
  if (!visualisation || !overrides) return visualisation;
  const merged = { ...visualisation };
  ["queryParams", "pathParams"].forEach((field) => {
    if (overrides[field] && Object.keys(overrides[field]).length > 0) {
      merged[field] = { ...(visualisation[field] || {}), ...overrides[field] };
    }
  });
  return merged;
}

/** The data a pane last fetched for a visualisation. */
export const selectPaneData = (state, paneId, visualisationName) =>
  state.paneData?.[paneId]?.[visualisationName];

/**
 * Everything one pane shows for a visualisation: its params (see `selectPaneVisualisation`)
 * and its own data rather than all panes' data together. Returns the page's copy itself when
 * neither differs, as on a single-map page.
 *
 * @param {Object} state
 * @param {string} paneId
 * @param {string} visualisationName
 * @returns {Object|undefined}
 */
export function selectPaneView(state, paneId, visualisationName) {
  const visualisation = selectPaneVisualisation(state, paneId, visualisationName);
  const data = selectPaneData(state, paneId, visualisationName);
  if (!visualisation || data === undefined || data === visualisation.data) return visualisation;
  return { ...visualisation, data };
}

/**
 * The panes whose data a pane's colour classes are computed from: the panes showing the
 * visualisation that share classification, or just the pane if it classifies on its own.
 *
 * @param {Object} state
 * @param {string} visualisationName
 * @param {string} paneId
 * @returns {string[]}
 */
export function selectClassificationPanes(state, visualisationName, paneId) {
  const grid = gridOf(state);
  const pane = grid.panes.find((p) => p.id === paneId);
  if (!pane || pane.classification === "own") return [paneId];
  const shared = panesShowing(grid, { visualisation: visualisationName }).filter(
    (id) => grid.panes.find((p) => p.id === id)?.classification !== "own"
  );
  return shared.includes(paneId) ? shared : [paneId];
}

/**
 * The registered maps, in grid order. Falls back to `state.map` for state that has no
 * pane maps.
 *
 * @param {Object} state
 * @returns {Object[]}
 */
export function selectMaps(state) {
  const mapsByPane = state.mapsByPane ?? {};
  const maps = gridOf(state).paneIds.map((id) => mapsByPane[id]).filter(Boolean);
  if (maps.length > 0) return maps;
  return state.map ? [state.map] : [];
}

/** The map registered for a pane, if any. */
export const selectPaneMap = (state, paneId) => state.mapsByPane?.[paneId] ?? null;

/**
 * The pane a registered map belongs to.
 *
 * @returns {string|undefined}
 */
export function selectPaneOfMap(state, map) {
  return Object.entries(state.mapsByPane ?? {}).find(([, paneMap]) => paneMap === map)?.[0];
}
