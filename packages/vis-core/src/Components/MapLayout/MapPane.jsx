import "maplibre-gl/dist/maplibre-gl.css";
import React, { useCallback, useEffect, useMemo, useRef } from "react";
import styled from "styled-components";
import maplibregl from "maplibre-gl";
import MapboxDraw from "@mapbox/mapbox-gl-draw";
import { RectangleMode } from "@ookla/mapbox-gl-draw-rectangle";
import debounce from "lodash.debounce";

import { useMap } from "hooks/useMap";
import { useMapContext } from "hooks/useMapContext";
import { useFilterContext } from "hooks/useFilterContext";
import { actionTypes } from "reducers";
import { isValidPoint } from "utils";
import { Layer } from "./Layer";
import { SpiderLayer } from "./SpiderLayer";
import { MapVisualisation } from "./MapVisualisation";
import { useMapGroup } from "./MapGroupContext";
import { paneShows } from "../../map/resolveMapGrid";
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
import { applyMapFilterClick } from "../../map/interactions/mapFilterClick";
import "./MapLayout.css";

/** Visualisation types drawn on a map. */
const MAP_VISUALISATION_TYPES = ["joinDataToMap", "geojson"];

/** Ignore a mouse-generated click this soon after a touch, so a tap isn't handled twice. */
const TOUCH_CLICK_GUARD_MS = 350;

const PaneContainer = styled.div`
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
`;

const DRAW_STYLES = [
  {
    id: "gl-draw-polygon-fill-inactive",
    type: "fill",
    filter: ["all", ["==", "active", "false"], ["==", "$type", "Polygon"], ["!=", "mode", "static"]],
    paint: { "fill-color": "#007bff", "fill-outline-color": "#007bff", "fill-opacity": 0.3 },
  },
  {
    id: "gl-draw-polygon-fill-active",
    type: "fill",
    filter: ["all", ["==", "active", "true"], ["==", "$type", "Polygon"]],
    paint: { "fill-color": "#007bff", "fill-outline-color": "#007bff", "fill-opacity": 0.3 },
  },
  {
    id: "gl-draw-polygon-stroke-inactive",
    type: "line",
    filter: ["all", ["==", "active", "false"], ["==", "$type", "Polygon"], ["!=", "mode", "static"]],
    layout: { "line-cap": "round", "line-join": "round" },
    paint: { "line-color": "#007bff", "line-width": 2 },
  },
  {
    id: "gl-draw-polygon-stroke-active",
    type: "line",
    filter: ["all", ["==", "active", "true"], ["==", "$type", "Polygon"]],
    layout: { "line-cap": "round", "line-join": "round" },
    paint: { "line-color": "#007bff", "line-width": 2 },
  },
];

const isTouchScreen = () => window.matchMedia("(hover: none), (pointer: coarse)").matches;

/**
 * One map pane: a MapLibre map showing the pane's layers and visualisations, with hover
 * tooltips, layer-click popups, labels, map-click filters and viewport filters.
 *
 * Pointer events are shared with the other panes of the pane's sync group (see
 * map/mapGroup.js): hovering, tapping or clicking a layer on one pane shows each pane's own
 * tooltip or popup for what is at that location on its own map.
 *
 * @param {Object} props
 * @param {Object} props.pane - The pane, from the page's grid.
 * @param {boolean} props.isPrimary - Whether this is the page's primary pane: it tracks the zoom
 *   for the page and hosts the draw control for feature selection.
 * @param {string} [props.extraCopyrightText]
 * @param {boolean} [props.compactAttribution] - Collapse the attribution (several panes).
 * @param {number} [props.tileCacheSize]
 */
