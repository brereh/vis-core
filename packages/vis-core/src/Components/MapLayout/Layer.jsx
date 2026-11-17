import { useEffect, useContext, useMemo, useRef } from "react";
import { api } from "services";
import {
  appendQueryParams,
  getLayerStyle,
  getOpacityProperty,
  moveTownCityLabelsToTop,
} from "utils";
import { getBaseMap } from "../../map/baseMaps";
import {
  resolveLayerPaint,
  resolveBoundaryColor,
  resolveBoundaryPaint,
} from "../../map/applicationLayerTheme";
import { useMapContext } from "hooks/useMapContext";
import { FilterContext } from "contexts/FilterContext";
import { actionTypes } from "reducers/mapReducer";
import { DEFAULT_LAYER_OPACITY } from "defaults";
import { loadImagesFromTileFeatures } from "utils/imageLoader";
import { addHoverLayers, removeHoverLayers } from "../../map/hoverStyle";

/**
 * Layer component that adds a layer to the map(s) and handles its lifecycle.
 *
 * This component is responsible for adding a specified layer to its pane's map and managing
 * its lifecycle, including cleanup when the component is unmounted. Each map pane renders its
 * own Layer for each layer it shows.
 * It supports both GeoJSON and tile-based layers and can optionally add hover
 * and select effects to the layers.
 *
 * @param {Object} props - The properties of the layer.
 * @param {Object} props.layer - The layer configuration object.
 * @param {string} props.layer.name - The unique name of the layer.
 * @param {string} props.layer.type - The type of the layer, either "geojson" or "tile".
 * @param {string} props.layer.geometryType - The geometry type of the layer (e.g., "line", "point").
 * @param {boolean} [props.layer.hiddenByDefault] - Whether the layer should be hidden by default.
 * @param {boolean} [props.layer.isStylable] - Whether the layer is stylable.
 * @param {boolean} [props.layer.isHoverable] - Whether the layer should have a hover effect.
 * @param {string} [props.layer.path] - The path or URL to the layer data.
 * @param {string} [props.layer.source] - The source of the layer data, e.g., "api".
 * @param {string} [props.layer.sourceLayer] - The source layer name for tile layers.
 * @param {Object} [props.map] - The pane's MapLibre map (nothing is added until it exists).
 * @param {string} [props.paneId] - The pane's id, for layers with a path per pane.
 */
