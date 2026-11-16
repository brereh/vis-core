import { useEffect, useState, useCallback } from "react";
import { useMapContext } from "./useMapContext";
import { selectMaps } from "../reducers/mapSelectors";

/**
 * Custom hook to generate a message for layers that are not visible due to zoom level.
 * @returns {string} A message indicating which layers need zooming in or out to be visible.
 */
export const useLayerZoomMessage = () => {
  const { state } = useMapContext();
  const [zoomMessage, setZoomMessage] = useState("");

  const getVisibleLayers = useCallback(() => {
    const maps = selectMaps(state);
    if (maps.length > 0) {
      const newLayers = maps[0].getStyle().layers;
      // Only report on app-configured layers (from state.layers), not base map
      // provider layers (e.g. Geoapify Positron/Dark Matter landcover, roads, etc.).
      // App layer IDs either exactly match a state layer name or start with one
      // followed by a dash (for sub-layers such as ${name}-outline, ${name}-fill).
      const stateLayerIds = Object.keys(state.layers ?? {});
      return newLayers.filter(
        (layer) =>
          stateLayerIds.some(
            (id) => layer.id === id || layer.id.startsWith(`${id}-`)
          ) &&
          !layer.id.endsWith("-hover") &&
          !layer.id.endsWith("-hover-halo") &&
          layer.id !== "selected-feature-layer" &&
          !layer.id.startsWith("gl-draw")
      );
    }
    return [];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.mapsByPane, state.map, state.mapGrid, state.layers]);

  useEffect(() => {
    const updateZoomMessage = () => {
      const currentZoom = state.currentZoom; // Use the current zoom level from the state
      const layers = getVisibleLayers();

      const zoomInLayers = [];
      const zoomOutLayers = [];

      layers.forEach(layer => {
        const minZoom = layer.minzoom || 0;
        const maxZoom = layer.maxzoom || 24;

        if (currentZoom < minZoom) {
          zoomInLayers.push(layer.id);
        } else if (currentZoom > maxZoom) {
          zoomOutLayers.push(layer.id);
        }
      });

      let message = "";
      if (zoomInLayers.length > 0) {
        const layerNames = zoomInLayers.join(' and ');
        message += `Zoom in to see ${layerNames} layer${zoomInLayers.length > 1 ? 's' : ''}. `;
      }
      if (zoomOutLayers.length > 0) {
        const layerNames = zoomOutLayers.join(' and ');
        message += `Zoom out to see ${layerNames} layer${zoomOutLayers.length > 1 ? 's' : ''}.`;
      }

      setZoomMessage(message.trim());
    };

    // Initial check
    updateZoomMessage();

  }, [state.currentZoom, state.layers, getVisibleLayers]);

  return zoomMessage;
};
