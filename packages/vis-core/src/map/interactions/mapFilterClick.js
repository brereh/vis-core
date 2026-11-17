/**
 * Map-click filters (`type: "map"`): clicking a feature on a map sets the filter to that
 * feature's value.
 *
 * A click is shared across the clicked pane's sync group: every pane the filter targets in
 * that group takes the feature under the same location on its own map (each pane can show
 * different features there), highlights it, and gets the filter's actions with its own value.
 */
import { highlightSelectedFeature } from "./selectionHighlight";

/**
 * Applies a click to the page's map-click filters.
 *
 * - Each filter targets its own panes that are in the clicked pane's sync group.
 * - If the clicked pane's top-most feature on any filter layer belongs to another filter's
 *   layer, a filter targeting the clicked pane is skipped: the feature on top decides, as on
 *   a single map. Of several filters on the same layer, only the first applies to each pane
 *   (so a "Left …" and a "Right …" filter on one layer each still apply to their own pane).
 *   A pane the first filter cleared (no feature there) counts as handled for that layer too.
 * - If no target pane has a feature of the filter's layer there, nothing changes (selections
 *   stay, matching the filter value that is still applied).
 * - Otherwise, each target pane with a feature selects it and dispatches its value; each target
 *   pane without one clears its selection and dispatches null.
 * - The sidebar shows the clicked pane's value, or the first target pane's that isn't null.
 *
 * @param {Object} args
 * @param {string} args.sourcePaneId - The pane that was clicked.
 * @param {{ x: number, y: number }} args.point - The click on the clicked pane's map.
 * @param {{ lng: number, lat: number }} args.lngLat - The click's location.
 * @param {Object<string, Object>} args.groupMaps - Maps of the panes in the clicked pane's sync
 *   group, by pane id.
 * @param {Object[]} args.filters - The page's filters (with resolved `panes`).
 * @param {{ selection: Function, setSelection: Function }} args.selections - Where each pane's
 *   current selection is kept (the map group).
 * @param {Function} args.dispatch - Map reducer dispatch.
 * @param {Function} args.filterDispatch - Filter reducer dispatch.
 * @returns {boolean} Whether any filter changed.
 */
export function applyMapFilterClick({
  sourcePaneId,
  point,
  lngLat,
  groupMaps,
  filters,
  selections,
  dispatch,
  filterDispatch,
}) {
  const mapFilters = (filters ?? []).filter((filter) => filter.type === "map");
  const sourceMap = groupMaps[sourcePaneId];
  if (mapFilters.length === 0 || !sourceMap) return false;

  const groupPaneIds = Object.keys(groupMaps);
  const pointOn = (paneId) =>
    paneId === sourcePaneId ? point : groupMaps[paneId].project(lngLat);
  const featureAt = (paneId, layerId) => {
    const map = groupMaps[paneId];
    if (!map.getLayer(layerId)) return null;
    return map.queryRenderedFeatures(pointOn(paneId), { layers: [layerId] })[0] ?? null;
  };

  const sourceFilterLayers = [...new Set(mapFilters.map((f) => f.layer))].filter((id) =>
    sourceMap.getLayer(id)
  );
  const topLayer = sourceFilterLayers.length
    ? sourceMap.queryRenderedFeatures(point, { layers: sourceFilterLayers })[0]?.layer?.id
    : undefined;

  let changed = false;
  // Panes already given a value for a layer by an earlier filter, as "paneId|layer".
  const handled = new Set();
  const handledKey = (paneId, layerId) => `${paneId}|${layerId}`;
  mapFilters.forEach((filter) => {
    const filterPanes = filter.panes ?? groupPaneIds;
    const targets = groupPaneIds.filter(
      (id) => filterPanes.includes(id) && !handled.has(handledKey(id, filter.layer))
    );
    if (targets.length === 0) return;
    if (topLayer && filter.layer !== topLayer && targets.includes(sourcePaneId)) return;

    const featureByPane = Object.fromEntries(targets.map((id) => [id, featureAt(id, filter.layer)]));
    if (targets.every((id) => !featureByPane[id])) return;
    targets.forEach((id) => handled.add(handledKey(id, filter.layer)));

    const valueByPane = {};
    targets.forEach((paneId) => {
      const feature = featureByPane[paneId];
      const value = feature ? feature.properties?.[filter.field] : null;
      valueByPane[paneId] = value;

      selections.setSelection(
        paneId,
        highlightSelectedFeature(groupMaps[paneId], feature, selections.selection(paneId))
      );

      (filter.actions ?? []).forEach((action) => {
        dispatch({
          type: action.action,
          payload: { filter, value, panes: [paneId], ...action.payload },
        });
      });
    });

    const shownValue =
      valueByPane[sourcePaneId] ?? targets.map((id) => valueByPane[id]).find((v) => v != null);
    filterDispatch({ type: "SET_FILTER_VALUE", payload: { filterId: filter.id, value: shownValue } });
    changed = true;
  });

  return changed;
}