export const Layer = ({ layer, map, paneId }) => {
  const { state, dispatch } = useMapContext();
  const { paramNameToUuidMap } = state;
  // The pane's map, as a list for the effects below (empty until the map exists).
  const paneMaps = useMemo(() => (map ? [map] : []), [map]);

  // Whether the dark base map is currently active
  const currentBaseMap = getBaseMap(state.baseMapId);
  const theme = currentBaseMap.theme;
  const isDarkMode = theme === "dark";

  /**
   * Resolves the boundary line opacity.
   * If boundariesOpacityMode is 'fixed', returns boundariesOpacity (or 1).
   * Otherwise falls back to parent layer defaultOpacity or DEFAULT_LAYER_OPACITY.
   */
  const resolveBoundariesOpacity = () => {
    const mode =
      layer.boundariesOpacityMode ??
      (layer.metadata?.boundariesOpacityMode ??
        (layer.boundariesOpacity != null || layer.metadata?.boundariesOpacity != null
          ? "fixed"
          : "inherit"));
    if (mode === "fixed") {
      return layer.boundariesOpacity != null && !isNaN(Number(layer.boundariesOpacity))
        ? Number(layer.boundariesOpacity)
        : 1;
    }
    if (layer.defaultOpacity != null && !isNaN(Number(layer.defaultOpacity))) {
      return Number(layer.defaultOpacity);
    }
    return DEFAULT_LAYER_OPACITY;
  };

  // Access filters from FilterContext
  const filterContext = useContext(FilterContext);
  const filters = filterContext?.state || {};
  const loadingRef = useRef(false);

  // Track the last tiles URL we applied per map instance (used to avoid redundant updates).
  const lastTilesUrlByMapRef = useRef(new WeakMap());

  // Boundaries visibility per map, kept across a remove/re-add (e.g. a new zone tile path).
  const boundariesVisibilityByMapRef = useRef(new WeakMap());
  const rememberBoundariesVisibility = (mapInstance) => {
    const id = `${layer.name}-boundaries`;
    if (mapInstance.getLayer(id)) {
      boundariesVisibilityByMapRef.current.set(mapInstance, mapInstance.getLayoutProperty(id, "visibility"));
    }
  };
  const boundariesVisibilityFor = (mapInstance) =>
    boundariesVisibilityByMapRef.current.get(mapInstance) ??
    (layer.boundariesVisibleByDefault ? "visible" : "none");

  const computedTileUrl = useMemo(() => {
    if (layer.type !== "tile") return null;

    const baseUrl =
      layer.source === "api"
        ? api.geodataService.buildTileLayerUrl(layer.path)
        : layer.path;

    return baseUrl;
  }, [layer.type, layer.source, layer.path]);

  // Opt-in (see reducers/paneState.js): a layer with separatePanePaths (or the older
  // separateSidePaths) can have a different path on each pane's map. Other layers use layer.path.
  const usesPanePaths = Boolean(
    (layer.separatePanePaths || layer.separateSidePaths) && layer.panePaths
  );
  const pathForMap = () => (usesPanePaths ? layer.panePaths[paneId] ?? layer.path : layer.path);
  // Such a layer's path never changes, so re-add it when its params arrive; null for other layers.
  const panePathsMissingCount = usesPanePaths ? layer.missingParams?.length ?? 0 : null;
  const tileUrlForMap = (mapInstance) => {
    if (!usesPanePaths) return computedTileUrl;
    const path = pathForMap();
    return layer.source === "api" ? api.geodataService.buildTileLayerUrl(path) : path;
  };


  useEffect(() => {
    // Determine the maps to operate on
    const targetMaps = paneMaps;

    // If no map instances are available, exit early
    if (targetMaps.length === 0) return;


    // If missingParams are present, remove the layer if it exists
    if (layer.missingParams?.length > 0) {
      targetMaps.forEach((mapInstance) => {
        if (!mapInstance || !mapInstance.style) return;
        if (mapInstance.getLayer(layer.name)) {
          mapInstance.removeLayer(layer.name);
        }
        if (mapInstance.getLayer(`${layer.name}-symbols`)) {
          mapInstance.removeLayer(`${layer.name}-symbols`);
        }
        if (mapInstance.getLayer(`${layer.name}-symbols-hover`)) {
          mapInstance.removeLayer(`${layer.name}-symbols-hover`);
        }
        removeHoverLayers(mapInstance, layer.name);
        if (mapInstance.getLayer(`${layer.name}-select`)) {
          mapInstance.removeLayer(`${layer.name}-select`);
        }
        rememberBoundariesVisibility(mapInstance);
        if (mapInstance.getLayer(`${layer.name}-boundaries`)) {
          mapInstance.removeLayer(`${layer.name}-boundaries`);
        }
        if (mapInstance.getLayer("selected-feature-layer")?.source === layer.name) {
          mapInstance.removeLayer("selected-feature-layer");
        }
        if (mapInstance.getSource(layer.name)) {
          mapInstance.removeSource(layer.name);
        }
      });
      return; // Exit the useEffect early
    }

    // Check if the layer is already added to avoid duplicates
    targetMaps.forEach((mapInstance) => {
      if (!mapInstance) return;

      if (!mapInstance.getSource(layer.name)) {
        let sourceConfig = {};
        let layerConfig = {
          ...getLayerStyle(layer.geometryType),
          id: layer.name,
          maxzoom: layer.maxZoom || 24,
          minzoom: layer.minZoom || 0,
          bufferSize: layer.bufferSize
        };
        layerConfig.paint = resolveLayerPaint({ layer, theme });

        // Apply defaultOpacity to the layer's paint properties if specified
        const opacityProp = getOpacityProperty(layerConfig.type);
        if (layerConfig.paint && opacityProp) {
          if (layer.isStylable) {
            // For stylable layers, start them with opacity 0 to prevent flashing
            // before MapVisualisation applies the actual data-driven style
            layerConfig.paint[opacityProp] = 0;
          } else if (layer.defaultOpacity) {
            layerConfig.paint[opacityProp] = layer.defaultOpacity;
          }
        }

        const layerLayout = {};
        layerLayout.visibility = layer?.hiddenByDefault ? "none" : "visible";
        layerConfig.layout = {...layerConfig.layout, ...layerLayout };
        layerConfig.metadata = {
          ...(layer.metadata ?? {}),
          ...layerConfig.metadata,
          isStylable: layer.isStylable ?? false,
          path: pathForMap() ?? null,
          legendCacheField: layer.legendCacheField ?? null,
          shouldShowInLegend: layer.shouldShowInLegend ?? (layer.isStylable ? true : false),
          shouldHaveOpacityControl: layer.shouldHaveOpacityControl ?? true, // opacity control should appear by default
          enforceNoColourSchemeSelector: layer.enforceNoColourSchemeSelector ?? false, // colour scheme selector should appear if stylable, unless this is enforced
          enforceNoClassificationMethod: layer.enforceNoClassificationMethod ?? false, // classification method selector should appear if stylable, unless this is enforced
          shouldFixLineWidth: layer.shouldFixLineWidth ?? false,
          fixedLineWidth:
            typeof layer.fixedLineWidth === "number" && Number.isFinite(layer.fixedLineWidth)
              ? layer.fixedLineWidth
              : null,
          enforceNoCustomBanding: layer.enforceNoCustomBanding ?? false,
          hideOutOfBandWarning: layer.hideOutOfBandWarning ?? true,
          zoomToFeaturePlaceholderText: layer.zoomToFeaturePlaceholderText || "",
          defaultOpacity: layer.defaultOpacity ?? DEFAULT_LAYER_OPACITY, // configurable default opacity with fallback
          switchableBoundaries: layer.switchableBoundaries !== false && layer.geometryType === "polygon",
          boundariesVisibleByDefault: layer.boundariesVisibleByDefault ?? false,
          boundariesLabel: layer.boundariesLabel ?? "Show Zone Boundaries"
        };

        // Handle GeoJSON layer type
        if (layer.type === "geojson") {
          api.geodataService.getLayer(layer).then((geojson) => {
            sourceConfig.type = "geojson";
            sourceConfig.data = geojson;
            mapInstance.addSource(layer.name, sourceConfig);
            mapInstance.addLayer({ ...layerConfig, source: layer.name });

            if (layer.switchableBoundaries !== false && layer.geometryType === "polygon") {
              const boundariesLayerConfig = {
                id: `${layer.name}-boundaries`,
                type: "line",
                source: layer.name,
                layout: {
                  visibility: boundariesVisibilityFor(mapInstance),
                },
                paint: resolveBoundaryPaint({
                  layer,
                  theme,
                  parentOpacity: resolveBoundariesOpacity(),
                }),
                metadata: {
                  isStylable: false,
                }
              };
              mapInstance.addLayer(boundariesLayerConfig);
            }

            // Add the hover layer if the layer is hoverable
            if (layer.isHoverable) {
              addHoverLayers(mapInstance, {
                baseLayerId: layer.name,
                geometryType: layer.geometryType,
                source: layer.name,
                theme,
                basePaint: layerConfig.paint,
              });
            }

            // Add the select layers
            addHoverLayers(mapInstance, {
              kind: "selected",
              baseLayerId: layer.name,
              geometryType: layer.geometryType,
              source: layer.name,
              theme,
              basePaint: layerConfig.paint,
            });
            moveTownCityLabelsToTop(mapInstance);
          });
        }
        // Handle tile layer type
        else if (layer.type === "tile") {
          const url =
            tileUrlForMap(mapInstance) ||
            (layer.source === "api"
              ? api.geodataService.buildTileLayerUrl(layer.path)
              : layer.path);


          sourceConfig.type = "vector";
          sourceConfig.tiles = [url];
          // If configured, ensure the *source* also respects zoom constraints.
          // (MapLibre can request tiles for hidden layers unless the source is also gated.)
          if (typeof layer.minZoom === "number") {
            sourceConfig.minzoom = layer.minZoom;
          }
          if (typeof layer.maxZoom === "number") {
            sourceConfig.maxzoom = layer.maxZoom;
          }
          sourceConfig.promoteId = "id";
          mapInstance.addSource(layer.name, sourceConfig);
          // Remember what we mounted with so later tile-template updates can diff correctly.
          lastTilesUrlByMapRef.current.set(mapInstance, url);
          
          // Apply defaultOpacity to tile layer paint properties if specified
          const opacityProp = getOpacityProperty(layerConfig.type);
          if (layerConfig.paint && opacityProp) {
            if (layer.isStylable) {
              layerConfig.paint[opacityProp] = 0;
            } else if (layer.defaultOpacity) {
              layerConfig.paint[opacityProp] = layer.defaultOpacity;
            }
          }
          
          mapInstance.addLayer({
            ...layerConfig,
            source: layer.name,
            "source-layer": layer.sourceLayer,
            metadata: {
              ...layerConfig.metadata,
              isStylable: layer.isStylable ?? false,
              bufferSize: layer.bufferSize,
              defaultOpacity: layer.defaultOpacity ?? DEFAULT_LAYER_OPACITY, // configurable default opacity with fallback
              switchableBoundaries: layer.switchableBoundaries !== false && layer.geometryType === "polygon",
              boundariesVisibleByDefault: layer.boundariesVisibleByDefault ?? false,
              boundariesLabel: layer.boundariesLabel ?? "Show Zone Boundaries"
            },
          });

          // Set up image loading for image-marker layers
          if (layer.customRenderer === "image-marker") {
            const handleSourceData = (e) => {
              if (e.sourceId === layer.name && 
                  e.isSourceLoaded && 
                  !loadingRef.current) {
                loadingRef.current = true;
                
                loadImagesFromTileFeatures(mapInstance, layer)
                  .then(() => {
                  })
                  .catch((error) => {
                    console.error(`Error loading images for ${layer.name}:`, error);
                  })
                  .finally(() => {
                    loadingRef.current = false;
                  });
              }
            };
            
            mapInstance.on('sourcedata', handleSourceData);
          }

          if (layer.switchableBoundaries !== false && layer.geometryType === "polygon") {
            const boundariesLayerConfig = {
              id: `${layer.name}-boundaries`,
              type: "line",
              source: layer.name,
              "source-layer": layer.sourceLayer,
              layout: {
                visibility: boundariesVisibilityFor(mapInstance),
              },
              paint: resolveBoundaryPaint({
                layer,
                theme,
                parentOpacity: resolveBoundariesOpacity(),
              }),
              metadata: {
                isStylable: false,
              }
            };
            mapInstance.addLayer(boundariesLayerConfig);
          }

          // Add the hover layer if the layer is hoverable
          if (layer.isHoverable) {
            addHoverLayers(mapInstance, {
              baseLayerId: layer.name,
              geometryType: layer.geometryType,
              source: layer.name,
              sourceLayer: layer.sourceLayer,
              theme,
              basePaint: layerConfig.paint,
            });
          }

          // Add the select layers
          addHoverLayers(mapInstance, {
            kind: "selected",
            baseLayerId: layer.name,
            geometryType: layer.geometryType,
            source: layer.name,
            sourceLayer: layer.sourceLayer,
            theme,
            basePaint: layerConfig.paint,
          });
          moveTownCityLabelsToTop(mapInstance);
        }
      }
    });

    // Cleanup function to remove layers and sources when the component unmounts
    return () => {
      targetMaps.forEach((mapInstance) => {
        if (!mapInstance || !mapInstance.style) return;

        if (mapInstance.getLayer(layer.name)) {
          mapInstance.removeLayer(layer.name);
        }
        if (mapInstance.getLayer(`${layer.name}-symbols`)) {
          mapInstance.removeLayer(`${layer.name}-symbols`);
        }
        if (mapInstance.getLayer(`${layer.name}-symbols-hover`)) {
          mapInstance.removeLayer(`${layer.name}-symbols-hover`);
        }
        removeHoverLayers(mapInstance, layer.name);
        if (mapInstance.getLayer(`${layer.name}-select`)) {
          mapInstance.removeLayer(`${layer.name}-select`);
        }
        rememberBoundariesVisibility(mapInstance);
        if (mapInstance.getLayer(`${layer.name}-boundaries`)) {
          mapInstance.removeLayer(`${layer.name}-boundaries`);
        }
        if (mapInstance.getLayer(`${layer.name}-label`)) {
          mapInstance.removeLayer(`${layer.name}-label`);
        }
        if (mapInstance.getLayer("selected-feature-layer")) {
          mapInstance.removeLayer("selected-feature-layer");
        }
        if (mapInstance.getSource(layer.name)) {
          mapInstance.removeSource(layer.name);
        }
        if (mapInstance.getSource("selected-feature-source")) {
          mapInstance.removeSource("selected-feature-source");
        }
      });
    };
  }, [paneMaps, layer.name, layer.path, layer.type, layer.geometryType, panePathsMissingCount]);

  // If this is a tile layer and its computed tile URL changes,
  // update the existing source tiles in-place.
  useEffect(() => {
    if (layer.type !== "tile") return;
    const targetMaps = paneMaps;
    if (targetMaps.length === 0) return;
    if (!computedTileUrl) return;


    targetMaps.forEach((mapInstance) => {
      if (!mapInstance) return;

      const src = mapInstance.getSource(layer.name);
      if (!src) return;

      const tileUrl = tileUrlForMap(mapInstance);
      const lastUrl = lastTilesUrlByMapRef.current.get(mapInstance);
      if (lastUrl === tileUrl) return;

      // Prefer in-place update if supported by MapLibre.
      if (typeof src.setTiles === "function") {
        try {
          src.setTiles([tileUrl]);
          lastTilesUrlByMapRef.current.set(mapInstance, tileUrl);
          return;
        } catch (e) {
          // Fall through to remove/re-add.
        }
      }

      // Fallback: remove and re-add source + layers.
      try {
        rememberBoundariesVisibility(mapInstance);
        [
          layer.name,
          `${layer.name}-symbols`,
          `${layer.name}-symbols-hover`,
          `${layer.name}-hover-halo`,
          `${layer.name}-hover`,
          `${layer.name}-select-halo`,
          `${layer.name}-select`,
          `${layer.name}-boundaries`,
          `${layer.name}-label`,
        ].forEach((layerId) => {
          if (mapInstance.getLayer(layerId)) mapInstance.removeLayer(layerId);
        });
        if (mapInstance.getLayer("selected-feature-layer")?.source === layer.name) {
          mapInstance.removeLayer("selected-feature-layer");
        }
        if (mapInstance.getSource(layer.name)) mapInstance.removeSource(layer.name);
      } catch {
        // If removal fails, don't try to re-add.
        return;
      }

      const sourceConfig = {
        type: "vector",
        tiles: [tileUrl],
        promoteId: "id",
      };
      if (typeof layer.minZoom === "number") sourceConfig.minzoom = layer.minZoom;
      if (typeof layer.maxZoom === "number") sourceConfig.maxzoom = layer.maxZoom;

      mapInstance.addSource(layer.name, sourceConfig);

      const baseLayerConfig = {
        ...getLayerStyle(layer.geometryType),
        id: layer.name,
        source: layer.name,
        "source-layer": layer.sourceLayer,
        maxzoom: layer.maxZoom || 24,
        minzoom: layer.minZoom || 0,
        bufferSize: layer.bufferSize,
        paint: resolveLayerPaint({ layer, theme }),
        layout: {
          ...(getLayerStyle(layer.geometryType).layout || {}),
          visibility: layer?.hiddenByDefault ? "none" : "visible",
        },
        metadata: {
          ...(layer.metadata ?? {}),
          ...(getLayerStyle(layer.geometryType).metadata || {}),
          isStylable: layer.isStylable ?? false,
          path: pathForMap() ?? null,
          shouldShowInLegend: layer.shouldShowInLegend || (layer.isStylable ? true : false),
          shouldHaveOpacityControl: layer.shouldHaveOpacityControl ?? true,
          enforceNoColourSchemeSelector: layer.enforceNoColourSchemeSelector ?? false,
          enforceNoClassificationMethod: layer.enforceNoClassificationMethod ?? false,
          shouldFixLineWidth: layer.shouldFixLineWidth ?? false,
          fixedLineWidth:
            typeof layer.fixedLineWidth === "number" && Number.isFinite(layer.fixedLineWidth)
              ? layer.fixedLineWidth
              : null,
          enforceNoCustomBanding: layer.enforceNoCustomBanding ?? false,
          hideOutOfBandWarning: layer.hideOutOfBandWarning ?? true,
          zoomToFeaturePlaceholderText: layer.zoomToFeaturePlaceholderText || "",
          defaultOpacity: layer.defaultOpacity ?? DEFAULT_LAYER_OPACITY,
          bufferSize: layer.bufferSize,
        },
      };

      // Apply defaultOpacity if specified.
      const opacityProp = getOpacityProperty(baseLayerConfig.type);
      if (baseLayerConfig.paint && opacityProp) {
        if (layer.isStylable) {
          baseLayerConfig.paint[opacityProp] = 0;
        } else if (layer.defaultOpacity) {
          baseLayerConfig.paint[opacityProp] = layer.defaultOpacity;
        }
      }

      mapInstance.addLayer(baseLayerConfig);

      if (layer.switchableBoundaries !== false && layer.geometryType === "polygon") {
        const boundariesLayerConfig = {
          id: `${layer.name}-boundaries`,
          type: "line",
          source: layer.name,
          "source-layer": layer.sourceLayer,
          layout: {
            visibility: boundariesVisibilityFor(mapInstance),
          },
          paint: resolveBoundaryPaint({
            layer,
            theme,
            parentOpacity: resolveBoundariesOpacity(),
          }),
          metadata: {
            isStylable: false,
          }
        };
        mapInstance.addLayer(boundariesLayerConfig);
      }

      if (layer.isHoverable) {
        addHoverLayers(mapInstance, {
          baseLayerId: layer.name,
          geometryType: layer.geometryType,
          source: layer.name,
          sourceLayer: layer.sourceLayer,
          theme,
          basePaint: baseLayerConfig.paint,
        });
      }

      addHoverLayers(mapInstance, {
        kind: "selected",
        baseLayerId: layer.name,
        geometryType: layer.geometryType,
        source: layer.name,
        sourceLayer: layer.sourceLayer,
        theme,
        basePaint: baseLayerConfig.paint,
      });
      moveTownCityLabelsToTop(mapInstance);

      lastTilesUrlByMapRef.current.set(mapInstance, tileUrl);
    });
  }, [paneMaps, layer, computedTileUrl, isDarkMode]);


  useEffect(() => {
    // Determine target map(s)
    const targetMaps = paneMaps;
    if (targetMaps.length === 0) return;

    // Update the tooltip URL dynamically based on filters
    if (layer.customTooltip) {
      const { url, htmlTemplate } = layer.customTooltip;
      let requestUrl = url;
      if (!url || !htmlTemplate) {
        console.error("Both url and htmlTemplate must be provided for customTooltip.");
        return;
      }
      if (Object.keys(filters).length > 0) {
        requestUrl = url.replace(/\{(\w+)\}/g, (_, key) => {
          const uuid = paramNameToUuidMap?.[key];
          return uuid && filters[uuid] !== undefined ? filters[uuid] : `{${key}}`;
        });
        dispatch({
          type: actionTypes.UPDATE_LAYER_TOOLTIP_URL,
          payload: { layerName: layer.name, requestUrl },
        });
      }
    }

  }, [filters, paramNameToUuidMap, paneMaps, dispatch]);
  
  // This component does not render any visible elements
  return null;
};