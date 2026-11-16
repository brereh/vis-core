/**
 * Map-pane rules for the map reducer, as pure functions of state.
 *
 * One rule decides where a filter's value goes, for visualisation params and layer paths:
 * - if the filter targets every pane showing the visualisation or layer (or it's shown in no
 *   pane, like a callout card), the value goes on the page's single copy;
 * - if it targets only some of those panes, it goes in those panes' overrides.
 *
 * So everything the panes share has one copy, and overrides hold only what really differs.
 * On a single-map page every filter targets every pane, and nothing changes from before.
 */
import { FALLBACK_GRID, LEFT_PANE_ID, RIGHT_PANE_ID, panesShowing } from "../map/resolveMapGrid";
import { updateUrlParameters } from "utils";

/** The page's grid, or a single pane showing everything when none has been set. */
export const gridOf = (state) => state.mapGrid ?? FALLBACK_GRID;

/**
 * The panes an action targets: `payload.panes`, or the legacy `sides` ("left", "right"; "both"
 * or unset means every pane). Null means every pane.
 *
 * @param {Object} payload
 * @returns {string[]|null}
 */
export function targetPanes(payload = {}) {
  if (Array.isArray(payload.panes)) return payload.panes;
  if (payload.sides === "left") return [LEFT_PANE_ID];
  if (payload.sides === "right") return [RIGHT_PANE_ID];
  return null;
}

/**
 * Splits the panes showing something into those an action targets, and says whether that's
 * all of them.
 *
 * @returns {{ showing: string[], targets: string[], coversAll: boolean }}
 */
function targetsAmong(showing, panes) {
  const targets = panes ? showing.filter((id) => panes.includes(id)) : showing;
  return { showing, targets, coversAll: targets.length === showing.length };
}

const paramEntry = (canonicalParams, paramName, value) => ({
  value,
  required: canonicalParams?.[paramName]?.required || false,
});

/**
 * Sets a query or path param of visualisations, following the rule at the top of this file.
 *
 * @param {Object} state - Map state.
 * @param {Object} args
 * @param {string[]} args.visualisationNames
 * @param {string[]|null} args.panes - Targeted panes; null for every pane.
 * @param {"queryParams"|"pathParams"} args.field
 * @param {string} args.paramName
 * @param {*} args.value
 * @returns {{ visualisations: Object, paneOverrides: Object }} The two slices, updated.
 */
export function applyVisualisationParam(state, { visualisationNames, panes, field, paramName, value }) {
  const grid = gridOf(state);
  let visualisations = state.visualisations;
  let paneOverrides = state.paneOverrides ?? {};

  (visualisationNames ?? []).forEach((visName) => {
    const vis = visualisations[visName];
    if (!vis) return;

    const showing = panesShowing(grid, { visualisation: visName });
    const { targets, coversAll } = targetsAmong(showing, panes);
    if (showing.length > 0 && targets.length === 0) return;

    if (showing.length === 0 || coversAll) {
      visualisations = {
        ...visualisations,
        [visName]: {
          ...vis,
          [field]: { ...(vis[field] || {}), [paramName]: paramEntry(vis[field], paramName, value) },
        },
      };
      // The shared value wins: drop any pane's own value for this param.
      paneOverrides = Object.fromEntries(
        Object.entries(paneOverrides).map(([paneId, overrides]) => {
          const params = overrides?.[visName]?.[field];
          if (!params || !(paramName in params)) return [paneId, overrides];
          const { [paramName]: _dropped, ...rest } = params;
          return [paneId, { ...overrides, [visName]: { ...overrides[visName], [field]: rest } }];
        })
      );
      return;
    }

    targets.forEach((paneId) => {
      const overrides = paneOverrides[paneId] ?? {};
      const visOverrides = overrides[visName] ?? {};
      paneOverrides = {
        ...paneOverrides,
        [paneId]: {
          ...overrides,
          [visName]: {
            ...visOverrides,
            [field]: {
              ...(visOverrides[field] || {}),
              [paramName]: paramEntry(vis[field], paramName, value),
            },
          },
        },
      };
    });
  });

  return { visualisations, paneOverrides };
}