const MapPane = ({ pane, isPrimary, extraCopyrightText, compactAttribution, tileCacheSize }) => {
  const paneId = pane.id;
  const containerRef = useRef(null);
  const { state, dispatch } = useMapContext();
  const { dispatch: filterDispatch } = useFilterContext();
  const group = useMapGroup();
  const { map, isMapReady } = useMap(
    containerRef,
    state.mapStyle,
    state.mapCentre,
    state.mapZoom,
    extraCopyrightText,
    { compactAttribution, tileCacheSize }
  );

  // Layers can only be added once the map's style has loaded; until then they get no map.
  const readyMap = isMapReady ? map : null;

  const hoverSessionRef = useRef(createHoverSession());
  const popupsRef = useRef({});
  const lastTouchTimeRef = useRef(0);
  const lastViewportSignatureRef = useRef({});

  const paneLayers = useMemo(
    () => Object.values(state.layers).filter((layer) => paneShows(pane, { layer: layer.name })),
    [state.layers, pane]
  );
  const paneVisualisationNames = useMemo(
    () =>
      Object.entries(state.visualisations ?? {})
        .filter(([name, vis]) => MAP_VISUALISATION_TYPES.includes(vis?.type) && paneShows(pane, { visualisation: name }))
        .map(([name]) => name),
    [state.visualisations, pane]
  );

  // --- registration ----------------------------------------------------------------------

  // Register this pane's map once it's ready, and again if a page reset has cleared it while
  // the map stayed mounted. Unregister it when the map goes.
  const registeredMap = state.mapsByPane?.[paneId];
  useEffect(() => {
    if (isMapReady && map && registeredMap !== map) {
      dispatch({ type: actionTypes.SET_PANE_MAP, payload: { paneId, map } });
    }
  }, [isMapReady, map, registeredMap, paneId, dispatch]);

  useEffect(() => {
    if (!map) return undefined;
    return () => dispatch({ type: actionTypes.REMOVE_PANE_MAP, payload: { paneId, map } });
  }, [map, paneId, dispatch]);

  // Join the page's map group, which syncs cameras and relays pointer events (below).
  const onGroupEventRef = useRef(() => {});
  useEffect(() => {
    if (!map) return undefined;
    return group.register(paneId, {
      map,
      syncGroup: pane.syncGroup,
      onEvent: (event) => onGroupEventRef.current(event),
    });
  }, [group, map, paneId, pane.syncGroup]);

  // --- hover tooltips ------------------------------------------------------------------------

  /**
   * Shows the tooltip for the feature at a point on this map, or clears it. Layers with click
   * tooltips count as hoverable on touch devices, where a tap stands in for hover.
   * `forcedFeatures` skips the query (a tap picks the exact feature itself).
   */
  const showTooltipAt = useCallback(
    (point, lngLat, forcedFeatures = null) => {
      if (!map || !isValidPoint(point)) return;
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
        const minimum = isTouchScreen() ? Math.round(6 * (window.devicePixelRatio || 1)) : 0;
        const buffer = hoverBufferSize(hoverable, state.layers, { minimum });
        if (!bufferedBox(point, buffer)) {
          console.warn("Invalid buffered point coordinates, skipping query:", point);
          return;
        }
        // Nearest feature first, so the feature under the pointer beats a neighbour that is
        // merely within tolerance. Features that would not get a hover don't end the search.
        const queried = queryHoverFeatures(
          map,
          session,
          point,
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
        lngLat,
        layers: state.layers,
        visualisations: state.visualisations,
      });
    },
    [map, state.layers, state.visualisations]
  );

  // --- layer-click popups ------------------------------------------------------------------

  /** Opens this map's popup for the feature of `layerId` at a point, replacing the last one. */
  const openLayerPopup = useCallback(
    (point, lngLat, layerId, bufferSize) => {
      if (!map) return;
      const popups = popupsRef.current;
      (popups[layerId] ?? []).forEach((popup) => popup.remove());
      popups[layerId] = [];
      const box = isValidPoint(point) ? bufferedBox(point, bufferSize) : null;
      if (!box) return;
      const features = map.queryRenderedFeatures(box, { layers: [layerId] });
      if (features.length === 0) return;
      popups[layerId].push(
        new maplibregl.Popup({ closeOnClick: false })
          .setLngLat(lngLat)
          .setHTML(layerClickHtml(features[0]))
          .addTo(map)
      );
    },
    [map]
  );

  // --- events from the pane's sync group ----------------------------------------------------

  /** The point an event's location falls on in this map. */
  const pointOf = (event) =>
    event.sourcePaneId === paneId ? event.point : map.project(event.lngLat);

  onGroupEventRef.current = (event) => {
    if (!map) return;
    switch (event.type) {
      case "hover":
        showTooltipAt(pointOf(event), event.lngLat);
        break;
      case "tap":
        showTooltipAt(
          pointOf(event),
          event.lngLat,
          event.sourcePaneId === paneId ? [event.feature] : null
        );
        break;
      case "leave":
        clearHover(map, hoverSessionRef.current);
        break;
      case "layerClick":
        openLayerPopup(pointOf(event), event.lngLat, event.layerId, event.bufferSize);
        break;
      default:
        break;
    }
  };

  // --- map-click filters --------------------------------------------------------------------

  const handleMapClick = useCallback(
    (event) => {
      if (!isMapReady || !map) return;
      applyMapFilterClick({
        sourcePaneId: paneId,
        point: event.point,
        lngLat: event.lngLat ?? map.unproject(event.point),
        groupMaps: group.mapsInGroupOf(paneId),
        filters: state.filters,
        selections: group,
        dispatch,
        filterDispatch,
      });
    },
    [isMapReady, map, paneId, group, state.filters, dispatch, filterDispatch]
  );

  useEffect(() => {
    if (!isMapReady || !map || !state.filters.some((filter) => filter.type === "map")) {
      return undefined;
    }
    map.on("click", handleMapClick);
    return () => map.off("click", handleMapClick);
  }, [isMapReady, map, handleMapClick, state.filters]);

  // --- pointer listeners ---------------------------------------------------------------------

  /** The top-most feature at a point on a map-click filter layer or a tooltip layer. */
  const pickFeatureAtPoint = useCallback(
    (point) => {
      if (!map) return null;
      const filterLayers = state.filters
        .filter((f) => f.type === "map")
        .map((f) => f.layer)
        .filter((id) => map.getLayer(id));
      if (filterLayers.length) {
        const hits = map.queryRenderedFeatures(point, { layers: filterLayers });
        if (hits.length) return hits[0];
      }
      const otherLayers = Object.keys(state.layers).filter(
        (id) =>
          (state.layers[id].shouldHaveTooltipOnClick || state.layers[id].shouldHaveTooltipOnHover) &&
          map.getLayer(id)
      );
      if (otherLayers.length) {
        const hits = map.queryRenderedFeatures(point, { layers: otherLayers });
        if (hits.length) return hits[0];
      }
      return null;
    },
    [map, state.filters, state.layers]
  );

  useEffect(() => {
    if (!map) return undefined;
    const canvas = map.getCanvas();
    const leave = () => group.broadcast(paneId, { type: "leave" });

    if (!isTouchScreen()) {
      // Desktop: one hover pass per animation frame, with the latest pointer position.
      // `pending` is tracked apart from the frame id, which a frame that runs at once would
      // leave stale.
      let pending = false;
      let frameId = null;
      let lastEvent = null;
      const cancelPendingHover = () => {
        if (pending) cancelAnimationFrame(frameId);
        pending = false;
      };
      const onMouseMove = (e) => {
        lastEvent = e;
        if (pending) return;
        pending = true;
        frameId = requestAnimationFrame(() => {
          pending = false;
          // Without a valid pointer position there is nothing to hover, on any pane.
          if (!isValidPoint(lastEvent.point)) return;
          group.broadcast(paneId, { type: "hover", point: lastEvent.point, lngLat: lastEvent.lngLat });
        });
      };
      const onMouseLeave = () => {
        // A hover pass still pending would bring the tooltips back after leaving.
        cancelPendingHover();
        leave();
      };
      map.on("mousemove", onMouseMove);
      canvas.addEventListener("mouseleave", onMouseLeave);
      return () => {
        cancelPendingHover();
        map.off("mousemove", onMouseMove);
        canvas.removeEventListener("mouseleave", onMouseLeave);
      };
    }

    // Touch: a tap stands in for hover.
    const onTap = (e) => {
      const now = Date.now();
      const isTouch =
        e.type === "touchend" ||
        (e.originalEvent && ("changedTouches" in e.originalEvent || "touches" in e.originalEvent));
      if (!isTouch && now - lastTouchTimeRef.current < TOUCH_CLICK_GUARD_MS) return;
      if (isTouch) lastTouchTimeRef.current = now;

      let point = e.point;
      const touch = e.originalEvent?.changedTouches?.[0];
      if (!point && touch) {
        const rect = canvas.getBoundingClientRect();
        point = { x: touch.clientX - rect.left, y: touch.clientY - rect.top };
      }
      const picked = point ? pickFeatureAtPoint(point) : null;
      if (!picked) {
        leave();
        return;
      }
      const lngLat = e.lngLat ?? map.unproject(point);
      if (isTouch) handleMapClick({ ...e, point, lngLat });
      setTimeout(() => group.broadcast(paneId, { type: "tap", point, lngLat, feature: picked }), 0);
    };
    map.on("click", onTap);
    map.on("touchend", onTap);
    return () => {
      map.off("click", onTap);
      map.off("touchend", onTap);
    };
  }, [map, group, paneId, pickFeatureAtPoint, handleMapClick]);

  // Touch devices that also hover: show the tooltip where a touch ends.
  useEffect(() => {
    if (!map) return undefined;
    const isTouch = "ontouchstart" in window || navigator.maxTouchPoints > 0;
    if (!(isTouch && window.matchMedia("(hover: hover)").matches)) return undefined;
    const canvas = map.getCanvas();
    const onTouchEnd = (te) => {
      const t = te.changedTouches?.[0];
      if (!t) return;
      const rect = canvas.getBoundingClientRect();
      const point = { x: t.clientX - rect.left, y: t.clientY - rect.top };
      group.broadcast(paneId, { type: "hover", point, lngLat: map.unproject(point) });
    };
    canvas.addEventListener("touchend", onTouchEnd, { passive: true });
    return () => canvas.removeEventListener("touchend", onTouchEnd);
  }, [map, group, paneId]);

  // Layer-click popups, cursors and labels, for the layers this pane shows.
  useEffect(() => {
    if (!map) return undefined;
    // Everything registered here is recorded so the cleanup removes exactly that. The cursor
    // handlers are layer-scoped, so MapLibre queries rendered features for each one on every
    // mouse move; left behind, they pile up each time the layers change.
    const registrations = [];
    const listen = (...args) => {
      map.on(...args);
      registrations.push(() => map.off(...args));
    };
    const layers = Object.fromEntries(paneLayers.map((layer) => [layer.name, layer]));

    labelledLayers(layers).forEach((label) => {
      listen("zoomend", () => updateLabelLayer(map, label));
    });

    const touch = isTouchScreen();
    paneLayers.forEach((layer) => {
      const layerId = layer.name;
      if (layer.shouldHaveTooltipOnHover || layer.shouldHaveTooltipOnClick) {
        listen("mouseenter", layerId, () => {
          map.getCanvas().style.cursor = "pointer";
        });
        listen("mouseleave", layerId, () => {
          map.getCanvas().style.cursor = "grab";
        });
      }
      // On touch devices a tap shows the tooltip instead (above).
      if (!touch && layer.shouldHaveTooltipOnClick) {
        const bufferSize = layer.bufferSize ?? 0;
        listen("click", (e) =>
          group.broadcast(paneId, { type: "layerClick", point: e.point, lngLat: e.lngLat, layerId, bufferSize })
        );
      }
    });

    return () => {
      registrations.forEach((unregister) => unregister());
      Object.values(popupsRef.current).forEach((popups) => popups.forEach((popup) => popup.remove()));
      popupsRef.current = {};
    };
    // Visualisations too: a layer-click popup shows the value at the time of the click, so it
    // closes when the data changes.
  }, [map, group, paneId, paneLayers, state.visualisations]);

  // --- page-wide duties of the primary pane ----------------------------------------------------

  // The draw control for feature selection lives on the primary pane.
  useEffect(() => {
    if (!map || !isPrimary) return;
    const drawInstance = new MapboxDraw({
      displayControlsDefault: false,
      modes: { ...MapboxDraw.modes, draw_rectangle: RectangleMode },
      controls: {},
      styles: DRAW_STYLES,
    });
    map.addControl(drawInstance);
    dispatch({ type: "SET_DRAW_INSTANCE", payload: drawInstance });
    return () => {
      try {
        map.removeControl(drawInstance);
      } catch {
        // The map may already be gone.
      }
    };
  }, [map, isPrimary, dispatch]);

  // Keep `state.currentZoom` in step with the primary pane's zoom, for zoom-gated UI such as
  // the legend and the layer zoom message. Only zoomend: 'zoom' would dispatch on every frame
  // of an animation.
  useEffect(() => {
    if (!map || !isPrimary) return undefined;
    let lastZoom = map.getZoom();
    const updateZoom = () => {
      const currentZoom = map.getZoom();
      if (currentZoom !== lastZoom) {
        lastZoom = currentZoom;
        dispatch({ type: actionTypes.STORE_CURRENT_ZOOM, payload: currentZoom });
      }
    };
    map.on("zoomend", updateZoom);
    updateZoom();
    return () => map.off("zoomend", updateZoom);
  }, [map, isPrimary, dispatch]);

  // --- viewport filters ----------------------------------------------------------------------

  // A `mapViewport` filter stores the viewport of the first pane it targets.
  useEffect(() => {
    if (!map || !Array.isArray(state.filters)) return undefined;
    const viewportFilters = state.filters.filter(
      (f) =>
        f?.type === "mapViewport" &&
        (f.panes?.[0] ?? state.mapGrid?.primaryPaneId ?? paneId) === paneId
    );
    if (viewportFilters.length === 0) return undefined;

    // Prefer a per-filter minZoom, otherwise the largest minZoom of the join layers of the
    // visualisations the filter targets.
    const resolveViewportMinZoom = (filter) => {
      if (typeof filter?.minZoom === "number") return filter.minZoom;
      const candidates = (filter?.visualisations ?? [])
        .map((visName) => state.layers?.[state.visualisations?.[visName]?.joinLayer]?.minZoom)
        .filter((minZoom) => typeof minZoom === "number");
      return candidates.length ? Math.max(...candidates) : null;
    };

    const debounceMs =
      typeof viewportFilters[0]?.debounceMs === "number" && viewportFilters[0].debounceMs >= 0
        ? viewportFilters[0].debounceMs
        : 250;

    const applyViewport = () => {
      const zoom = map.getZoom();
      viewportFilters.forEach((filter) => {
        const minZoom = resolveViewportMinZoom(filter);
        if (minZoom !== null && zoom < minZoom) {
          // Below minZoom: clear the stored bbox so consumers can treat it as unavailable.
          if (lastViewportSignatureRef.current[filter.id] !== null) {
            lastViewportSignatureRef.current[filter.id] = null;
            filterDispatch({ type: "SET_FILTER_VALUE", payload: { filterId: filter.id, value: null, filter } });
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

        // Skip small movements.
        if (lastSignature) {
          try {
            const last = JSON.parse(lastSignature);
            const zoomChanged = Math.abs(last.zoom - bbox.zoom) >= 0.25;
            const shifted = ["west", "east", "north", "south"].some(
              (side) => Math.abs(last[side] - bbox[side]) > 0.05
            );
            if (!zoomChanged && !shifted) return;
          } catch {
            // Continue if parsing fails
          }
        }

        lastViewportSignatureRef.current[filter.id] = signature;
        filterDispatch({ type: "SET_FILTER_VALUE", payload: { filterId: filter.id, value: bbox, filter } });

        // Apply the configured actions, typically mapping bbox keys to query params.
        (filter.actions || []).forEach((action) => {
          const valueKey = action?.payload?.valueKey;
          const value = valueKey ? bbox[valueKey] : bbox;
          const paramName = action?.payload?.paramName || filter.paramName;
          if (!paramName) return;
          dispatch({
            type: action.action,
            payload: { filter, value, paramName, panes: filter.panes, ...action.payload },
          });
        });
      });
    };

    const debouncedApplyViewport = debounce(applyViewport, debounceMs);
    const onViewChange = () => debouncedApplyViewport();
    map.on("moveend", onViewChange);
    map.on("zoomend", onViewChange);
    // Run once so the viewport bbox is available immediately.
    applyViewport();
    return () => {
      map.off("moveend", onViewChange);
      map.off("zoomend", onViewChange);
      debouncedApplyViewport.cancel?.();
    };
  }, [map, paneId, state.filters, state.layers, state.visualisations, state.mapGrid, dispatch, filterDispatch]);

  // --- feature filtering ---------------------------------------------------------------------

  // Show only the listed features of layers with visualised feature ids. Runs when the ids
  // change, not when other layer state does: resetting a layer's filter would wipe filters
  // others set (hiding features without data, spider exclusions).
  const paneLayersRef = useRef(paneLayers);
  paneLayersRef.current = paneLayers;
  useEffect(() => {
    if (!map) return;
    paneLayersRef.current.forEach(({ name: layerId }) => {
      if (!map.getLayer(layerId)) return;
      const featureIds = state.visualisedFeatureIds?.[layerId];
      map.setFilter(
        layerId,
        featureIds && featureIds.length > 0
          ? ["in", ["get", "id"], ["literal", featureIds.map((feature) => parseInt(feature.value))]]
          : null
      );
    });
  }, [map, state.visualisedFeatureIds]);

  return (
    <PaneContainer ref={containerRef} data-pane-id={paneId}>
      {paneLayers.map((layer, index) => (
        <React.Fragment key={layer.name || layer.id || index}>
          <Layer layer={layer} map={readyMap} paneId={paneId} />
          {/* A sibling 'spider' layer spreads out overlapping points of point layers. */}
          {layer.type === "tile" && layer.geometryType === "point" && Boolean(layer.spiderfyOverlappingPoints) && (
            <SpiderLayer baseLayerId={layer.name || layer.id} map={readyMap} />
          )}
        </React.Fragment>
      ))}
      {paneVisualisationNames.map((name) => (
        <MapVisualisation key={name} visualisationName={name} map={map} paneId={paneId} />
      ))}
    </PaneContainer>
  );
};

export default React.memo(MapPane);
