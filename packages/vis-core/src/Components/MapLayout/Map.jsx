import "maplibre-gl/dist/maplibre-gl.css";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import styled from "styled-components";

import { DynamicLegend } from "Components/DynamicLegend/DynamicLegend";
import { useMap } from "hooks/useMap";
import { useMapContext } from "hooks/useMapContext";
import { useFilterContext } from "hooks/useFilterContext";
import { actionTypes } from "reducers";
import { api } from "services";
import maplibregl from "maplibre-gl";
import { VisualisationManager } from "./VisualisationManager";
import { Layer } from "./Layer";
import { SpiderLayer } from "./SpiderLayer";
import MapStyleToggle from "./MapStyleToggle";
import { useBaseMapTransition } from "hooks/useBaseMapTransition";
import { getBaseMap } from "../../map/baseMaps";
import {
  getSourceLayer,
  getFeatureStateValue,
  isValidPoint,
  formatNumber,
  replacePlaceholders,
  buildDefaultTooltip,
  buildLoadingTooltip,
  buildErrorTooltip,
  buildLoadingSection,
  insertCustomIntoDefault,
  resolveTooltipRequestUrl,
  resolveVisualisationUnit,
} from "utils";
import "./MapLayout.css";
import MapboxDraw from "@mapbox/mapbox-gl-draw";
import { RectangleMode } from "@ookla/mapbox-gl-draw-rectangle";
import debounce from "lodash.debounce";
import { mapKeys, uniq } from "lodash";

const StyledMapContainer = styled.div`
  width: 100%;
  height: calc(100vh - 75px);
  @media ${props => props.theme.mq.mobile} {
   height: auto;             /* let content dictate height */
  }
`;

/**
 * When we add spider layers to the map, these are hoverable as they are 
 * children/siblings of other layers.
 * 
 * This function returns spider layer ids for all point layers present on the map,
 * to include in hover/click queries.
 */
function allSpiderOverlayLayerIds(map, stateLayers) {
  const ids = [];
  Object.keys(stateLayers).forEach((layerId) => {
    const pointsId = `${layerId}-spider`;
    const linksId = `${layerId}-spider-links`;
    if (map.getLayer(pointsId)) ids.push(pointsId);
    if (map.getLayer(linksId)) ids.push(linksId);
  });
  return ids;
}

/**
 * Resolve the base layer of a spider layer.
 * 
 * Spider layers are automatically generated when spiderfyOverlappingPoints
 * is true, and the layer is a point/circle layer.
 * 
 * This function is primarily useful for cascading custom hover functionality
 * through to spider layers.
 *
 * @returns {string} The name of the parent layer for a spider layer.
 */
