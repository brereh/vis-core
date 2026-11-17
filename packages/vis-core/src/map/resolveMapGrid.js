/**
 * Works out a map page's panes from its config.
 *
 * Every map page is a grid of cells; a `map` cell is a pane with its own MapLibre map.
 * Pages without a grid are presets: `MapLayout` is one pane ("main"), `DualMapLayout` is two
 * side by side ("left", "right"). Custom grids arrive in Phase 4 of
 * docs/Map Panes Consolidation Plan.md; this module already returns the same shape for them.
 *
 * Pure: config in, plain serialisable data out.
 */

export const SINGLE_PANE_ID = "main";
export const LEFT_PANE_ID = "left";
export const RIGHT_PANE_ID = "right";
export const DEFAULT_SYNC_GROUP = "default";

/** Visualisation types drawn on a map (as opposed to callout cards and the like). */
const MAP_VISUALISATION_TYPES = ["joinDataToMap", "geojson"];

const mapVisualisationNames = (config) =>
  (config?.visualisations ?? [])
    .filter((vis) => MAP_VISUALISATION_TYPES.includes(vis.type))
    .map((vis) => vis.name);

const layerNames = (config) => (config?.layers ?? []).map((layer) => layer.name);

/**
 * A pane with its defaults filled in.
 *
 * @param {Object} cell - Cell config.
 * @param {Object} pageConfig - The page's `config`, for the default content.
 * @returns {Object}
 */
function toPane(cell, pageConfig) {
  return {
    id: cell.id,
    type: "map",
    column: cell.column ?? 1,
    row: cell.row ?? 1,
    columnSpan: cell.columnSpan ?? 1,
    rowSpan: cell.rowSpan ?? 1,
    title: cell.title,
    visualisations: cell.visualisations ?? mapVisualisationNames(pageConfig),
    layers: cell.layers ?? layerNames(pageConfig),
    syncGroup: cell.syncGroup === undefined ? DEFAULT_SYNC_GROUP : cell.syncGroup,
    classification: cell.classification ?? "shared",
  };
}

const PRESETS = {
  single: { columns: 1, rows: 1, cells: [{ id: SINGLE_PANE_ID }] },
  dual: {
    columns: 2,
    rows: 1,
    cells: [
      { id: LEFT_PANE_ID, column: 1 },
      { id: RIGHT_PANE_ID, column: 2 },
    ],
  },
};

/**
 * Resolves a page's grid.
 *
 * @param {Object} page - The page config (`{ type, config }`).
 * @returns {{ columns: number, rows: number, panes: Object[], paneIds: string[],
 *   primaryPaneId: string, preset: "single"|"dual" }}
 */
export function resolveMapGrid(page) {
  const preset = page?.type === "DualMapLayout" ? "dual" : "single";
  const { columns, rows, cells } = PRESETS[preset];
  const panes = cells.map((cell) => toPane(cell, page?.config));
  return {
    columns,
    rows,
    panes,
    paneIds: panes.map((pane) => pane.id),
    primaryPaneId: panes[0].id,
    preset,
  };
}

/** The grid of a single-map page that shows everything, for state with no grid set. */
export const FALLBACK_GRID = Object.freeze({
  columns: 1,
  rows: 1,
  panes: [
    Object.freeze({
      id: SINGLE_PANE_ID,
      type: "map",
      showsEverything: true,
      syncGroup: DEFAULT_SYNC_GROUP,
      classification: "shared",
    }),
  ],
  paneIds: [SINGLE_PANE_ID],
  primaryPaneId: SINGLE_PANE_ID,
  preset: "single",
});

/**
 * Whether a pane shows a visualisation or layer. A pane without content lists (the fallback
 * grid) shows everything.
 *
 * @param {Object} pane
 * @param {{ visualisation?: string, layer?: string }} what
 * @returns {boolean}
 */
export function paneShows(pane, { visualisation, layer }) {
  if (pane.showsEverything) return true;
  if (visualisation !== undefined) return (pane.visualisations ?? []).includes(visualisation);
  if (layer !== undefined) return (pane.layers ?? []).includes(layer);
  return false;
}

/**
 * Ids of the panes showing a visualisation or layer, in grid order.
 *
 * @param {Object} grid - From `resolveMapGrid`.
 * @param {{ visualisation?: string, layer?: string }} what
 * @returns {string[]}
 */
export function panesShowing(grid, what) {
  return grid.panes.filter((pane) => paneShows(pane, what)).map((pane) => pane.id);
}
