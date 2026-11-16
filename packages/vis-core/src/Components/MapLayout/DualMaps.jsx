import "maplibre-gl/dist/maplibre-gl.css";
import React, { useCallback, useEffect, useRef } from "react";
import styled from "styled-components";

import { DynamicLegend } from "Components/DynamicLegend/DynamicLegend";
import { useDualMaps } from "hooks/useDualMaps";
import { useMapContext } from "hooks/useMapContext";
import { useFilterContext } from "hooks/useFilterContext";
import maplibregl from "maplibre-gl";

import { useBaseMapTransition } from "hooks/useBaseMapTransition";
import { getBaseMap } from "../../map/baseMaps";
import {
  bufferedBox,
  hoverableLayerIds,
  hoverBufferSize,
  isHoverCandidate,
  layerClickHtml,
} from "../../map/interactions/tooltipContent";
import {
  clearHover,
  createHoverSession,
  queryHoverFeatures,
  showHoverTooltip,
} from "../../map/interactions/hoverTooltip";
import { labelledLayers, updateLabelLayer } from "../../map/interactions/labelLayers";
import { focusFeature } from "../../map/interactions/featureFocus";
import { highlightSelectedFeature } from "../../map/interactions/selectionHighlight";
import "./MapLayout.css";
import { VisualisationManager } from "./VisualisationManager";
import { Layer } from './Layer'
import MapStyleToggle from "./MapStyleToggle";

const Wrap = styled.div`
  display: flex;
  height: 100%;
  width: 100%;
  @media ${props => props.theme.mq.mobile} {
    flex-direction: column;
    height: auto; /* let content dictate height */
  }
`;

const StyledMapContainer = styled.div`
  position: relative;
  width: 50%;
  height: 100%;
  overflow: hidden;

  /* make the map fill the slot */
  .maplibregl-map {
    position: absolute;
    inset: 0;
  }

  @media ${props => props.theme.mq.mobile} {
    width: 100%;
    height: 100%;    /* <-- give it real height so the map isn't 0px tall */

    & .maplibregl-map,
    & .maplibregl-map canvas {
      position: absolute;
      inset: 0;
      width: 100% !important;
      height: 100% !important;
      display: block;
    }
  }
`;

const SIDES = ["left", "right"];

/**
 * DualMaps component that renders two synchronized maps side by side using MapLibre GL and handles layers,
 * including hover and click interactions.
 *
 * @returns {JSX.Element} The rendered DualMaps component.
 */
