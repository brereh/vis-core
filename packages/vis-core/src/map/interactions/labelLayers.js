/**
 * Name labels for layers with `shouldHaveLabel`, shown only above a zoom level.
 */

/** Zoom above which labels show when the layer doesn't set `labelZoomLevel`. */
export const DEFAULT_LABEL_ZOOM_LEVEL = 12;

/** Id of the label layer generated for a layer. */
export const labelLayerId = (layerId) => `${layerId}-label`;

/**
 * Shows or hides a layer's name labels for the map's current zoom, creating the label
 * layer the first time it is needed.
 *
 * The label layer is created from the layer's source features, so its placement follows
 * their geometry: along lines, or at points otherwise. Until the source has features loaded
 * nothing is created, and the next call tries again.
 *
 * @param {Object} map - MapLibre map.
 * @param {Object} options
 * @param {string} options.layerId - The labelled layer (also its source id).
 * @param {string} [options.sourceLayer] - Vector source layer.
 * @param {number} [options.labelZoomLevel] - Labels show above this zoom.
 * @param {boolean} [options.labelNulls] - Also label features whose `value` state is null.
 */
export function updateLabelLayer(map, { layerId, sourceLayer, labelZoomLevel, labelNulls }) {
  const id = labelLayerId(layerId);

  if (map.getZoom() <= labelZoomLevel) {
    if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", "none");
    return;
  }

  if (map.getLayer(id)) {
    map.setLayoutProperty(id, "visibility", "visible");
    return;
  }

  const features = map.querySourceFeatures(layerId, { sourceLayer });
  if (features.length === 0) return;

  const geometryType = features[0].geometry.type;
  const symbolPlacement =
    geometryType === "LineString" || geometryType === "MultiLineString" ? "line" : "point";

  map.addLayer({
    id,
    type: "symbol",
    source: layerId,
    "source-layer": sourceLayer,
    layout: {
      "text-field": ["get", "name"],
      "text-size": 14,
      "text-anchor": "center",
      "text-offset": [0, 1.5],
      "text-allow-overlap": false,
      "symbol-placement": symbolPlacement,
      "symbol-spacing": 250,
    },
    paint: {
      "text-color": "#000000",
      "text-halo-color": "#ffffff",
      "text-halo-width": 2.5,
      "text-opacity": labelNulls
        ? 1
        : ["case", ["in", ["feature-state", "value"], ["literal", [null]]], 0, 1],
    },
  });
}

/**
 * The label settings of each labelled layer in the page config.
 *
 * @param {Object<string, Object>} layers - Page layer config.
 * @returns {Array<{ layerId: string, sourceLayer: string, labelZoomLevel: number, labelNulls: boolean }>}
 */
export function labelledLayers(layers) {
  return Object.keys(layers)
    .filter((layerId) => layers[layerId].shouldHaveLabel)
    .map((layerId) => ({
      layerId,
      sourceLayer: layers[layerId].sourceLayer,
      labelZoomLevel: layers[layerId].labelZoomLevel || DEFAULT_LABEL_ZOOM_LEVEL,
      labelNulls: layers[layerId].labelNulls,
    }));
}
