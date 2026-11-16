import "maplibre-gl/dist/maplibre-gl.css";
import React, { useCallback, useEffect, useMemo, useRef } from "react";
import styled from "styled-components";

import { DynamicLegend } from "Components/DynamicLegend/DynamicLegend";
import { useMap } from "hooks/useMap";
import { useMapContext } from "hooks/useMapContext";
import { useFilterContext } from "hooks/useFilterContext";
import { actionTypes } from "reducers";
import maplibregl from "maplibre-gl";
import { VisualisationManager } from "./VisualisationManager";
import { Layer } from "./Layer";
import { SpiderLayer } from "./SpiderLayer";
import MapStyleToggle from "./MapStyleToggle";
import { useBaseMapTransition } from "hooks/useBaseMapTransition";
import { getBaseMap } from "../../map/baseMaps";
import { syncHoverLayers } from "../../map/hoverStyle";
import { isValidPoint } from "utils";
import {
  bufferedBox,
  hoverableLayerIds,
  hoverBufferSize,
  isHoverCandidate,
  layerClickHtml,
  spiderOverlayLayerIds,
  uniqueById,
} from "../../map/interactions/tooltipContent";
import {
  clearHover,
  createHoverSession,
  queryHoverFeatures,
  showHoverTooltip,
} from "../../map/interactions/hoverTooltip";
import { labelledLayers, updateLabelLayer } from "../../map/interactions/labelLayers";
import { focusFeature, showFeatureLabel } from "../../map/interactions/featureFocus";
import "./MapLayout.css";
import MapboxDraw from "@mapbox/mapbox-gl-draw";
import { RectangleMode } from "@ookla/mapbox-gl-draw-rectangle";
import debounce from "lodash.debounce";

const StyledMapContainer = styled.div`
  width: 100%;
  height: calc(100vh - 75px);
  @media ${props => props.theme.mq.mobile} {
   height: auto;             /* let content dictate height */
  }
`;

/**
 * Map component that renders a map using MapLibre GL and handles layers,
 * including hover and click interactions.
 *
 * @returns {JSX.Element} The rendered Map component.
 */