function resolveBaseLayerIdFromSpiderLayerId(layerId) {
  if (layerId.endsWith("-spider")) return layerId.slice(0, -"-spider".length);
  if (layerId.endsWith("-spider-links")) return layerId.slice(0, -"-spider-links".length);
  return layerId;
}


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
  const listenerCallbackRef = useRef({});
  const hoverIdRef = useRef({});
  const sidebarIsOpen = props.sidebarIsOpen

  // Docked layout: the container is sized by fixed side columns rather than the
  // window, so keep MapLibre's canvas in step with the container itself.
  useEffect(() => {
    if (!props.resizeWithContainer || !map) return undefined;
    map.resize?.();
    if (typeof ResizeObserver === "undefined" || !mapContainerRef.current) return undefined;
    const observer = new ResizeObserver(() => map.resize?.());
    observer.observe(mapContainerRef.current);
    return () => {
      observer.disconnect();
      // Leaving the docked layout widens the container once React commits; resize after that.
      requestAnimationFrame(() => map.resize?.());
    };
  }, [map, props.resizeWithContainer]);
  
  /**
   * Generates HTML for metadata section of tooltips
   * @param {Object} properties - Feature properties object
   * @returns {string} HTML string for metadata section
   */
  const generateMetadataHtml = useCallback((properties) => {
    const metadataKeys = Object.keys(properties).filter(
      (key) => !["id", "name", "value"].includes(key)
    );
    if (metadataKeys.length === 0) {
      return "";
    }
    
    let metadataDescription = '<div class="metadata-section">';
    metadataKeys.forEach((key) => {
      metadataDescription += `
        <div class="metadata-item">
          <span class="metadata-key">${key}:</span>
          <span class="metadata-value">${properties[key]}</span>
        </div>`;
    });
    metadataDescription += '</div>';
    return metadataDescription;
  }, []);
  
  // Refs to manage hover state
  const hoverEventIdRef = useRef(0);
  const hoverInfoRef = useRef({});
  const prevHoveredFeaturesRef = useRef([]);
  
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
   * Handles hover events on the map and displays a single popup with information about all hovered features.
   * The API requests are delayed by 100ms. If the user moves the mouse away before 100ms, the API calls are canceled.
   * Uses hoverEventId to ensure consistency and prevent outdated data from updating the tooltip.
   *
   * @param {Object} e - The event object containing information about the hover event.
   */
  const handleMapHover = useCallback(
    (e, forcedFeatures = null) => {
      // Validate map and event point with numeric coordinates
      if (!map || !isValidPoint(e?.point)) {
        return;
      }

      // Get layers that have shouldHaveTooltipOnHover set to true and are available on the map
      // Treat click-tooltips as hover-tooltips on touch devices
      const isTouchonMobile = window.matchMedia('(hover: none)').matches;
      
      const hoverableLayers = Object.keys(state.layers).filter((layerId) => {
        const cfg = state.layers[layerId];
        const showOnTouch = isTouchonMobile && cfg.shouldHaveTooltipOnClick;
        return (cfg.shouldHaveTooltipOnHover || showOnTouch) && map.getLayer(layerId);
      });

      let features = [];
      if (forcedFeatures && forcedFeatures.length) {
        features = forcedFeatures;
      } else {
        if (hoverableLayers.length === 0) {
          // Clean up if no hoverable layers
          if (hoverInfoRef.current.popup) {
            hoverInfoRef.current.popup.remove();
            hoverInfoRef.current.popup = null;
          }
          // Clear hover state for previously hovered features
          prevHoveredFeaturesRef.current.forEach(({ source, sourceLayer, featureId }) => {
            map.setFeatureState({ source, id: featureId, sourceLayer }, { hover: false });
          });
          prevHoveredFeaturesRef.current = [];
          return;
        }

        // Determine the maximum bufferSize among the layers
        const isTouch = window.matchMedia('(hover: none), (pointer: coarse)').matches;
        const dpr = window.devicePixelRatio || 1;
        // On touch devices, used a minimum buffer to account for finger size
        const minTapBufferPx = isTouch ? Math.round(6 * dpr) : 0;

        const BUFFER_FLOOR = 3;

        // Calculate buffer with line width offset to extend from line edge
        const maxBufferSize = Math.max(
          BUFFER_FLOOR,
          minTapBufferPx,
          ...hoverableLayers.map((layerId) => {
            const layer = state.layers[layerId];
            const baseBuffer = layer.bufferSize ?? 0;
            
            // For line layers, add half the line width to buffer so it extends from edge
            if (layer.geometryType === 'line' && layer.mapLayer?.paint?.['line-width']) {
              const lineWidth = layer.mapLayer.paint['line-width'];
              // Handle both constant and expression-based line widths
              const width = typeof lineWidth === 'number' ? lineWidth : 7.5; // Use max default if expression
              return baseBuffer + (width / 2);
            }
            
            return baseBuffer;
          })
        );

        const pointX = e.point.x;
        const pointY = e.point.y;
        const buffer = Number.isFinite(maxBufferSize) ? maxBufferSize : 0;
        
        const bufferedPoint = [
          [pointX - buffer, pointY - buffer],
          [pointX + buffer, pointY + buffer],
        ];
        
        // Double-check bufferedPoint values are valid before querying
        const hasValidBufferedPoint = bufferedPoint.every(
          (coord) => coord.every((val) => typeof val === 'number' && Number.isFinite(val))
        );
        
        if (!hasValidBufferedPoint) {
          console.warn('Invalid buffered point coordinates, skipping query:', bufferedPoint);
          return;
        }
        
        const spiderOverlayLayerIds = allSpiderOverlayLayerIds(map, state.layers); // Added so we can account for spider layers (dupe points)
        const featuresWithDuplicates = map.queryRenderedFeatures(bufferedPoint, {
           layers: [...hoverableLayers, ...spiderOverlayLayerIds],
         });
        
        // Filter out any features that don't have required properties
        const validFeatures = (featuresWithDuplicates || []).filter(
          (f) => f && f.id != null && f.layer && f.layer.id
        );
        
        if (isTouchonMobile) {
          features = validFeatures.length ? [validFeatures[0]] : [];
        } else {      
          // Below removes duplicates from features array
          const seen = new Set();
          for (const f of validFeatures) {
            if (!seen.has(f.id)) { 
              seen.add(f.id); 
              features.push(f); 
            }
          }
        }
      }

      if (features.length === 0) {
        // No features under mouse, cleanup and return
        if (hoverInfoRef.current.popup) {
          hoverInfoRef.current.popup.remove();
          hoverInfoRef.current.popup = null;
        }
        // Clear hover state for previously hovered features
        prevHoveredFeaturesRef.current.forEach(({ source, sourceLayer, featureId }) => {
          map.setFeatureState({ source, id: featureId, sourceLayer }, { hover: false });
        });
        prevHoveredFeaturesRef.current = [];
        return;
      }

      // Filter features based on their individual layer's shouldHaveHoverOnlyOnData setting
      // NB if it's a spider layer, we resolve to the base layer to get custom hover handling.
      const filteredFeatures = features.filter((feature) => {
        const rawLayerId = feature.layer.id;
        const layerId = resolveBaseLayerIdFromSpiderLayerId(rawLayerId);
        const layerConfig = state.layers[layerId];
        if (!layerConfig) return false;
        
        const shouldHaveHoverOnlyOnData = layerConfig.shouldHaveHoverOnlyOnData ?? false;
        
        // Safely get feature value - feature.state may be null or undefined
        const featureValue = getFeatureStateValue(feature);
        
        // If this layer has shouldHaveHoverOnlyOnData enabled, only include features with data
        if (shouldHaveHoverOnlyOnData && (featureValue === null || featureValue === undefined)) {
          return false; // Exclude this feature as it has no data
        }
        
        return true; // Include this feature
      });

      // If after filtering we have no features, cleanup and return
      if (filteredFeatures.length === 0) {
        if (hoverInfoRef.current.popup) {
          hoverInfoRef.current.popup.remove();
          hoverInfoRef.current.popup = null;
        }
        // Clear hover state for previously hovered features
        prevHoveredFeaturesRef.current.forEach(({ source, sourceLayer, featureId }) => {
          map.setFeatureState({ source, id: featureId, sourceLayer }, { hover: false });
        });
        prevHoveredFeaturesRef.current = [];
        return;
      }

      const selectedFeatures = [filteredFeatures[0]];

      // Collect current hovered features (using filtered features)
      const currentHoveredFeatures = selectedFeatures.map((feature) => ({
        layerId: feature.layer.id,
        featureId: feature.id,
        source: feature.layer.source,
        sourceLayer: feature.layer["source-layer"],
      }));

      // Update hover states
      // First, unset hover state for previous features that are no longer hovered
      prevHoveredFeaturesRef.current.forEach((prevFeature) => {
        const stillHovered = currentHoveredFeatures.find(
          (currFeature) =>
            currFeature.layerId === prevFeature.layerId &&
            currFeature.featureId === prevFeature.featureId
        );
        if (!stillHovered) {
          map.setFeatureState(
            {
              source: prevFeature.source,
              id: prevFeature.featureId,
              sourceLayer: prevFeature.sourceLayer,
            },
            { hover: false }
          );
        }
      });

      // Then, set hover state for newly hovered features
      currentHoveredFeatures.forEach((currFeature) => {
        const wasHovered = prevHoveredFeaturesRef.current.find(
          (prevFeature) =>
            prevFeature.layerId === currFeature.layerId &&
            prevFeature.featureId === currFeature.featureId
        );
        if (!wasHovered) {
          map.setFeatureState(
            {
              source: currFeature.source,
              id: currFeature.featureId,
              sourceLayer: currFeature.sourceLayer,
            },
            { hover: true }
          );
        }
      });

      // Now proceed to update the popup position
      const coordinates = e.lngLat;

      // Check if the features are the same as before
      const prevHoveredFeatures = prevHoveredFeaturesRef.current || [];

      const isSameFeatures =
        prevHoveredFeatures.length === currentHoveredFeatures.length &&
        prevHoveredFeatures.every((prevFeature, index) => {
          const currFeature = currentHoveredFeatures[index];
          return (
            prevFeature.layerId === currFeature.layerId &&
            prevFeature.featureId === currFeature.featureId
          );
        });

      if (isSameFeatures) {
        // Same features, update popup position
        if (hoverInfoRef.current.popup) {
          hoverInfoRef.current.popup.setLngLat(coordinates);
        }
        // No need to re-fetch data or update descriptions
        return;
      }

      // Update previous hovered features
      prevHoveredFeaturesRef.current = currentHoveredFeatures;

      // Increment hoverEventId
      hoverEventIdRef.current += 1;
      const currentHoverEventId = hoverEventIdRef.current;

      // Remove existing popup if any
      if (hoverInfoRef.current.popup) {
        hoverInfoRef.current.popup.remove();
        hoverInfoRef.current.popup = null;
      }

      // Cancel any ongoing API requests
      if (hoverInfoRef.current.abortController) {
        hoverInfoRef.current.abortController.abort();
        hoverInfoRef.current.abortController = null;
      }

      // Clear any pending timeout
      if (hoverInfoRef.current.timeoutId) {
        clearTimeout(hoverInfoRef.current.timeoutId);
        hoverInfoRef.current.timeoutId = null;
      }

      let descriptions = [];
      // Track API requests and how they map back to description indexes so we can merge results precisely
      // NB if it's a spider layer, we resolve to the base layer to get custom tooltip metadata.
  const apiRequests = [];
      const requestIndexByDescriptionIndex = {};

      selectedFeatures.forEach((feature) => {
        const rawLayerId = feature.layer.id;
        const layerId = resolveBaseLayerIdFromSpiderLayerId(rawLayerId);
        const layerConfig = state.layers[layerId];
        const customTooltip = layerConfig?.customTooltip;
        const hoverNulls = layerConfig?.hoverNulls ?? true;
        const shouldIncludeMetadata = layerConfig?.hoverTipShouldIncludeMetadata;
        const shouldHaveHoverOnlyOnData = layerConfig?.shouldHaveHoverOnlyOnData ?? false;

        // Safely get feature value
        const featureValue = getFeatureStateValue(feature);
        const hideValueInTooltip = layerConfig.hideValueInTooltip ?? false; 

        if (
          !hoverNulls &&
          (featureValue === null || featureValue === undefined)
        ) {
          return; // Skip this feature
        }

        // If shouldHaveHoverOnlyOnData is enabled, only show hover for features with data
        if (
          shouldHaveHoverOnlyOnData &&
          (featureValue === null || featureValue === undefined)
        ) {
          return; // Skip this feature as it has no data
        }

        const featureName = feature.properties?.name || "";
        const featureValueDisplay =
          !hideValueInTooltip && featureValue !== undefined && featureValue !== null
            ? formatNumber(featureValue)
            : "";
        const layerVisualisationName = layerConfig.visualisationName;
        const layerVisualisation = state.visualisations[layerVisualisationName];
        const baseUnitText =
          layerConfig.defaultTooltipUnitName ??
          layerVisualisation?.legendText?.[0]?.legendSubtitleText ?? "";
        const unitText = resolveVisualisationUnit(layerVisualisation, baseUnitText);
        const valueText =
           layerConfig.defaultTooltipValueName ??
           state.visualisations[layerVisualisationName]?.legendText?.[0]?.displayValue ??
           "Value";
        const identifierLabel = layerConfig?.defaultTooltipIdentifierLabel || "";

        let description = "";

        if (!customTooltip) {
          // Immediate data
          description = buildDefaultTooltip({
            featureName,
            featureValueDisplay,
            unitText,
            valueText,
            identifierLabel
          });

          // Inject additional metadata if available and enabled
          if (description && shouldIncludeMetadata) {
            const metadataDescription = generateMetadataHtml(feature.properties || {});
            if (metadataDescription) {
              const lastDivIndex = description.lastIndexOf("</div>");
              if (lastDivIndex !== -1) {
                description = description.slice(0, lastDivIndex) + metadataDescription + description.slice(lastDivIndex);
              }
            }
          }

          if (description) {
            descriptions.push(description);
          }
        } else {
          // Custom tooltip present; decide whether to join with default tooltip
          const joinToDefault = !!customTooltip.joinToDefaultTooltip;

          if (joinToDefault) {
            const customValueText = customTooltip.defaultValueName || valueText;
            description = buildDefaultTooltip({
              featureName,
              featureValueDisplay,
              unitText,
              valueText: customValueText,
              identifierLabel
            });

            // Inject additional metadata if available and enabled
            if (description && shouldIncludeMetadata) {
              const metadataDescription = generateMetadataHtml(feature.properties || {});
              if (metadataDescription) {
                const lastDivIndex = description.lastIndexOf("</div>");
                if (lastDivIndex !== -1) {
                  description = description.slice(0, lastDivIndex) + metadataDescription + description.slice(lastDivIndex);
                }
              }
            }

            // Insert loading section in the middle (between title and value) to show that custom data is being loaded
            if (description) {
              description = insertCustomIntoDefault(description, buildLoadingSection());
            }

            const descIndex = descriptions.length;
            // Always push to maintain index mapping, even if description is empty
            descriptions.push(description || "");
            // Prepare the API request and map it to this description index
            const requestIndex = apiRequests.length;
            apiRequests.push({ feature, layerId, featureName, joinToDefault: true });
            requestIndexByDescriptionIndex[descIndex] = requestIndex;
          } else {
            // If not joining, show a loading placeholder and later replace fully with custom HTML
            description = buildLoadingTooltip(featureName);
            const descIndex = descriptions.length;
            descriptions.push(description);

            const requestIndex = apiRequests.length;
            apiRequests.push({ feature, layerId, featureName, joinToDefault: false });
            requestIndexByDescriptionIndex[descIndex] = requestIndex;
          }
        }
      });

      // Show the popup with the initial descriptions
      if (descriptions.length > 0) {
        const aggregatedHtml = descriptions.join('<hr class="thick-divider">');
        const popup = new maplibregl.Popup({
          className: "custom-popup",
          closeButton: false,
          closeOnClick: false,
          closeOnMove: false,
        })
          .setLngLat(coordinates)
          .setHTML(aggregatedHtml)
          .addTo(map);
        hoverInfoRef.current.popup = popup;
      } else {
        // No descriptions, do not show popup
        return;
      }

      if (apiRequests.length > 0) {
        // Delay the API calls
        const fetchData = () => {
          const controller = new AbortController();
          hoverInfoRef.current.abortController = controller;

          const fetchPromises = apiRequests.map(
            ({ feature, layerId, featureName, joinToDefault }) => {
            const layerConfig = state.layers[layerId];
            const customTooltip = layerConfig?.customTooltip;
            
            // Guard against missing customTooltip
            if (!customTooltip) {
              return Promise.resolve(joinToDefault ? "<p>Data unavailable.</p>" : buildErrorTooltip(featureName));
            }
            
            const { htmlTemplate, customFormattingFunctions } = customTooltip;
            const featureId = feature.id;
            const requestUrlWithId = resolveTooltipRequestUrl(customTooltip, featureId);
            const showAllDataInTooltip = layerConfig?.showAllDataInTooltipForEachGeom;

            return api.baseService
              .get(requestUrlWithId, { signal: controller.signal })
              .then((responseData) => {
                // Check if we should show all data and we have an array of records
                if (showAllDataInTooltip && Array.isArray(responseData) && responseData.length > 0) {
                  // Reverse the array so most recently painted features appear first
                  const reversedData = [...responseData].reverse();
                  
                  // Only show the first tooltip
                  const firstTooltipHtml = replacePlaceholders(
                    htmlTemplate,
                    reversedData[0],
                    { customFunctions: customFormattingFunctions }
                  );
                  
                  // Add indicator if there are more records than displayed
                  if (reversedData.length > 1) {
                    return `${firstTooltipHtml}<hr class="thick-divider"><div class="more-records-indicator">... and ${reversedData.length - 1} more record(s)</div>`;
                  }
                  
                  return firstTooltipHtml;
                } else {
                  // Single item or showAllDataInTooltip is false - use original logic
                  const dataToUse = Array.isArray(responseData) ? responseData[0] : responseData;
                  const tooltipHtml = replacePlaceholders(
                    htmlTemplate,
                    dataToUse || {},
                    { customFunctions: customFormattingFunctions }
                  );
                  return tooltipHtml;
                }
              })
              .catch((error) => {
                if (error.name !== "AbortError") {
                  console.error("Failed to fetch tooltip data:", error);
                }
                // Return placeholder - for joinToDefault, return plain text to be inserted
                if (joinToDefault) {
                  return "<p>Data unavailable.</p>";
                } else {
                  return buildErrorTooltip(featureName);
                }
              });
            }
          );

          Promise.all(fetchPromises).then((results) => {
            if (
              hoverEventIdRef.current === currentHoverEventId &&
              hoverInfoRef.current.popup
            ) {
              // Merge results back into the right places based on the original description order
              const combinedDescriptions = [];
              for (let i = 0; i < descriptions.length; i++) {
                const requestIdx = requestIndexByDescriptionIndex[i];
                if (requestIdx === undefined) {
                  // No custom part for this description; keep as is
                  combinedDescriptions.push(descriptions[i]);
                } else {
                  const req = apiRequests[requestIdx];
                  const resultHtml = results[requestIdx];
                  if (req.joinToDefault) {
                    // Insert custom HTML into the base tooltip structure
                    const base = descriptions[i] || "";
                    combinedDescriptions.push(insertCustomIntoDefault(base, resultHtml));
                  } else {
                    // Replace the placeholder with the custom HTML
                    combinedDescriptions.push(resultHtml);
                  }
                }
              }
              const aggregatedHtml = combinedDescriptions.join('<hr class="thick-divider">');
              hoverInfoRef.current.popup.setHTML(aggregatedHtml);
            }
          });
        };

        const timeoutId = setTimeout(fetchData, 100);
        hoverInfoRef.current.timeoutId = timeoutId;
      }
    },
    [map, state.layers, state.visualisations, generateMetadataHtml]
  );

  /**
   * Handles click events on a layer and displays a popup with information about the clicked feature.
   * @property {Object} e - The event object containing information about the click event.
   * @property {string} layerId - The ID of the layer being clicked.
   * @property {number} bufferSize - The size of the buffer around the click point for querying features.
   */
  const handleLayerClick = (e, layerId, bufferSize) => {
    if (popups[layerId]?.length) {
      popups[layerId].forEach((popup) => popup.remove());
      popups[layerId] = [];
    }
    const bufferdPoint = [
      [e.point.x - bufferSize, e.point.y - bufferSize],
      [e.point.x + bufferSize, e.point.y + bufferSize],
    ];
    const feature = map.queryRenderedFeatures(bufferdPoint, {
      layers: [layerId],
    });
    if (feature.length !== 0) {
      const coordinates = e.lngLat;
      const description = `<p>${feature[0].properties.name ?? ""}</p><p> Id: ${feature[0].properties.id}</p><p>Value: ${
          feature[0].state.value ?? 0
        }</p>`;
      const newPopup = new maplibregl.Popup({ closeOnClick: false })
        .setLngLat(coordinates)
        .setHTML(description)
        .addTo(map);
      if (!popups[layerId]) {
        popups[layerId] = [];
      }
      popups[layerId].push(newPopup);
    }
  };

  /**
   * Handles mouse leave events for a specific layer by clearing the hover state.
   *
   * @property {string} layerId - The ID of the layer from which the mouse has left.
   */
  const handleLayerLeave = useCallback(
    (layerId) => {
      if (!map) return;
      if (map.getLayer(`${layerId}-hover`) && hoverIdRef.current[layerId]) {
        const sourceLayer = getSourceLayer(map, layerId);
        map.setFeatureState(
          { source: layerId, id: hoverIdRef.current[layerId], sourceLayer },
          { hover: false }
        );
      }
    },
    [map]
  );

  /**
 * Handles zoom events to control the visibility and creation of label layers.
 * If labelNulls is true, labels all features. If false, only labels features where feature-state is not null.
 *
 * @param {number} labelZoomLevel - The zoom level at which labels should start appearing.
 * @param {string} layerId - The ID of the layer for which labels are being controlled.
 * @param {string} sourceLayerName - The name of the source layer.
 * @param {boolean} labelNulls - Flag indicating whether to label features with null feature-state values.
 */
  const handleZoom = useCallback(
    (labelZoomLevel, layerId, sourceLayerName, labelNulls) => {
      const mapZoomLevel = map.getZoom();

      if (mapZoomLevel <= labelZoomLevel) {
        if (map.getLayer(`${layerId}-label`)) {
          map.setLayoutProperty(`${layerId}-label`, 'visibility', 'none');
        }
      } else {
        if (!map.getLayer(`${layerId}-label`)) {
          // Query the source features to determine the geometry type
          const features = map.querySourceFeatures(layerId, {
            sourceLayer: sourceLayerName
          });
  
          if (features.length > 0) {
            const geometryType = features[0].geometry.type;
  
            // Determine symbol placement based on geometry type
            let symbolPlacement = 'point'; // Default to point
            if (geometryType === 'LineString' || geometryType === 'MultiLineString') {
              symbolPlacement = 'line';
            }
  
            // Create the layer if it does not exist
            map.addLayer({
              id: `${layerId}-label`,
              type: 'symbol',
              source: layerId,
              'source-layer': sourceLayerName,
              layout: {
                'text-field': ['get', 'name'],
                'text-size': 14,
                'text-anchor': 'center', // centre the text
                'text-offset': [0, 1.5], // No offset
                'text-allow-overlap': false,
                'symbol-placement': symbolPlacement, // Dynamic placement
                'symbol-spacing': 250
              },
              paint: {
                'text-color': '#000000',  // Black text
                'text-halo-color': '#ffffff',  // White halo for readability
                'text-halo-width': 2.5,
                'text-opacity': labelNulls ? 1 : ['case', ["in", ["feature-state", "value"], ["literal", [null]]], 0, 1],
              }
            });
          }
        } else {
          map.setLayoutProperty(`${layerId}-label`, 'visibility', 'visible');
        }
      }
    },
    [map]
  );
  
  
  // **Set up click and zoom handlers**
  useEffect(() => {
    if (!map) return;
    const isTouch = window.matchMedia('(hover: none), (pointer: coarse)').matches;

    Object.keys(state.layers).forEach((layerId) => {
      if (state.layers[layerId].shouldHaveLabel) {
        const layerData = state.layers[layerId];
        const zoomLevel = layerData.labelZoomLevel || 12;
        const sourceLayer = layerData.sourceLayer;
        const labelNulls = layerData.labelNulls;

        const zoomHandler = () => handleZoom(zoomLevel, layerId, sourceLayer, labelNulls);
        map.on('zoomend', zoomHandler);
        if (!listenerCallbackRef.current[layerId]) {
          listenerCallbackRef.current[layerId] = {};
        }
        listenerCallbackRef.current[layerId].zoomHandler = zoomHandler;
      }
      if (!isTouch && state.layers[layerId].shouldHaveTooltipOnClick) {
        const bufferSize = state.layers[layerId].bufferSize ?? 0;
        const clickCallback = (e) => handleLayerClick(e, layerId, bufferSize);
        map.on("click", clickCallback);
        map.on("mouseenter", layerId, () => {
          map.getCanvas().style.cursor = "pointer";
        });
        map.on("mouseleave", layerId, () => {
          map.getCanvas().style.cursor = "grab";
        });
        if (!listenerCallbackRef.current[layerId]) {
          listenerCallbackRef.current[layerId] = {};
        }
        listenerCallbackRef.current[layerId].clickCallback = clickCallback;
      }
    });

    return () => {
      Object.keys(state.layers).forEach((layerId) => {
        if (popups[layerId]?.length) {
          popups[layerId].forEach((popup) => popup.remove());
          popups[layerId] = [];
        }
        if (
          state.layers[layerId].shouldHaveTooltipOnClick
        ) {
          const { clickCallback, zoomHandler } =
            listenerCallbackRef.current[layerId];
          if (clickCallback) {map.off("click", clickCallback)};
          map.off('zoomend', zoomHandler);

          // Clean up hover info
          if (hoverInfoRef.current[layerId]) {
            const { timeoutId, abortController, popup } =
              hoverInfoRef.current[layerId];
            if (timeoutId) clearTimeout(timeoutId);
            if (abortController) abortController.abort();
            if (popup) popup.remove();
            hoverInfoRef.current[layerId] = null;
          }
        }
        if (state.layers[layerId].shouldHaveLabel) {
          const zoomHandler = listenerCallbackRef.current[layerId]?.zoomHandler;
          map.off('zoomend', zoomHandler);
        }
      });
    };
  }, [map, handleLayerLeave, state.layers, state.visualisations]);

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

        // Set the 'selected' state of the currently selected feature
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
      const hoverCallback = (e) => handleMapHover(e);
      map.on("mousemove", hoverCallback);

      const mouseLeaveCallback = () => {
        if (hoverInfoRef.current.popup) {
          hoverInfoRef.current.popup.remove();
          hoverInfoRef.current.popup = null;
        }
        if (hoverInfoRef.current.abortController) {
          hoverInfoRef.current.abortController.abort();
          hoverInfoRef.current.abortController = null;
        }
        if (hoverInfoRef.current.timeoutId) {
          clearTimeout(hoverInfoRef.current.timeoutId);
          hoverInfoRef.current.timeoutId = null;
        }
        prevHoveredFeaturesRef.current.forEach(({ source, sourceLayer, featureId }) => {
          map.setFeatureState({ source, id: featureId, sourceLayer }, { hover: false });
        });
        prevHoveredFeaturesRef.current = [];
      };
      map.getCanvas().addEventListener("mouseleave", mouseLeaveCallback);

      listenerCallbackRef.current.hoverCallback = hoverCallback;
      listenerCallbackRef.current.mouseLeaveCallback = mouseLeaveCallback;

      return () => {
        if (listenerCallbackRef.current.hoverCallback) {
          map.off("mousemove", listenerCallbackRef.current.hoverCallback);
        }
        if (listenerCallbackRef.current.mouseLeaveCallback) {
          map.getCanvas().removeEventListener("mouseleave", listenerCallbackRef.current.mouseLeaveCallback);
        }
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
      if (hoverInfoRef.current.popup) {
        hoverInfoRef.current.popup.remove();
        hoverInfoRef.current.popup = null;
      }
      prevHoveredFeaturesRef.current.forEach(({ source, sourceLayer, featureId }) => {
        map.setFeatureState({ source, id: featureId, sourceLayer }, { hover: false });
      });
      prevHoveredFeaturesRef.current = [];
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
      const { centroid, bounds, featureName, layerMetadata = {} } = state.mapBoundsAndCentroid;

      if (bounds && centroid) {
        // Find min max for calculating padding
        const coords = bounds.coordinates[0];
        const lngs = coords.map(c => c[0]);
        const lats = coords.map(c => c[1]);
        const minLng = Math.min(...lngs);
        const maxLng = Math.max(...lngs);
        const minLat = Math.min(...lats);
        const maxLat = Math.max(...lats);
        
        // Calculate padding based on geometry size
        const lngDiff = maxLng - minLng;
        const latDiff = maxLat - minLat;
        const maxDiff = Math.max(lngDiff, latDiff);
        const basePadding = maxDiff < 0.01 ? 150 : maxDiff < 0.05 ? 120 : 100;

        const zoomToFeatureMaxZoom = layerMetadata.zoomToFeatureMaxZoom ?? 14;
        const zoomToFeatureDuration = layerMetadata.zoomToFeatureDuration ?? 1000;
        const zoomToFeatureLinear = layerMetadata.zoomToFeatureLinear ?? false;

        // Fit bounds to show entire geometry
        map.fitBounds([[minLng, minLat], [maxLng, maxLat]], {
          padding: basePadding,
          maxZoom: zoomToFeatureMaxZoom,
          duration: zoomToFeatureDuration,
          linear: zoomToFeatureLinear,
        });
      } else if (centroid) {
        map.panTo(centroid.coordinates, {
          duration: layerMetadata.zoomToFeatureDuration ?? 1000
        });
      }

      // If a featureName is provided, show a temporary label on the map
      if (featureName && centroid) {
        const LABEL_DISPLAY_DURATION = 5000;
        const labelLayerId = 'feature-label';
        const labelSourceId = 'feature-label-source';

        // Clear any existing timeout so it doesn't remove the new label
        if (labelTimeoutRef.current) {
          clearTimeout(labelTimeoutRef.current);
          labelTimeoutRef.current = null;
        }

        if (map.getLayer(labelLayerId)) {
          map.removeLayer(labelLayerId);
          map.removeSource(labelSourceId);
        }

        map.addSource(labelSourceId, {
          type: 'geojson',
          data: {
            type: 'Feature',
            geometry: {
              type: 'Point',
              coordinates: centroid.coordinates,
            },
            properties: {
              name: featureName,
            },
          },
        });

        map.addLayer({
          id: labelLayerId,
          type: 'symbol',
          source: labelSourceId,
          layout: {
            'text-field': ['get', 'name'],
            'text-font': ['Noto Sans Bold'],
            'text-size': 14,
            'text-offset': [0, 1.5],
            'text-anchor': 'top',
            'text-allow-overlap': true,
            'text-ignore-placement': true,
          },
          paint: {
            'text-color': '#000000',
            'text-halo-color': '#ffffff',
            'text-halo-width': 2,
            'text-opacity': 1,
          },
        });

        labelTimeoutRef.current = setTimeout(() => {
          if (map.getLayer(labelLayerId)) {
            map.removeLayer(labelLayerId);
            map.removeSource(labelSourceId);
          }
          labelTimeoutRef.current = null;
        }, LABEL_DISPLAY_DURATION);
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
