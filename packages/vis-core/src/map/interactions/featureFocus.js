/**
 * Moving a map to a feature chosen in a select-and-pan filter (`state.mapBoundsAndCentroid`).
 */

const DEFAULT_MAX_ZOOM = 14;
const DEFAULT_DURATION_MS = 1000;

/** How long the temporary feature label stays up. */
export const FEATURE_LABEL_DURATION_MS = 5000;
export const FEATURE_LABEL_LAYER = "feature-label";
export const FEATURE_LABEL_SOURCE = "feature-label-source";

/**
 * Padding for fitting a feature: smaller features get more, so they don't fill the view.
 *
 * @param {number} span - The larger of the feature's longitude and latitude spans, in degrees.
 * @returns {number} Pixels.
 */
export function focusPadding(span) {
  if (span < 0.01) return 150;
  if (span < 0.05) return 120;
  return 100;
}

/**
 * Works out how to show the feature: fit its bounds if it has them, otherwise pan to its
 * centroid.
 *
 * @param {Object} focus - `state.mapBoundsAndCentroid`.
 * @param {Object} [focus.bounds] - GeoJSON polygon.
 * @param {Object} [focus.centroid] - GeoJSON point.
 * @param {Object} [focus.layerMetadata] - May set zoomToFeatureMaxZoom, zoomToFeatureDuration,
 *   zoomToFeatureLinear.
 * @returns {{ method: "fitBounds", bounds: number[][], options: Object }
 *   | { method: "panTo", center: number[], options: Object } | null}
 */
export function planFeatureFocus({ bounds, centroid, layerMetadata = {} } = {}) {
  const duration = layerMetadata.zoomToFeatureDuration ?? DEFAULT_DURATION_MS;

  if (bounds && centroid) {
    const coords = bounds.coordinates[0];
    const lngs = coords.map((c) => c[0]);
    const lats = coords.map((c) => c[1]);
    const minLng = Math.min(...lngs);
    const maxLng = Math.max(...lngs);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    return {
      method: "fitBounds",
      bounds: [
        [minLng, minLat],
        [maxLng, maxLat],
      ],
      options: {
        padding: focusPadding(Math.max(maxLng - minLng, maxLat - minLat)),
        maxZoom: layerMetadata.zoomToFeatureMaxZoom ?? DEFAULT_MAX_ZOOM,
        duration,
        linear: layerMetadata.zoomToFeatureLinear ?? false,
      },
    };
  }

  if (centroid) {
    return { method: "panTo", center: centroid.coordinates, options: { duration } };
  }

  return null;
}

/**
 * Moves the map to the feature.
 *
 * @param {Object} map - MapLibre map.
 * @param {Object} focus - `state.mapBoundsAndCentroid`.
 * @returns {boolean} Whether the map was moved.
 */
export function focusFeature(map, focus) {
  const plan = planFeatureFocus(focus);
  if (!plan) return false;
  if (plan.method === "fitBounds") map.fitBounds(plan.bounds, plan.options);
  else map.panTo(plan.center, plan.options);
  return true;
}

const removeFeatureLabel = (map) => {
  if (map.getLayer(FEATURE_LABEL_LAYER)) map.removeLayer(FEATURE_LABEL_LAYER);
  if (map.getSource(FEATURE_LABEL_SOURCE)) map.removeSource(FEATURE_LABEL_SOURCE);
};

/**
 * Shows the feature's name at its centroid for a few seconds, replacing any label still up.
 *
 * @param {Object} map - MapLibre map.
 * @param {Object} args
 * @param {string} args.featureName
 * @param {Object} args.centroid - GeoJSON point.
 * @param {{ current: number|null }} args.timeoutRef - Holds the pending removal, per map.
 */
export function showFeatureLabel(map, { featureName, centroid, timeoutRef }) {
  if (timeoutRef.current) {
    clearTimeout(timeoutRef.current);
    timeoutRef.current = null;
  }
  removeFeatureLabel(map);

  map.addSource(FEATURE_LABEL_SOURCE, {
    type: "geojson",
    data: {
      type: "Feature",
      geometry: { type: "Point", coordinates: centroid.coordinates },
      properties: { name: featureName },
    },
  });
  map.addLayer({
    id: FEATURE_LABEL_LAYER,
    type: "symbol",
    source: FEATURE_LABEL_SOURCE,
    layout: {
      "text-field": ["get", "name"],
      "text-font": ["Noto Sans Bold"],
      "text-size": 14,
      "text-offset": [0, 1.5],
      "text-anchor": "top",
      "text-allow-overlap": true,
      "text-ignore-placement": true,
    },
    paint: {
      "text-color": "#000000",
      "text-halo-color": "#ffffff",
      "text-halo-width": 2,
      "text-opacity": 1,
    },
  });

  timeoutRef.current = setTimeout(() => {
    removeFeatureLabel(map);
    timeoutRef.current = null;
  }, FEATURE_LABEL_DURATION_MS);
}