const Map = (props) => {
  const mapContainerRef = useRef(null);
  const { state, dispatch } = useMapContext();
  const { baseMapId, mapStyle, mapCentre, mapZoom } = state;
  const currentBaseMap = getBaseMap(baseMapId);
  const { map, isMapReady } = useMap(mapContainerRef, mapStyle, mapCentre, mapZoom, props.extraCopyrightText);

  const activeMaps = useMemo(() => [map].filter(Boolean), [map]);

  // Shared transition coordinator: handles setStyle, transformStyle, label policy
  // and repaint for every base-map change. First render is suppressed because the
  // map constructor already applied the initial style.
  useBaseMapTransition({
    maps: activeMaps,
    descriptor: currentBaseMap,
    applicationLayers: state.layers,
  });
  const { dispatch: filterDispatch } = useFilterContext();
  const popups = {};
  // Latest handleMapHover, so the mousemove listener always calls the current one.
  const handleMapHoverRef = useRef(null);
  const sidebarIsOpen = props.sidebarIsOpen
  
  // Hover state for this map: hovered feature, popup and pending custom-tooltip fetch.
  const hoverSessionRef = useRef(createHoverSession());

  // Keep track of previously selected features per layer
  const prevSelectedFeatures = useRef({});

  const memoizedFilters = useMemo(() => state.filters, [state.filters]);

  const lastTouchTimeRef = useRef(0);

  const lastViewportSignatureRef = useRef({});
  const labelTimeoutRef = useRef(null);

  // Single feature picker for map clicks
  const pickFeatureAtPoint = useCallback(
    (point) => {
      if (!map) return null;
      const filterLayers = memoizedFilters
        .filter((f) => f.type === "map")
        .map((f) => f.layer)
        .filter((id) => map.getLayer(id));

      if (filterLayers.length) {
        const hits = map.queryRenderedFeatures(point, { layers: filterLayers });
        if (hits.length) return hits[0]; // top-most feature on a filter layer
      }

      const otherLayers = Object.keys(state.layers).filter(
        (id) =>
          (state.layers[id].shouldHaveTooltipOnClick ||
            state.layers[id].shouldHaveTooltipOnHover) &&
          map.getLayer(id)
      );
      if (otherLayers.length) {
        const hits = map.queryRenderedFeatures(point, { layers: otherLayers });
        if (hits.length) return hits[0];
      }

      return null;
    },
    [map, memoizedFilters, state.layers]
  );

  // **Draw control logic
  useEffect(() => {
    if (!map) return ;

    const drawInstance = new MapboxDraw({
      displayControlsDefault: false,
      modes: {
        ...MapboxDraw.modes,
        draw_rectangle: RectangleMode,
      },
      controls: {},
      styles: [
        {
          id: "gl-draw-polygon-fill-inactive",
          type: "fill",
          filter: [
            "all",
            ["==", "active", "false"],
            ["==", "$type", "Polygon"],
            ["!=", "mode", "static"],
          ],
          paint: {
            "fill-color": "#007bff",
            "fill-outline-color": "#007bff",
            "fill-opacity": 0.3,
          },
        },
        {
          id: "gl-draw-polygon-fill-active",
          type: "fill",
          filter: [
            "all",
            ["==", "active", "true"],
            ["==", "$type", "Polygon"],
          ],
          paint: {
            "fill-color": "#007bff",
            "fill-outline-color": "#007bff",
            "fill-opacity": 0.3,
          },
        },
        {
          id: "gl-draw-polygon-stroke-inactive",
          type: "line",
          filter: [
            "all",
            ["==", "active", "false"],
            ["==", "$type", "Polygon"],
            ["!=", "mode", "static"],
          ],
          layout: {
            "line-cap": "round",
            "line-join": "round",
          },
          paint: {
            "line-color": "#007bff",
            "line-width": 2,
          },
        },
        {
          id: "gl-draw-polygon-stroke-active",
          type: "line",
          filter: [
            "all",
            ["==", "active", "true"],
            ["==", "$type", "Polygon"],
          ],
          layout: {
            "line-cap": "round",
            "line-join": "round",
          },
          paint: {
            "line-color": "#007bff",
            "line-width": 2,
          },
        },
      ],
    });

    map.addControl(drawInstance);
    dispatch(
      { type: 'SET_DRAW_INSTANCE', payload: drawInstance }
    );
    
  }, [map]); 


  /**
   * Shows the tooltip for the feature under the pointer, or clears it.
   *
   * Layers with click tooltips count as hoverable on touch devices, where a tap stands in for
   * hover. `forcedFeatures` skips the query and shows those features (used for taps, which
   * pick the exact feature themselves).
   *
   * @param {Object} e - Map event with `point` and `lngLat`.
   * @param {Object[]|null} [forcedFeatures]
   */
  const handleMapHover = useCallback(
    (e, forcedFeatures = null) => {
      if (!map || !isValidPoint(e?.point)) return;
      const session = hoverSessionRef.current;
      const isTouchOnMobile = window.matchMedia("(hover: none)").matches;

      let features;
      if (forcedFeatures && forcedFeatures.length) {
        features = forcedFeatures;
      } else {
        const hoverable = hoverableLayerIds(map, state.layers, {
          includeClickTooltips: isTouchOnMobile,
        });
        if (hoverable.length === 0) {
          clearHover(map, session);
          return;
        }

        // On touch devices, keep the hit box at least finger-sized.
        const isTouch = window.matchMedia("(hover: none), (pointer: coarse)").matches;
        const minimum = isTouch ? Math.round(6 * (window.devicePixelRatio || 1)) : 0;
        const buffer = hoverBufferSize(hoverable, state.layers, { minimum });
        if (!bufferedBox(e.point, buffer)) {
          console.warn("Invalid buffered point coordinates, skipping query:", e.point);
          return;
        }

        // Nearest feature first, so the feature under the pointer beats a neighbour that is
        // merely within tolerance. Features that would not get a hover don't end the search.
        const queried = queryHoverFeatures(
          map,
          session,
          e.point,
          [...hoverable, ...spiderOverlayLayerIds(map, state.layers)],
          buffer,
          (feature) => isHoverCandidate(feature, state.layers)
        );
        const valid = (queried || []).filter((f) => f && f.id != null && f.layer && f.layer.id);
        features = isTouchOnMobile ? valid.slice(0, 1) : uniqueById(valid);
      }

      showHoverTooltip({
        map,
        session,
        features,
        lngLat: e.lngLat,
        layers: state.layers,
        visualisations: state.visualisations,
      });
    },
    [map, state.layers, state.visualisations]
  );
  handleMapHoverRef.current = handleMapHover;

  /**
   * Opens a popup for the feature of `layerId` under a click, replacing that layer's last one.
   */
  const handleLayerClick = (e, layerId, bufferSize) => {
    if (popups[layerId]?.length) {
      popups[layerId].forEach((popup) => popup.remove());
      popups[layerId] = [];
    }
    const box = isValidPoint(e?.point) ? bufferedBox(e.point, bufferSize) : null;
    if (!box) return;
    const features = map.queryRenderedFeatures(box, { layers: [layerId] });
    if (features.length !== 0) {
      const newPopup = new maplibregl.Popup({ closeOnClick: false })
        .setLngLat(e.lngLat)
        .setHTML(layerClickHtml(features[0]))
        .addTo(map);
      if (!popups[layerId]) {
        popups[layerId] = [];
      }
      popups[layerId].push(newPopup);
    }
  };

  // **Set up click and zoom handlers**
  useEffect(() => {
    if (!map) return;
    const isTouch = window.matchMedia('(hover: none), (pointer: coarse)').matches;

    // Everything registered here is recorded so the cleanup removes exactly that. The cursor
    // handlers are layer-scoped, so MapLibre queries rendered features for each one on every
    // mouse move; left behind, they pile up each time the layers or visualisations change.
    const registrations = [];
    const listen = (...args) => {
      map.on(...args);
      registrations.push(() => map.off(...args));
    };

    labelledLayers(state.layers).forEach((label) => {
      listen("zoomend", () => updateLabelLayer(map, label));
    });

    Object.keys(state.layers).forEach((layerId) => {
      if (!isTouch && state.layers[layerId].shouldHaveTooltipOnClick) {
        const bufferSize = state.layers[layerId].bufferSize ?? 0;
        listen("click", (e) => handleLayerClick(e, layerId, bufferSize));
        listen("mouseenter", layerId, () => {
          map.getCanvas().style.cursor = "pointer";
        });
        listen("mouseleave", layerId, () => {
          map.getCanvas().style.cursor = "grab";
        });
      }
    });

    return () => {
      registrations.forEach((unregister) => unregister());
      Object.keys(popups).forEach((layerId) => {
        popups[layerId].forEach((popup) => popup.remove());
        popups[layerId] = [];
      });
    };
  }, [map, state.layers, state.visualisations]);

  /**
   * Handles map click events and dispatches actions based on the clicked feature.
   *
   * @property {Object} event - The event object containing information about the click event.
   */
  const handleMapClick = useCallback(
    (event) => {
      if (!isMapReady || !map) return;

      const point = event.point;

      // Get all map filters
      const mapFilters = memoizedFilters.filter((filter) => filter.type === "map");

      // Get the list of layer names from the filters
      const layerNames = mapFilters.map((filter) => filter.layer);

      // Query for features from all layers specified in mapFilters
      const features = map.queryRenderedFeatures(point, {
        layers: layerNames,
      });

      if (features && features.length > 0) {
        // Get the top-most feature
        const feature = features[0];
        const layerId = feature.layer.id;

        // Unset the 'selected' state of the previously selected feature for this layer
        if (prevSelectedFeatures.current[layerId]) {
          const prevFeature = prevSelectedFeatures.current[layerId];
          map.setFeatureState(
            {
              source: prevFeature.source,
              sourceLayer: prevFeature.sourceLayer,
              id: prevFeature.id,
            },
            { selected: false }
          );
        }

        // Set the 'selected' state of the currently selected feature, with the highlight
        // matched to the layer's current width or size first.
        syncHoverLayers(map, layerId);
        map.setFeatureState(
          {
            source: feature.layer.source,
            sourceLayer: feature.layer["source-layer"],
            id: feature.id,
          },
          { selected: true }
        );

        // Update the reference to the currently selected feature for this layer
        prevSelectedFeatures.current[layerId] = {
          id: feature.id,
          source: feature.layer.source,
          sourceLayer: feature.layer["source-layer"],
        };

        // Find the corresponding filter
        const filter = mapFilters.find((f) => f.layer === layerId);

        if (filter) {
          const value = feature.properties[filter.field];

          // Dispatch the action with the value from the clicked feature
          filterDispatch({
            type: "SET_FILTER_VALUE",
            payload: { filterId: filter.id, value },
          });
          filter.actions.forEach((action) => {
            dispatch({
              type: action.action,
              payload: { filter, value, ...action.payload },
            });
          });
        }
      } else {
        // When clicking on an area with no features, unset selected features on all layers if needed
        layerNames.forEach((layerId) => {
          if (prevSelectedFeatures.current[layerId]) {
            const prevFeature = prevSelectedFeatures.current[layerId];
            map.setFeatureState(
              {
                source: prevFeature.source,
                sourceLayer: prevFeature.sourceLayer,
                id: prevFeature.id,
              },
              { selected: false }
            );
            delete prevSelectedFeatures.current[layerId];
          }
        });
      }
    },
    [isMapReady, map, memoizedFilters, dispatch, filterDispatch]
  );

  // **Create map hover/tap handler **
  useEffect(() => {
    if (!map) return;

    const isTouch = window.matchMedia('(hover: none), (pointer: coarse)').matches;

    if (!isTouch) {
      // ----- DESKTOP: normal hover -----
      // Coalesce mouse moves to one hover pass per animation frame, using the latest handler.
      let frameId = null;
      let lastEvent = null;
      const cancelPendingHover = () => {
        if (frameId !== null) cancelAnimationFrame(frameId);
        frameId = null;
      };
      const hoverCallback = (e) => {
        lastEvent = e;
        if (frameId !== null) return;
        frameId = requestAnimationFrame(() => {
          frameId = null;
          handleMapHoverRef.current(lastEvent);
        });
      };
      map.on("mousemove", hoverCallback);

      const mouseLeaveCallback = () => {
        // A hover pass still pending would bring the tooltip back after leaving.
        cancelPendingHover();
        clearHover(map, hoverSessionRef.current);
      };
      const canvas = map.getCanvas();
      canvas.addEventListener("mouseleave", mouseLeaveCallback);

      return () => {
        cancelPendingHover();
        map.off("mousemove", hoverCallback);
        canvas.removeEventListener("mouseleave", mouseLeaveCallback);
      };
    }

    // ----- MOBILE/TABLET: tap behavior -----
    const onTap = (e) => {
      const now = Date.now();
      const isTouch =
        e.type === 'touchend' ||
        (e.originalEvent && ('changedTouches' in e.originalEvent || 'touches' in e.originalEvent));

      // Prevent handling mouse event if a touch event was recently processed
      if (!isTouch && now - lastTouchTimeRef.current < 350) {
        return; 
      }
      if (isTouch) {
        lastTouchTimeRef.current = now;
      }

      // Pick the exact feature at the tap point 
      let point = e.point;
      if (!point && e.originalEvent && e.originalEvent.changedTouches && e.originalEvent.changedTouches[0]) {
        const t = e.originalEvent.changedTouches[0];
        const rect = map.getCanvas().getBoundingClientRect();
        point = { x: t.clientX - rect.left, y: t.clientY - rect.top };
      }
      const picked = point ? pickFeatureAtPoint(point) : null;

      if (picked) {
        if (isTouch) {
          const evtForClick = { ...e, point }; // ensure .point exists for handleMapClick
          handleMapClick(evtForClick);
        }
        setTimeout(() => handleMapHover({ ...e, point }, [picked]), 0);
        return;
      }
      // clear on empty tap
      clearHover(map, hoverSessionRef.current);
    };

    map.on('click', onTap);
    map.on('touchend', onTap);

    return () => {
      map.off('click', onTap);
      map.off('touchend', onTap);
    };
  }, [map, handleMapHover, handleMapClick, state.layers, memoizedFilters]);


  // Fallback for touch devices that do support hover
  useEffect(() => {
    if (!map) return;

    const isTouch = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
    const hasHover = window.matchMedia('(hover: hover)').matches;
    if (!(isTouch && hasHover)) return; // run only on hover-capable touch devices

    const onTouchEndShowTooltip = (te) => {
      const t = te.changedTouches && te.changedTouches[0];
      if (!t) return;
      const rect = map.getCanvas().getBoundingClientRect();
      const point = { x: t.clientX - rect.left, y: t.clientY - rect.top };
      const lngLat = map.unproject(point);
      handleMapHover({ point, lngLat });
    };

    map.getCanvas().addEventListener('touchend', onTouchEndShowTooltip, { passive: true });
    return () => map.getCanvas().removeEventListener('touchend', onTouchEndShowTooltip);
  }, [map, handleMapHover]);

  // Run once to set the state of the map
  useEffect(() => {
    if (isMapReady) {
      dispatch({
        type: "SET_MAP",
        payload: { map },
      });
    }
  }, [isMapReady]);

  // Keep `state.currentZoom` in sync with the actual map zoom.
  // This is used by DynamicLegend and useLayerZoomMessage. Previously it was
  // only updated when label layers were enabled, which caused zoom-gated UI to
  // get stuck on pages without labels.
  useEffect(() => {
    if (!map) return;

    // Use a ref to avoid dispatching identical zoom values
    let lastZoom = map.getZoom();

    const updateZoom = () => {
      const currentZoom = map.getZoom();
      if (currentZoom !== lastZoom) {
        lastZoom = currentZoom;
        dispatch({
          type: actionTypes.STORE_CURRENT_ZOOM,
          payload: currentZoom,
        });
      }
    };

    // Only bind to zoomend. Binding to 'zoom' causes 60 state updates per second
    // during animations (like fitBounds), crashing React with Maximum Update Depth Exceeded
    map.on("zoomend", updateZoom);

    // Initial sync
    updateZoom();

    return () => {
      map.off("zoomend", updateZoom);
    };
  }, [map, dispatch]);

  // **Handle map clicks (for map filters)**
  useEffect(() => {
    if (isMapReady & state.filters.length > 0) {
      const hasMapFilter = state.filters.some(
        (filter) => filter.type === "map"
      );
      if (hasMapFilter) {
        map.on("click", handleMapClick);
      }
    }

    return () => {
      if (map) {
        map.off("click", handleMapClick);
      }
    };
  }, [isMapReady, map, handleMapClick]);

  // **Capture viewport (bbox) into FilterContext + query params**
  useEffect(() => {
    // Don't wait for full style/layer readiness; bounds/zoom are available as soon as the map instance exists.
    if (!map || !Array.isArray(state.filters) || state.filters.length === 0) return;

    const viewportFilters = state.filters.filter((f) => f?.type === "mapViewport");
    if (viewportFilters.length === 0) return;

    const resolveViewportMinZoom = (filter) => {
      // Prefer a per-filter minZoom if configured, otherwise infer from any join-layer(s)
      // used by the visualisations this viewport targets.
      if (typeof filter?.minZoom === "number") return filter.minZoom;

      const visualisationNames = Array.isArray(filter?.visualisations) ? filter.visualisations : [];
      const candidates = [];

      visualisationNames.forEach((visName) => {
        const vis = state.visualisations?.[visName];
        const joinLayerName = vis?.joinLayer;
        if (!joinLayerName) return;

        const joinLayer = state.layers?.[joinLayerName];
        if (typeof joinLayer?.minZoom === "number") {
          candidates.push(joinLayer.minZoom);
        }
      });

      if (candidates.length === 0) return null;
      return Math.max(...candidates);
    };

    const debounceMs =
      typeof viewportFilters[0]?.debounceMs === "number" && viewportFilters[0].debounceMs >= 0
        ? viewportFilters[0].debounceMs
        : 250;

    const applyViewport = () => {
      const zoom = map.getZoom();

      viewportFilters.forEach((filter) => {
        const minZoom = resolveViewportMinZoom(filter);
        const isInValidZoomRange = minZoom === null || zoom >= minZoom;

        if (!isInValidZoomRange) {
          // Below minZoom: clear the stored bbox so consumers can treat it as unavailable.
          if (lastViewportSignatureRef.current[filter.id] !== null) {
            lastViewportSignatureRef.current[filter.id] = null;
            filterDispatch({
              type: "SET_FILTER_VALUE",
              payload: { filterId: filter.id, value: null, filter },
            });
          }
          return;
        }

        const bounds = map.getBounds();
        const bbox = {
          west: Number(bounds.getWest().toFixed(6)),
          south: Number(bounds.getSouth().toFixed(6)),
          east: Number(bounds.getEast().toFixed(6)),
          north: Number(bounds.getNorth().toFixed(6)),
          zoom: Number(zoom.toFixed(2)),
        };

        const signature = JSON.stringify(bbox);
        const lastSignature = lastViewportSignatureRef.current[filter.id];
        if (lastSignature === signature) return;

        // Optional "small movement" thresholding to avoid excessive updates.
        if (lastSignature) {
          try {
            const lastBbox = JSON.parse(lastSignature);
            const zoomChanged = Math.abs(lastBbox.zoom - bbox.zoom) >= 0.25;
            const bboxShifted =
              Math.abs(lastBbox.west - bbox.west) > 0.05 ||
              Math.abs(lastBbox.east - bbox.east) > 0.05 ||
              Math.abs(lastBbox.north - bbox.north) > 0.05 ||
              Math.abs(lastBbox.south - bbox.south) > 0.05;
            if (!zoomChanged && !bboxShifted) return;
          } catch {
            // Continue if parsing fails
          }
        }

        lastViewportSignatureRef.current[filter.id] = signature;

        // Store bbox in FilterContext.
        filterDispatch({
          type: "SET_FILTER_VALUE",
          payload: { filterId: filter.id, value: bbox, filter },
        });

        // Apply configured actions (if any), typically mapping bbox keys to query params.
        (filter.actions || []).forEach((action) => {
          const valueKey = action?.payload?.valueKey;
          const value = valueKey ? bbox[valueKey] : bbox;
          const paramName = action?.payload?.paramName || filter.paramName;
          if (!paramName) return;
          dispatch({
            type: action.action,
            payload: { filter, value, paramName, ...action.payload },
          });
        });
      });
    };

    const debouncedApplyViewport = debounce(applyViewport, debounceMs);

    const handleMoveEnd = () => debouncedApplyViewport();
    const handleZoomEnd = () => debouncedApplyViewport();

    map.on("moveend", handleMoveEnd);
    map.on("zoomend", handleZoomEnd);

    // Run once on mount so the viewport bbox is available immediately.
    applyViewport();

    return () => {
      map.off("moveend", handleMoveEnd);
      map.off("zoomend", handleZoomEnd);
      debouncedApplyViewport.cancel?.();
    };
  }, [map, state.filters, state.layers, state.visualisations, dispatch, filterDispatch]);

  // **Apply layer filters**
  useEffect(() => {
    if (!map) return;

    Object.keys(state.layers).forEach((layerId) => {
      if (map.getLayer(layerId)) {
        const featureIdsForLayer = state.visualisedFeatureIds[layerId];
        if (featureIdsForLayer && featureIdsForLayer.length > 0) {
          // Extract the values from featureIdsForLayer
          const featureIdValues = featureIdsForLayer.map(feature => parseInt(feature.value));
        
          // Apply filter to show only features with IDs in featureIdValues
          map.setFilter(layerId, [
            "in",
            ["get", "id"], // Assuming "id" is the property name
            ["literal", featureIdValues],
          ]);
        } else {
          // No filter applied for this layer
          map.setFilter(layerId, null);
        }
      }
    });
  }, [map, state.visualisedFeatureIds]);

  // **Pan and centre map**
  useEffect(() => {
    if (map && state.mapBoundsAndCentroid) {
      const { centroid, featureName } = state.mapBoundsAndCentroid;
      focusFeature(map, state.mapBoundsAndCentroid);

      // Name the feature on the map for a few seconds.
      if (featureName && centroid) {
        showFeatureLabel(map, { featureName, centroid, timeoutRef: labelTimeoutRef });
      }

      // Clear the bounds and centroid after panning
      dispatch({ type: actionTypes.CLEAR_BOUNDS_AND_CENTROID });
    }
  }, [map, state.mapBoundsAndCentroid, dispatch]);

  return (
    <StyledMapContainer ref={mapContainerRef}>
      {props.showMapStyleToggle && <MapStyleToggle map={map} />}
      {Object.values(state.layers).map((layer, index) => (
      <React.Fragment key={layer.name || layer.id || index}>
        <Layer layer={layer} />
        { /* Create a sibling 'spider' layer for all point layers, to deal with overlaps */}
        {layer.type === 'tile' && layer.geometryType === 'point' && Boolean(layer.spiderfyOverlappingPoints) && (
          <SpiderLayer key={`${layer.name || layer.id || index}_spider`} baseLayerId={layer.name || layer.id} />
        )}
      </React.Fragment>
      ))}
      {state.visualisations && <VisualisationManager
        visualisationConfigs={state.visualisations}
        map={map}
        maps={null}
        sidebarIsOpen={sidebarIsOpen}
      />}
      {isMapReady && <DynamicLegend map={map} />}
    </StyledMapContainer>
  );
};

export default React.memo(Map);
