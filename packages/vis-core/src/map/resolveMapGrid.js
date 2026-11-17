/**
 * Works out a map page's grid of cells from its config.
 *
 * Every map page is a grid of cells; a `map` cell is a pane with its own MapLibre map. Pages
 * without `config.grid` are presets: `MapLayout` is one pane ("main"), `DualMapLayout` is two
 * side by side ("left", "right"). A page with `config.grid` lays its cells out as configured
 * (see docs/Map Panes Consolidation Plan.md §3.2):
 *
 *   grid: {
 *     columns: 3,          // a count, or relative widths such as [2, 1, 1]
 *     rows: 2,             // a count, or relative heights
 *     cells: [{ id, type: "map", column, row, columnSpan, rowSpan, title,
 *               visualisations, layers, syncGroup, classification }],
 *   }
 *
 * Problems in a grid config don't throw: they're reported in `warnings` (MapContext logs them
 * in development) and fall back to safe defaults.
 *
 * Pure: config in, plain serialisable data out.
 */

export const SINGLE_PANE_ID = "main";
export const LEFT_PANE_ID = "left";
export const RIGHT_PANE_ID = "right";
export const DEFAULT_SYNC_GROUP = "default";

/** Cell types the grid can render. Only maps for now; other widgets can be added later. */
export const CELL_TYPES = ["map"];

/** More map panes than this works, but each one costs a WebGL context and memory. */
export const MAX_RECOMMENDED_MAP_PANES = 4;

const CLASSIFICATIONS = ["shared", "own"];

/** Visualisation types drawn on a map (as opposed to callout cards and the like). */
const MAP_VISUALISATION_TYPES = ["joinDataToMap", "geojson"];

const mapVisualisationNames = (config) =>
  (config?.visualisations ?? [])
    .filter((vis) => MAP_VISUALISATION_TYPES.includes(vis.type))
    .map((vis) => vis.name);

const layerNames = (config) => (config?.layers ?? []).map((layer) => layer.name);

const isPositiveInteger = (value) => Number.isInteger(value) && value > 0;

/**
 * A grid dimension as relative sizes: a count gives that many equal sizes; a list of positive
 * numbers is used as is.
 *
 * @returns {number[]|null} Null if the value is neither.
 */
function toSizes(value) {
  if (isPositiveInteger(value)) return Array.from({ length: value }, () => 1);
  if (Array.isArray(value) && value.length > 0 && value.every((size) => typeof size === "number" && size > 0)) {
    return value;
  }
  return null;
}

/**
 * A cell with its defaults filled in. Map cells get the pane fields.
 *
 * @param {Object} cell - Cell config.
 * @param {Object} pageConfig - The page's `config`, for the default content.
 * @returns {Object}
 */