const DualMaps = (props) => {
  const leftMapContainerRef = useRef(null);
  const rightMapContainerRef = useRef(null);
  const { state, dispatch } = useMapContext();
  const { baseMapId, mapStyle, mapCentre, mapZoom } = state;
  const currentBaseMap = getBaseMap(baseMapId);
  const { leftMap, rightMap, isMapReady } = useDualMaps(
    leftMapContainerRef,
    rightMapContainerRef,
    mapStyle,
    mapCentre,
    mapZoom,
    props.extraCopyrightText
  );

  const activeMaps = React.useMemo(
    () => [leftMap, rightMap].filter(Boolean),
    [leftMap, rightMap]
  );

  // Shared transition coordinator: same hook as Map.jsx, just with two maps.
  useBaseMapTransition({
    maps: activeMaps,
    descriptor: currentBaseMap,
    applicationLayers: state.layers,
  });

  const { dispatch: filterDispatch } = useFilterContext();

  // Memoised so the callbacks and effects that depend on it don't re-run on every render.
  const maps = React.useMemo(() => ({ left: leftMap, right: rightMap }), [leftMap, rightMap]);
  const popups = { left: null, right: null };

  // Each side's hover state: hovered feature, popup and pending custom-tooltip fetch.
  const hoverSessionsRef = useRef({ left: createHoverSession(), right: createHoverSession() });
  // Feature-state target of each side's clicked feature, so the next click can unselect it.
  const selectedFeatureRef = useRef({ left: null, right: null });

  /**
   * Shows the hover tooltip on both maps. The feature under the pointer is looked up on each
   * map at the same location, so each side's tooltip shows that side's feature and value.
   *
   * @param {Object} e - Map event with `point` and `lngLat`.
   * @param {string} mapType - The side the pointer is on ('left' or 'right').
   */
  const handleMapHover = useCallback(
    (e, mapType) => {
      if (!maps.left || !maps.right || !e.point) return;
      const sessions = hoverSessionsRef.current;

      const hoverable = hoverableLayerIds(maps[mapType], state.layers);
      if (hoverable.length === 0) {
        SIDES.forEach((side) => clearHover(maps[side], sessions[side]));
        return;
      }

      const buffer = hoverBufferSize(hoverable, state.layers);
      SIDES.forEach((side) => {
        const map = maps[side];
        // Nearest feature first, so the feature under the pointer beats a neighbour that is
        // merely within tolerance. Features that would not get a hover don't end the search.
        const point = map.project(e.lngLat);
        const queried = bufferedBox(point, buffer)
          ? queryHoverFeatures(map, sessions[side], point, hoverable, buffer, (feature) =>
              isHoverCandidate(feature, state.layers)
            )
          : [];
        // Only features with an id can carry hover state across the two maps.
        const features = (queried || []).filter((f) => f && f.id != null);
        showHoverTooltip({
          map,
          session: sessions[side],
          features,
          lngLat: e.lngLat,
          layers: state.layers,
          visualisations: state.visualisations,
        });
      });
    },
    [maps, state.layers, state.visualisations]
  );

  /**
   * Opens a popup for the feature of `layerId` at the clicked location, on both maps.
   */
  const handleLayerClick = (e, layerId, bufferSize) => {
    SIDES.forEach((side) => {
      const map = maps[side];

      if (popups[side]?.[layerId]?.length) {
        popups[side][layerId].forEach((popup) => popup.remove());
        popups[side][layerId] = [];
      }

      const box = bufferedBox(map.project(e.lngLat), bufferSize);
      const features = box ? map.queryRenderedFeatures(box, { layers: [layerId] }) : [];

      if (features.length !== 0) {
        const newPopup = new maplibregl.Popup()
          .setLngLat(e.lngLat)
          .setHTML(layerClickHtml(features[0]))
          .addTo(map);
        if (!popups[side]) {
          popups[side] = {};
        }
        if (!popups[side][layerId]) {
          popups[side][layerId] = [];
        }
        popups[side][layerId].push(newPopup);
      }
    });
  };

  // Hover: one mousemove listener per map, registered once, calling the latest handleMapHover
  // through a ref and coalescing moves to one per animation frame. handleMapHover works out the
  // hoverable layers itself, so it doesn't need a listener per layer, nor re-registering whenever
  // the layers or visualisations change.
  const handleMapHoverRef = useRef(handleMapHover);
  handleMapHoverRef.current = handleMapHover;

  useEffect(() => {
    if (!leftMap || !rightMap) return;

    const registrations = [];
    [["left", leftMap], ["right", rightMap]].forEach(([side, map]) => {
      let frameId = null;
      let lastEvent = null;
      const onMouseMove = (e) => {
        lastEvent = e;
        if (frameId !== null) return;
        frameId = requestAnimationFrame(() => {
          frameId = null;
          handleMapHoverRef.current(lastEvent, side);
        });
      };
      // A hover pass still pending when the mouse leaves would re-hover a feature after leaving.
      const cancelPendingHover = () => {
        if (frameId !== null) cancelAnimationFrame(frameId);
        frameId = null;
      };
      map.on("mousemove", onMouseMove);
      map.on("mouseout", cancelPendingHover);
      registrations.push(() => {
        map.off("mousemove", onMouseMove);
        map.off("mouseout", cancelPendingHover);
        cancelPendingHover();
      });
    });

    return () => registrations.forEach((unregister) => unregister());
  }, [leftMap, rightMap]);

  useEffect(() => {
    if (!maps.left || !maps.right) return;

    // Everything registered here is recorded so the cleanup removes exactly that.
    const registrations = [];
    const listen = (map, ...args) => {
      map.on(...args);
      registrations.push(() => map.off(...args));
    };

    const labels = labelledLayers(state.layers);
    SIDES.forEach((side) => {
      const map = maps[side];
      labels.forEach((label) => {
        listen(map, "zoomend", () => updateLabelLayer(map, label));
      });
    });

    Object.keys(state.layers).forEach((layerId) => {
      const layerData = state.layers[layerId];
      SIDES.forEach((side) => {
        const map = maps[side];
        if (layerData.shouldHaveTooltipOnHover || layerData.shouldHaveTooltipOnClick) {
          listen(map, "mouseenter", layerId, () => {
            map.getCanvas().style.cursor = "pointer";
          });
          listen(map, "mouseleave", layerId, () => {
            map.getCanvas().style.cursor = "grab";
          });
        }
        if (layerData.shouldHaveTooltipOnClick) {
          const bufferSize = layerData.bufferSize ?? 0;
          listen(map, "click", (e) => handleLayerClick(e, layerId, bufferSize));
        }
      });
    });

    return () => registrations.forEach((unregister) => unregister());
  }, [maps, state.layers, state.visualisations]);

  /**
   * Handles map click events for `type: "map"` filters.
   *
   * Each side takes the feature under the clicked point on its own map, so the two sides can use
   * different layers' features (e.g. different zoning systems) and each fetches its own data.
   * A side with no feature under the point is cleared: its selection highlight is removed and its
   * param is set to null. A click with no feature on either side is ignored.
   *
   * @property {Object} event - The event object containing information about the click event.
   */
  const handleMapClick = useCallback(
    (event) => {
      if (!isMapReady || !maps.left || !maps.right) return;

      const point = event.point;
      const clickedSide = event.target === maps.right ? "right" : "left";

      // Get all map filters
      const mapFilters = state.filters.filter(
        (filter) => filter.type === "map"
      );

      mapFilters.forEach((filter) => {
        const featureBySide = {};
        SIDES.forEach((side) => {
          featureBySide[side] =
            maps[side].queryRenderedFeatures(point, { layers: [filter.layer] })[0] ?? null;
        });

        if (!featureBySide.left && !featureBySide.right) return;

        const valueBySide = {};
        SIDES.forEach((side) => {
          const map = maps[side];
          const feature = featureBySide[side];
          const value = feature ? feature.properties[filter.field] : null;
          valueBySide[side] = value;

          selectedFeatureRef.current[side] = highlightSelectedFeature(
            map,
            feature,
            selectedFeatureRef.current[side]
          );

          filter.actions.forEach((action) => {
            dispatch({
              type: action.action,
              payload: { filter, value, sides: side },
            });
          });
        });

        // The filter holds one value, so show the clicked side's (or the other side's if the
        // clicked side had none).
        filterDispatch({
          type: 'SET_FILTER_VALUE',
          payload: {
            filterId: filter.id,
            value: valueBySide[clickedSide] ?? valueBySide[clickedSide === "left" ? "right" : "left"],
          },
        });
      });
    },
    [isMapReady, maps, state.filters, dispatch, filterDispatch]
  );

  // Run once to set the state of the map
  useEffect(() => {
    if (isMapReady) {
      dispatch({
        type: "SET_MAP",
        payload: { map: maps.left },
      });
      dispatch({
        type: "SET_DUAL_MAPS",
        payload: { maps: [maps.left, maps.right] },
      });
    }
  }, [isMapReady]);

  useEffect(() => {
    if (isMapReady & (state.filters.length > 0)) {
      const hasMapFilter = state.filters.some(
        (filter) => filter.type === "map"
      );
      if (hasMapFilter) {
        ["left", "right"].forEach((side) => {
          maps[side].on("click", handleMapClick);
        });
      }
    }

    return () => {
      if (maps.left && maps.right) {
        ["left", "right"].forEach((side) => {
          maps[side].off("click", handleMapClick);
        });
      }
    };
  }, [isMapReady, maps, handleMapClick]);

  // **Pan and centre** on a feature chosen by a select-and-pan filter, as Map.jsx does.
  // Only the left map is moved; the right map follows it through syncMaps.
  useEffect(() => {
    if (!leftMap || !state.mapBoundsAndCentroid) return;
    focusFeature(leftMap, state.mapBoundsAndCentroid);
    dispatch({ type: "CLEAR_BOUNDS_AND_CENTROID" });
  }, [leftMap, state.mapBoundsAndCentroid, dispatch]);

  useEffect(() => {
  if (!leftMap || !rightMap) return;

  const isNarrowViewport = window.matchMedia('(max-width: 900px)').matches;
  const hasCoarsePointer = window.matchMedia('(pointer: coarse)').matches ||
    window.matchMedia('(any-pointer: coarse)').matches;
  const hasFinePointer = window.matchMedia('(pointer: fine)').matches ||
    window.matchMedia('(any-pointer: fine)').matches;
  const isTouchOnlyMobile = isNarrowViewport && hasCoarsePointer && !hasFinePointer;

  if (isTouchOnlyMobile) {
    [leftMap, rightMap].forEach(m => {
      m.dragPan.enable();
      m.touchZoomRotate.enable();
      m.touchZoomRotate.disableRotation();
      m.scrollZoom.disable();
      m.doubleClickZoom.disable();
      m.boxZoom.disable();
      m.keyboard.disable();
    });
   }

  const roLeft = new ResizeObserver(() => leftMap.resize());
  const roRight = new ResizeObserver(() => rightMap.resize());

  if (leftMapContainerRef.current) roLeft.observe(leftMapContainerRef.current);
  if (rightMapContainerRef.current) roRight.observe(rightMapContainerRef.current);

  // Also force a resize when the media query flips
  const mq = window.matchMedia('(max-width: 900px)');
  const onChange = () => {
    leftMap.resize();
    rightMap.resize();
  };
  mq.addEventListener('change', onChange);

  return () => {
    roLeft.disconnect();
    roRight.disconnect();
    mq.removeEventListener('change', onChange);
  };
}, [leftMap, rightMap]);

  return (
    <Wrap>
      <StyledMapContainer ref={leftMapContainerRef}>
        {Object.values(state.layers).map((layer, index) => (
          <Layer key={layer.name || layer.id || index} layer={layer} />
        ))}
        {state.leftVisualisations && <VisualisationManager
            visualisationConfigs={state.leftVisualisations}
            map={maps.left}
            left={true}
          />}
      </StyledMapContainer>
      <StyledMapContainer ref={rightMapContainerRef}>
        {props.showMapStyleToggle && <MapStyleToggle map={rightMap} />}
        {Object.values(state.layers).map((layer, index) => (
          <Layer key={layer.name || layer.id || index} layer={layer} />
        ))}
        {state.rightVisualisations && <VisualisationManager
          visualisationConfigs={state.rightVisualisations}
          map={maps.right}
          left={false}
        />}
        {isMapReady &&
          (state.leftVisualisations[Object.keys(state.leftVisualisations)[0]]
            .data.length === 0 &&
          state.rightVisualisations[Object.keys(state.rightVisualisations)[0]]
            .data.length !== 0 ? (
            <DynamicLegend map={maps.right} />
          ) : state.leftVisualisations[Object.keys(state.leftVisualisations)[0]]
              .data.length !== 0 &&
            state.rightVisualisations[Object.keys(state.rightVisualisations)[0]]
              .data.length === 0 ? (
            <DynamicLegend map={maps.left} />
          ) : (
            <DynamicLegend map={maps.right} />
          ))}
      </StyledMapContainer>
    </Wrap>
  );
};

export default React.memo(DualMaps);
