/**
 * Hover tooltips on one map: which feature is hovered, its `hover` feature state, the
 * popup, and the delayed fetch of custom tooltip data.
 *
 * Each map keeps its own session (`createHoverSession`), so maps shown side by side never
 * disturb each other's hover state or popups.
 */
import maplibregl from "maplibre-gl";
import {
  buildTooltip,
  fetchCustomTooltip,
  mergeTooltip,
  tooltipFeatures,
  TOOLTIP_DIVIDER,
} from "./tooltipContent";

/** Delay before custom tooltip data is fetched, so passing over features doesn't fetch. */
export const CUSTOM_TOOLTIP_DELAY_MS = 100;

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

const setHover = (map, { source, sourceLayer, featureId }, hover) =>
  map.setFeatureState({ source, id: featureId, sourceLayer }, { hover });

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
    .forEach((target) => setHover(map, target, true));
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
