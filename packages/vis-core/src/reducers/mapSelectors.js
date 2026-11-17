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
 * and its own data rather than all panes' data together. Where several panes show the
 * visualisation, a pane with no data stored yet has none (not another pane's). Returns the
 * page's copy itself when neither differs, as on a single-map page.
 *
 * @param {Object} state
 * @param {string} paneId
 * @param {string} visualisationName
 * @returns {Object|undefined}
 */
export function selectPaneView(state, paneId, visualisationName) {
  const visualisation = selectPaneVisualisation(state, paneId, visualisationName);
  if (!visualisation) return visualisation;
  const shared = selectPanesShowing(state, { visualisation: visualisationName }).length > 1;
  const stored = selectPaneData(state, paneId, visualisationName);
  // A pane that hasn't fetched yet has no data of its own where several panes show the
  // visualisation; otherwise data stored without a pane (on the page copy) still applies.
  if (stored === undefined) return shared ? { ...visualisation, data: [] } : visualisation;
  if (stored === visualisation.data) return visualisation;
  return { ...visualisation, data: stored };
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
 * The data a pane's colour classes are computed from: the data of every pane in its
 * classification group (see `selectClassificationPanes`), together. Falls back to the page
 * copy's data where no pane has stored any (data stored without a pane).
 *
 * @param {Object} state
 * @param {string} visualisationName
 * @param {string} paneId
 * @returns {Array|undefined}
 */
export function selectClassificationData(state, visualisationName, paneId) {
  const panes = selectClassificationPanes(state, visualisationName, paneId);
  const stored = panes.map((id) => selectPaneData(state, id, visualisationName));
  if (stored.every((data) => data === undefined)) return state.visualisations?.[visualisationName]?.data;
  if (stored.length === 1) return stored[0];
  return stored.flatMap((data) => (Array.isArray(data) ? data : []));
}

/**
 * The visualisation whose data colours a layer: the one joined to the layer, otherwise the
 * page's first.
 *
 * @param {Object} state
 * @param {string} layerId
 * @returns {string|undefined} The visualisation's name.
 */
export function selectVisualisationForLayer(state, layerId) {
  const entries = Object.entries(state.visualisations ?? {});
  return (entries.find(([, vis]) => vis?.joinLayer === layerId) ?? entries[0])?.[0];
}

/**
 * The pane whose view of a layer the sidebar's layer controls describe: the first pane showing
 * both the layer and its visualisation, otherwise the first showing the layer, otherwise the
 * primary pane. (The left pane on a side-by-side page, as before.)
 *
 * @param {Object} state
 * @param {string} layerId
 * @param {string} [visualisationName]
 * @returns {string}
 */
export function selectLayerControlPane(state, layerId, visualisationName) {
  const grid = gridOf(state);
  const showingLayer = panesShowing(grid, { layer: layerId });
  const showingBoth = visualisationName
    ? showingLayer.filter((id) => panesShowing(grid, { visualisation: visualisationName }).includes(id))
    : [];
  return showingBoth[0] ?? showingLayer[0] ?? grid.primaryPaneId;
}

/** Filter types that select features on a map with the draw control. */
export const FEATURE_SELECT_FILTER_TYPES = ["mapFeatureSelect", "mapFeatureSelectWithControls", "mapFeatureSelectAndPan"];

/**
 * The pane that hosts the page's draw control for feature selection. On a configured grid:
 * the first pane the page's first feature-select filter targets, otherwise the primary pane.
 * Preset pages keep it on the primary pane (the left one on a side-by-side page), as before.
 * Worked out from the stored filters and grid, so it can't fall out of step with them.
 *
 * @param {Object} state
 * @returns {string}
 */
export function selectDrawPaneId(state) {
  const grid = gridOf(state);
  if (grid.preset !== "custom") return grid.primaryPaneId;
  const filter = (state.filters ?? []).find((f) => FEATURE_SELECT_FILTER_TYPES.includes(f.type));
  const paneId = (filter?.panes ?? []).find((id) => grid.paneIds.includes(id));
  return paneId ?? grid.primaryPaneId;
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