/**
 * Stores a pane's fetched data for a visualisation. The page copy's `data` becomes all the
 * panes' data together (just this data on a single-map page), for readers that want the
 * whole picture, such as the legend.
 *
 * @param {Object} state
 * @param {{ visualisationName: string, data: *, paneId?: string }} payload - Without
 *   `paneId`, the data goes on the page copy only.
 * @returns {{ visualisations: Object, paneData: Object }}
 */
export function applyPaneData(state, { visualisationName, data, paneId }) {
  const vis = state.visualisations[visualisationName];
  const paneData = state.paneData ?? {};
  if (!paneId) {
    return {
      paneData,
      visualisations: { ...state.visualisations, [visualisationName]: { ...vis, data } },
    };
  }

  const nextPaneData = {
    ...paneData,
    [paneId]: { ...(paneData[paneId] ?? {}), [visualisationName]: data },
  };
  const showing = panesShowing(gridOf(state), { visualisation: visualisationName });
  const others = showing.filter((id) => id !== paneId);
  const combined =
    others.length === 0
      ? data
      : showing.flatMap((id) => {
          const paneValue = nextPaneData[id]?.[visualisationName];
          return Array.isArray(paneValue) ? paneValue : [];
        });

  return {
    paneData: nextPaneData,
    visualisations: { ...state.visualisations, [visualisationName]: { ...vis, data: combined } },
  };
}

/**
 * Sets a parameter in a parameterised layer's tile path.
 *
 * Layers opt in to separate paths per pane with `separatePanePaths` (or the older
 * `separateSidePaths`); a filter targeting only some of the panes showing the layer then
 * changes only those panes' tiles. Other layers have one path, which every filter changes.
 *
 * @param {Object} layer - The layer in state.
 * @param {Object} state
 * @param {{ paramName: string, value: *, panes: string[]|null }} args
 * @returns {Object} The updated layer.
 */
export function applyLayerParam(layer, state, { layerName, paramName, value, panes }) {
  const params = { [paramName]: value };
  const withoutParam = (list) => (list || []).filter((param) => param !== paramName);

  if (!(layer.separatePanePaths || layer.separateSidePaths)) {
    return {
      ...layer,
      path: updateUrlParameters(layer.pathTemplate, layer.path, params),
      missingParams: withoutParam(layer.missingParams),
    };
  }

  const { showing, targets, coversAll } = targetsAmong(
    panesShowing(gridOf(state), { layer: layerName }),
    panes
  );
  const panePaths = { ...(layer.panePaths ?? Object.fromEntries(showing.map((id) => [id, layer.path]))) };
  const paneMissingParams = {
    ...(layer.paneMissingParams ??
      Object.fromEntries(showing.map((id) => [id, layer.missingParams || []]))),
  };
  targets.forEach((id) => {
    panePaths[id] = updateUrlParameters(layer.pathTemplate, panePaths[id] ?? layer.path, params);
    paneMissingParams[id] = withoutParam(paneMissingParams[id] ?? layer.missingParams);
  });

  return {
    ...layer,
    path: coversAll ? updateUrlParameters(layer.pathTemplate, layer.path, params) : layer.path,
    panePaths,
    paneMissingParams,
    // The layer is added once no pane showing it is missing anything.
    missingParams: [...new Set(showing.flatMap((id) => paneMissingParams[id] ?? []))],
  };
}

/**
 * Registers or replaces a pane's map. `state.map` follows the primary pane's map.
 *
 * @returns {{ mapsByPane: Object, map: Object|null }}
 */
export function setPaneMap(state, { paneId, map }) {
  const mapsByPane = { ...(state.mapsByPane ?? {}), [paneId]: map };
  return { mapsByPane, map: primaryMap(state, mapsByPane) };
}

/**
 * Unregisters a pane's map, unless another map has replaced it in the meantime.
 *
 * @returns {{ mapsByPane: Object, map: Object|null }}
 */
export function removePaneMap(state, { paneId, map }) {
  const current = state.mapsByPane ?? {};
  if (!(paneId in current) || (map && current[paneId] !== map)) {
    return { mapsByPane: current, map: state.map ?? null };
  }
  const { [paneId]: _removed, ...mapsByPane } = current;
  return { mapsByPane, map: primaryMap(state, mapsByPane) };
}

function primaryMap(state, mapsByPane) {
  const grid = gridOf(state);
  return mapsByPane[grid.primaryPaneId] ?? grid.paneIds.map((id) => mapsByPane[id]).find(Boolean) ?? null;
}
