/**
 * Hover tooltips on one map: which feature is hovered, its `hover` feature state, the
 * popup, and the delayed fetch of custom tooltip data.
 *
 * Each map keeps its own session (`createHoverSession`), so maps shown side by side never
 * disturb each other's hover state or popups.
 */
import maplibregl from "maplibre-gl";
import { syncHoverLayers } from "../hoverStyle";
import { queryNearestRenderedFeatures } from "../hoverPicking";
import {
  buildTooltip,
  fetchCustomTooltip,
  mergeTooltip,
  tooltipFeatures,
  TOOLTIP_DIVIDER,
} from "./tooltipContent";

/** Delay before custom tooltip data is fetched, so passing over features doesn't fetch. */
export const CUSTOM_TOOLTIP_DELAY_MS = 100;

/** Gap between the cursor and the tooltip, so the tooltip doesn't sit on the hovered feature. */
export const HOVER_POPUP_OFFSET = 14;

/**
 * The rendered features the pointer is hovering on this map: nearest to the pointer first,
 * with the feature already hovered kept while the pointer stays close to it (see
 * map/hoverPicking.js).
 *
 * @param {Object} map - MapLibre map.
 * @param {Object} session - This map's hover session.
 * @param {{ x: number, y: number }} point - Pointer position on this map.
 * @param {string[]} layerIds - Layers to search.
 * @param {number} tolerance - How far from the pointer a feature may be, in pixels.
 * @param {(feature: Object) => boolean} isCandidate - Features that would get a hover.
 * @returns {Object[]}
 */
export function queryHoverFeatures(map, session, point, layerIds, tolerance, isCandidate) {
  const isCurrent = session.hovered.length
    ? (feature) =>
        session.hovered.some(
          (target) => target.layerId === feature.layer?.id && target.featureId === feature.id
        )
    : null;
  return queryNearestRenderedFeatures(map, point, layerIds, tolerance, isCandidate, isCurrent);
}

/**
 * Creates the hover state for one map.
 *
 * @returns {{ popup: Object|null, abortController: AbortController|null,
 *   timeoutId: number|null, hovered: Object[], eventId: number }}
 */
export function createHoverSession() {
  return { popup: null, abortController: null, timeoutId: null, hovered: [], eventId: 0 };
}

/** Cancels a scheduled or in-flight custom tooltip fetch. */
export function cancelTooltipFetch(session) {
  if (session.abortController) {
    session.abortController.abort();
    session.abortController = null;
  }
  if (session.timeoutId) {
    clearTimeout(session.timeoutId);
    session.timeoutId = null;
  }
}

/** Removes the tooltip popup and cancels its fetch. */
export function removeTooltip(session) {
  cancelTooltipFetch(session);
  if (session.popup) {
    session.popup.remove();
    session.popup = null;
  }
}

/** Feature-state targets for the given features. */
export function hoverTargets(features) {
  return features.map((feature) => ({
    layerId: feature.layer.id,
    featureId: feature.id,
    source: feature.layer.source,
    sourceLayer: feature.layer["source-layer"],
  }));
}

const sameTarget = (a, b) => a.layerId === b.layerId && a.featureId === b.featureId;

/** Whether two target lists name the same features in the same order. */
export function sameTargets(previous, current) {
  return (
    previous.length === current.length &&
    previous.every((target, index) => sameTarget(target, current[index]))
  );
}

// Features without an id can't carry feature state; they still get a tooltip.
const setHover = (map, { source, sourceLayer, featureId }, hover) => {
  if (featureId == null) return;
  map.setFeatureState({ source, id: featureId, sourceLayer }, { hover });
};

/**
 * Moves the `hover` feature state from the previous targets to the current ones, touching
 * only features whose state changes.
 */
export function updateHoverState(map, previous, current) {
  previous
    .filter((target) => !current.some((other) => sameTarget(other, target)))
    .forEach((target) => setHover(map, target, false));
  current
    .filter((target) => !previous.some((other) => sameTarget(other, target)))
    .forEach((target) => {
      // Match the highlight to the layer's current width or size before showing it.
      syncHoverLayers(map, target.layerId);
      setHover(map, target, true);
    });
}

/** Removes the tooltip and the `hover` state of whatever was hovered. */
export function clearHover(map, session) {
  removeTooltip(session);
  session.hovered.forEach((target) => setHover(map, target, false));
  session.hovered = [];
}

/**
 * Opens the tooltip popup and, if parts of it come from the API, fetches them after a short
 * delay and fills them in, unless the pointer has moved to another feature by then.
 */
function openTooltip({ map, session, lngLat, sections, requests, layers }) {
  if (sections.length === 0) return;

  session.popup = new maplibregl.Popup({
    className: "custom-popup",
    closeButton: false,
    closeOnClick: false,
    closeOnMove: false,
    offset: HOVER_POPUP_OFFSET,
  })
    .setLngLat(lngLat)
    .setHTML(sections.join(TOOLTIP_DIVIDER))
    .addTo(map);

  if (!requests.some(Boolean)) return;

  const eventId = session.eventId;
  session.timeoutId = setTimeout(() => {
    session.timeoutId = null;
    const controller = new AbortController();
    session.abortController = controller;
    Promise.all(
      requests.map((request) =>
        request ? fetchCustomTooltip(request, layers, controller.signal) : Promise.resolve(undefined)
      )
    ).then((results) => {
      if (session.eventId !== eventId || !session.popup) return;
      session.popup.setHTML(mergeTooltip(sections, requests, results));
    });
  }, CUSTOM_TOOLTIP_DELAY_MS);
}

/**
 * Shows the tooltip for the top-most of `features` on this map, or clears it if none of
 * them should have one. Staying on the same feature only moves the popup.
 *
 * @param {Object} args
 * @param {Object} args.map - MapLibre map.
 * @param {Object} args.session - From `createHoverSession`, for this map.
 * @param {Object[]} args.features - Candidate features under the pointer, top-most first.
 * @param {{ lng: number, lat: number }} args.lngLat - Where to anchor the popup.
 * @param {Object<string, Object>} args.layers - Page layer config.
 * @param {Object<string, Object>} args.visualisations - Page visualisations.
 */
export function showHoverTooltip({ map, session, features, lngLat, layers, visualisations }) {
  const hovered = tooltipFeatures(features, layers).slice(0, 1);
  if (hovered.length === 0) {
    clearHover(map, session);
    return;
  }

  const targets = hoverTargets(hovered);
  updateHoverState(map, session.hovered, targets);

  if (sameTargets(session.hovered, targets)) {
    session.popup?.setLngLat(lngLat);
    return;
  }

  session.hovered = targets;
  session.eventId += 1;
  removeTooltip(session);

  const { sections, requests } = buildTooltip({ features: hovered, layers, visualisations });
  openTooltip({ map, session, lngLat, sections, requests, layers });
}
