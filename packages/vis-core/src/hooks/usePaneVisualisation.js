import { useMemo, useRef } from "react";
import { mergeOverrides } from "../reducers/mapSelectors";

/**
 * A visualisation as a map pane draws it (see `selectPaneVisualisation`), with a stable
 * identity: the result only changes when the page's copy or the pane's own params do. Code
 * keyed on the visualisation object, such as the data fetch, doesn't re-run otherwise.
 *
 * @param {Object} state - Map state.
 * @param {string} paneId
 * @param {string} visualisationName
 * @returns {Object|undefined}
 */
export function usePaneVisualisation(state, paneId, visualisationName) {
  const visualisation = state.visualisations?.[visualisationName];
  const overrides = state.paneOverrides?.[paneId]?.[visualisationName];
  return useMemo(() => mergeOverrides(visualisation, overrides), [visualisation, overrides]);
}

/**
 * Returns the previous array while its items are the same objects as the new one's, so an
 * array rebuilt on every render can be used as a hook dependency.
 *
 * @param {Array} items
 * @returns {Array}
 */
export function useShallowStableArray(items) {
  const ref = useRef(items);
  const previous = ref.current;
  const same =
    previous.length === items.length && previous.every((item, index) => item === items[index]);
  if (!same) ref.current = items;
  return ref.current;
}