function toCell(cell, pageConfig) {
  const placed = {
    id: cell.id,
    type: cell.type ?? "map",
    column: cell.column ?? 1,
    row: cell.row ?? 1,
    columnSpan: cell.columnSpan ?? 1,
    rowSpan: cell.rowSpan ?? 1,
    title: cell.title,
  };
  if (placed.type !== "map") return placed;
  return {
    ...placed,
    visualisations: cell.visualisations ?? mapVisualisationNames(pageConfig),
    layers: cell.layers ?? layerNames(pageConfig),
    syncGroup: cell.syncGroup === undefined ? DEFAULT_SYNC_GROUP : cell.syncGroup,
    classification: CLASSIFICATIONS.includes(cell.classification) ? cell.classification : "shared",
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

/** Checks a configured grid, returning its cells (with ids) and what's wrong with it. */
function checkGrid(grid, pageConfig) {
  const warnings = [];
  const columnSizes = toSizes(grid.columns);
  const rowSizes = toSizes(grid.rows);
  if (!columnSizes) warnings.push(`grid.columns must be a positive whole number or a list of positive sizes; using 1.`);
  if (!rowSizes) warnings.push(`grid.rows must be a positive whole number or a list of positive sizes; using 1.`);
  const columns = columnSizes ?? [1];
  const rows = rowSizes ?? [1];

  const knownVisualisations = new Set((pageConfig?.visualisations ?? []).map((vis) => vis.name));
  const knownLayers = new Set(layerNames(pageConfig));
  const seenIds = new Set();
  const occupied = new Map();

  const cells = (Array.isArray(grid.cells) ? grid.cells : []).map((rawCell, index) => {
    const cell = { ...rawCell };
    const label = cell.id ? `Cell "${cell.id}"` : `Cell ${index + 1}`;

    if (!cell.id || typeof cell.id !== "string") {
      cell.id = `cell-${index + 1}`;
      warnings.push(`${label} has no id; using "${cell.id}".`);
    } else if (seenIds.has(cell.id)) {
      const original = cell.id;
      cell.id = `${original}-${index + 1}`;
      warnings.push(`${label} repeats an id already used; using "${cell.id}".`);
    }
    seenIds.add(cell.id);

    const type = cell.type ?? "map";
    if (!CELL_TYPES.includes(type)) {
      warnings.push(`${label} has type "${type}", which the grid can't render (known: ${CELL_TYPES.join(", ")}).`);
    }

    ["column", "row", "columnSpan", "rowSpan"].forEach((field) => {
      if (cell[field] !== undefined && !isPositiveInteger(cell[field])) {
        warnings.push(`${label} has ${field} ${JSON.stringify(cell[field])}; it must be a positive whole number. Using 1.`);
        cell[field] = 1;
      }
    });
    const column = cell.column ?? 1;
    const row = cell.row ?? 1;
    const lastColumn = column + (cell.columnSpan ?? 1) - 1;
    const lastRow = row + (cell.rowSpan ?? 1) - 1;
    if (lastColumn > columns.length || lastRow > rows.length) {
      warnings.push(
        `${label} reaches column ${lastColumn}, row ${lastRow}, outside the ${columns.length}×${rows.length} grid.`
      );
    }
    for (let c = column; c <= lastColumn; c += 1) {
      for (let r = row; r <= lastRow; r += 1) {
        const key = `${c},${r}`;
        if (occupied.has(key)) {
          warnings.push(`${label} overlaps cell "${occupied.get(key)}" at column ${c}, row ${r}.`);
        } else {
          occupied.set(key, cell.id);
        }
      }
    }

    if (type === "map") {
      (cell.visualisations ?? []).filter((name) => !knownVisualisations.has(name)).forEach((name) =>
        warnings.push(`${label} shows visualisation "${name}", which the page doesn't define.`)
      );
      (cell.layers ?? []).filter((name) => !knownLayers.has(name)).forEach((name) =>
        warnings.push(`${label} shows layer "${name}", which the page doesn't define.`)
      );
      if (cell.classification !== undefined && !CLASSIFICATIONS.includes(cell.classification)) {
        warnings.push(`${label} has classification "${cell.classification}"; use "shared" or "own". Using "shared".`);
      }
    }
    return cell;
  });

  return { columns, rows, cells, warnings };
}

/**
 * Resolves a page's grid.
 *
 * @param {Object} page - The page config (`{ type, config }`).
 * @returns {{ columns: number, rows: number, columnSizes: number[], rowSizes: number[],
 *   cells: Object[], panes: Object[], paneIds: string[], primaryPaneId: string,
 *   preset: "single"|"dual"|"custom", warnings: string[] }} `cells` are all the grid's cells;
 *   `panes` are its map cells, in config order.
 */
export function resolveMapGrid(page) {
  const config = page?.config;
  const presetName = page?.type === "DualMapLayout" ? "dual" : "single";
  let layout = { ...PRESETS[presetName], warnings: [] };
  let preset = presetName;

  if (config?.grid) {
    const checked = checkGrid(config.grid, config);
    const mapCells = checked.cells.filter((cell) => (cell.type ?? "map") === "map");
    if (mapCells.length === 0) {
      checked.warnings.push(`The grid has no map cells; showing the page's default layout instead.`);
      layout = { ...layout, warnings: checked.warnings };
    } else {
      layout = checked;
      preset = "custom";
      if (mapCells.length > MAX_RECOMMENDED_MAP_PANES) {
        layout.warnings.push(
          `The grid has ${mapCells.length} map panes. More than ${MAX_RECOMMENDED_MAP_PANES} works, but each costs a WebGL context and memory; browsers drop contexts beyond about 16.`
        );
      }
    }
  }

  const columnSizes = Array.isArray(layout.columns) ? layout.columns : toSizes(layout.columns);
  const rowSizes = Array.isArray(layout.rows) ? layout.rows : toSizes(layout.rows);
  const cells = layout.cells.map((cell) => toCell(cell, config));
  const panes = cells.filter((cell) => cell.type === "map");
  return {
    columns: columnSizes.length,
    rows: rowSizes.length,
    columnSizes,
    rowSizes,
    cells,
    panes,
    paneIds: panes.map((pane) => pane.id),
    primaryPaneId: panes[0].id,
    preset,
    warnings: layout.warnings,
  };
}

/**
 * Warnings for filters that name panes the grid doesn't have.
 *
 * @param {Object[]} filters - Filter configs.
 * @param {Object} grid - From `resolveMapGrid`.
 * @returns {string[]}
 */
export function filterPaneWarnings(filters, grid) {
  const known = new Set(grid.paneIds);
  return (filters ?? []).flatMap((filter) =>
    Array.isArray(filter.panes)
      ? filter.panes
          .filter((id) => !known.has(id))
          .map((id) => `Filter "${filter.filterName ?? filter.paramName}" targets pane "${id}", which the grid doesn't have.`)
      : []
  );
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
