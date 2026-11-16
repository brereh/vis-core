/**
 * Highlighting the feature picked by a map-click filter.
 */

import { SELECTED_COLOURS, syncHoverLayers } from "../hoverStyle";

export const SELECTED_FEATURE_LAYER = "selected-feature-layer";
export const SELECTED_FEATURE_SOURCE = "selected-feature-source";

/** Paint for the GeoJSON fallback highlight, by layer type. */
const FALLBACK_PAINT = {
  circle: {
    "circle-radius": 6,
    "circle-opacity": 0,
    "circle-stroke-width": 2.5,
    "circle-stroke-color": SELECTED_COLOURS.light.core,
  },
  fill: {
    "fill-color": SELECTED_COLOURS.light.core,
    "fill-opacity": 0.5,
  },
};

/** The feature-state target of a rendered feature. */
export function featureStateTarget(feature) {
  return {
    source: feature.layer.source,
    ...(feature.layer["source-layer"] && { sourceLayer: feature.layer["source-layer"] }),
    id: feature.id,
  };
}

/**
 * Replaces the selection highlight on a map with the given feature, or just removes it when
 * there is no feature.
 *
 * A feature with an id is selected through feature state, which the layer's own `-select`
 * layer draws. That draws the whole feature, not the tile-clipped piece, and is cheap: adding
 * a layer on an existing vector source would make MapLibre reload every tile of it. Features
 * without an id fall back to a GeoJSON copy in a temporary layer.
 *
 * @param {Object} map - MapLibre map.
 * @param {Object|null} feature - The rendered feature to highlight, or null to clear.
 * @param {Object|null} previous - The target this returned last time for this map, if any.
 * @returns {Object|null} The feature-state target now selected, to pass back as `previous`.
 */
export function highlightSelectedFeature(map, feature, previous) {
  if (previous && map.getSource(previous.source)) {
    map.setFeatureState(previous, { selected: false });
  }
  if (map.getLayer(SELECTED_FEATURE_LAYER)) map.removeLayer(SELECTED_FEATURE_LAYER);
  if (map.getSource(SELECTED_FEATURE_SOURCE)) map.removeSource(SELECTED_FEATURE_SOURCE);
  if (!feature) return null;

  if (feature.id != null && feature.layer.source) {
    const target = featureStateTarget(feature);
    // Match the highlight to the layer's current width or size before showing it.
    syncHoverLayers(map, feature.layer.id);
    map.setFeatureState(target, { selected: true });
    return target;
  }

  map.addSource(SELECTED_FEATURE_SOURCE, { type: "geojson", data: feature.toJSON() });
  map.addLayer({
    id: SELECTED_FEATURE_LAYER,
    type: feature.layer.type,
    source: SELECTED_FEATURE_SOURCE,
    paint: FALLBACK_PAINT[feature.layer.type] ?? {},
  });
  return null;
}
