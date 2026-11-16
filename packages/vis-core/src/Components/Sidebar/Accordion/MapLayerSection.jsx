import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AccordionSection } from "./AccordionSection";
import { useMapContext } from "hooks/useMapContext";
import { LayerControlEntry } from "./LayerControlEntry";
import { isApplicationLayer } from "utils";
import {
  isConfiguredApplicationLayer,
  getApplicationLayerRootId,
} from "../../../map/applicationLayerIds";
import { getInitialBaseSources } from "../../../map/baseSources";
import { selectMaps } from "../../../reducers/mapSelectors";

/**
 * MapLayerSection component represents a section for controlling map layers.
 *
 * @component
 * @param {Object} props - The component props.
 * @param {Function} props.handleColorChange - The function to handle color changes for the layers.
 * @param {Function} props.handleClassificationChange - The function to handle classification changes for the layers.
 * @param {Function} props.handleWidthFactorChange -
 * @returns {JSX.Element} The rendered MapLayerSection component.
 */
export const MapLayerSection = ({
  handleColorChange,
  handleClassificationChange,
  handleWidthFactorChange,
  handleCustomBandsChange,
}) => {
  const { state } = useMapContext();
  const maps = useMemo(
    () => selectMaps(state),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state.mapsByPane, state.map, state.mapGrid]
  );
  const [layers, setLayers] = useState([]);

  const updateLayers = useCallback(() => {
    if (maps.length > 0) {
      const style = maps[0].getStyle();
      if (!style || !style.layers) return;

      const newLayers = style.layers;
      const appLayerIds = state.layers ? Object.keys(state.layers) : [];
      const hasAppLayers = appLayerIds.length > 0;
      const fallbackBaseSourceIds = hasAppLayers
        ? null
        : (getInitialBaseSources(maps[0]) ?? new Set());

      const filteredLayers = newLayers.filter((layer) => {
        if (
          layer.type !== "fill" &&
          layer.type !== "line" &&
          layer.type !== "circle" &&
          layer.type !== "symbol"
        ) {
          return false;
        }

        if (
          layer.source === "default" ||
          layer.id === "selected-feature-layer" ||
          layer.id.startsWith("hide_") ||
          layer.id.startsWith("gl-draw")
        ) {
          return false;
        }

        if (layer.id !== getApplicationLayerRootId(layer.id)) {
          return false;
        }

        if (hasAppLayers) {
          return isConfiguredApplicationLayer(layer, state.layers);
        }

        return isApplicationLayer(layer, fallbackBaseSourceIds);
      });
      setLayers((prevLayers) => {
        if (
          prevLayers.length === filteredLayers.length &&
          prevLayers.every((layer, index) => {
            const next = filteredLayers[index];
            return (
              layer.id === next.id &&
              layer.type === next.type &&
              layer.metadata?.colorStyle === next.metadata?.colorStyle &&
              layer.metadata?.isStylable === next.metadata?.isStylable &&
              layer.layout?.visibility === next.layout?.visibility
            );
          })
        ) {
          return prevLayers;
        }
        return filteredLayers;
      });
    }
  }, [maps, state.layers]);

  const updateLayersRef = useRef(updateLayers);
  updateLayersRef.current = updateLayers;

  useEffect(() => {
    if (maps.length === 0) return undefined;

    updateLayersRef.current();

    const handleStyleData = () => {
      updateLayersRef.current();
    };

    maps.forEach((map) => {
      map?.on("styledata", handleStyleData);
    });

    return () => {
      maps.forEach((map) => {
        map?.off("styledata", handleStyleData);
      });
    };
  }, [maps]);

  useEffect(() => {
    updateLayers();
  }, [updateLayers]);

  if (maps.length === 0) {
    return <div>Loading map layers...</div>;
  }

  if (layers.length === 0) {
    return null;
  }

  return (
    <AccordionSection title="Map layer control">
      {layers.map((layer) => (
        <LayerControlEntry
          key={layer.id}
          layer={layer}
          maps={maps}
          handleColorChange={handleColorChange}
          handleClassificationChange={handleClassificationChange}
          handleWidthFactorChange={handleWidthFactorChange}
          handleCustomBandsChange={handleCustomBandsChange}
          state={state}
        />
      ))}
    </AccordionSection>
  );
};