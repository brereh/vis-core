import colorbrewer from "colorbrewer";
import { useCallback, useEffect, useRef, useContext, useMemo, useState } from "react";
import { useMapContext } from "hooks/useMapContext";
import { AppContext } from "contexts/AppContext";
import { actionTypes } from "reducers";
import {
  buildCategoricalLegendKey,
  colorSchemes,
  createPaintProperty,
  resolveCategoricalColours,
  reclassifyData,
  reclassifyGeoJSONData,
  resetPaintProperty,
  hasAnyGeometryNotNull,
  getMetricDefinition,
  getVisualisationDisplayMode,
  determineDynamicStyle
} from "utils";
import chroma from "chroma-js";
import { useFetchVisualisationData } from "hooks/useFetchVisualisationData";
import { useFeatureStateUpdater } from "hooks/useFeatureStateUpdater";
import { useVisualisationLoadingCounter } from "hooks/useVisualisationLoadingCounter"; // Import the custom hook
import { registerMapRestorer } from "../../map/runtimeRestorationRegistry";
import { SINGLE_PANE_ID } from "../../map/resolveMapGrid";
import { selectClassificationPanes, selectPaneData } from "../../reducers/mapSelectors";
import { usePaneVisualisation, useShallowStableArray } from "hooks/usePaneVisualisation";
import { defaultMapColourMapper } from "defaults";
import { DataFetchState } from "enums";

// Constants
const DEFAULT_OPACITY = 0.65;
const DEFAULT_COLOR_STYLE = "continuous";


const areNumericArraysEqual = (a, b) => {
  if (a === b) return true;
  if (!Array.isArray(a) || !Array.isArray(b)) return false;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    // Normalise to numbers so ["1", 2] and [1, 2] compare equal.
    if (Number(a[i]) !== Number(b[i])) return false;
  }
  return true;
};

/**
 * A joined visualisation is drawable when it has records.
 * A GeoJSON visualisation is drawable when the API returned a feature collection,
 * either as an array of rows or as a single `{ feature_collection }` object.
 *
 * @param {Array|Object|null|undefined} data
 * @returns {boolean}
 */
const hasDrawableVisualisationData = (data) => {
  if (data == null) return false;
  if (Array.isArray(data)) return data.length > 0;
  return Boolean(data.feature_collection);
};

/**
 * Normalises a visualisation's data into an array of records safe to classify.
 *
 * `useFetchVisualisationData` already unwraps the `{ data, metadata }` envelope, so anything
 * else arriving here is an unrecognised response shape. Rather than letting it reach
 * `reclassifyData` (which calls `.map` on it), fall back to an empty array so the layer
 * renders unstyled and log the shape for diagnosis. A `{ feature_collection }` object is a
 * recognised GeoJSON payload and is classified on its own path, so it is not a warning.
 *
 * @param {Array|Object|null} data - The visualisation data as returned by the fetch hook.
 * @param {string} visualisationName - Name of the visualisation, used for the warning.
 * @returns {Array} The records to classify, or an empty array if the shape is unusable.
 */
const toClassifiableArray = (data, visualisationName) => {
  if (Array.isArray(data)) {
    return data;
  }
  if (data == null || hasDrawableVisualisationData(data)) {
    return [];
  }

  console.warn(
    `Visualisation "${visualisationName}" returned a non-array payload; skipping classification.`,
    data
  );
  return [];
};

/**
 * Calculates the colour palette based on the provided color scheme and number of bins.
 */
const calculateColours = (colourScheme, bins, invert = false) => {
  const maxBins = 9;
  
  let colors;
  // colorbrewer does not provide 1-2 class palettes for many schemes.
  // For small bin counts (especially 2), use chroma to sample the full scheme.
  if (bins.length > 0 && bins.length < 3) {
    colors = chroma.scale(colourScheme).colors(bins.length);
  } else if (bins.length >= maxBins) {
    colors = chroma.scale(colourScheme).colors(bins.length);
  } else {
    const binCount = Math.min(Math.max(bins.length, 3), maxBins);
    colors = colorbrewer[colourScheme][binCount];
  }
  
  return invert ? colors.slice().reverse() : colors;
};

/**
 * Builds cache entries for selected filter values that define explicit categorical colours.
 *
 * @param {Object} params - The values needed to build the overrides.
 * @param {Array} params.filters - The current filter definitions.
 * @param {Object} params.queryParams - The current visualisation query params.
 * @param {string} params.fieldName - The field name used for cache keys.
 * @param {string|null} params.schemeName - The current colour scheme name.
 * @returns {Object} Cache-style colour overrides keyed by categorical legend key.
 */
const buildSelectedCategoricalColourOverrides = ({
  filters,
  queryParams,
  fieldName,
  schemeName,
}) => {
  if (!Array.isArray(filters) || !queryParams) {
    return {};
  }

  return filters.reduce((overrides, filter) => {
    const selectedValue = queryParams?.[filter.paramName]?.value;
    if (selectedValue == null) {
      return overrides;
    }

    const selectedValues = Array.isArray(selectedValue)
      ? selectedValue
      : [selectedValue];
    const availableValues = filter?.values?.values;
    if (!Array.isArray(availableValues)) {
      return overrides;
    }

    selectedValues.forEach((currentValue) => {
      const matchedValue = availableValues.find(
        (valueItem) => String(valueItem.paramValue) === String(currentValue)
      );

      if (
        !matchedValue ||
        typeof matchedValue.colourValue !== "string" ||
        matchedValue.colourValue.trim() === ""
      ) {
        return;
      }

      const legendCacheKey = buildCategoricalLegendKey({
        fieldName,
        value: matchedValue.paramValue ?? matchedValue.displayValue,
      });
      if (!legendCacheKey) {
        return;
      }

      overrides[legendCacheKey] = {
        label: matchedValue.displayValue ?? String(currentValue),
        colour: matchedValue.colourValue,
        fieldName: String(fieldName ?? "").trim() || "value",
        schemeName,
      };
    });

    return overrides;
  }, {});
};

/**
 * MapVisualisation component responsible for rendering visualisations on a map.
 *
 * @param {Object} props - The properties passed to the component.
 * @param {string} props.visualisationName - The name of the visualisation.
 * @param {Object} props.map - The Maplibre JS map instance.
 * @param {string} [props.paneId] - The map pane this draws on. Defaults to the page's primary
 *   (on a single-map page, only) pane.
 * @returns {null} This component doesn't render anything directly.
 */
export const MapVisualisation = ({
  visualisationName,
  map,
  paneId: paneIdProp,
}) => {
  const { state, dispatch } = useMapContext();
  const paneId = paneIdProp ?? state.mapGrid?.primaryPaneId ?? SINGLE_PANE_ID;
  const appContext = useContext(AppContext);

  // The page this visualisation belongs to. Hoisted to component scope because both the
  // styling callback and the display-mode effect need it.
  const currentPage = useMemo(
    () => appContext?.appPages?.find((page) => page.url === window.location.pathname),
    [appContext?.appPages]
  );

  // Refs to keep track of previous values
  const prevCombinedDataRef = useRef();
  const prevVisualisationDataRef = useRef();
  const prevColorRef = useRef({});
  const prevClassMethodRef = useRef({});
  const prevCustomBandsRef = useRef({});
  const prevInvertRef = useRef({});

  // Ref to track pending updates during style resolution and timeouts
  const pendingUpdateRef = useRef(false);
  const styleResolutionTimeoutRef = useRef(null);

  const [forceUpdateCounter, setForceUpdateCounter] = useState(0);
  
  // Ref to track if the layer has been styled
  const LAYER_RETRY_CONFIG = { maxRetries: 10, retryDelay: 200 };
  const hasStyledLayerRef = useRef(false);

  // State for tracking resolved dynamic styles
  const [resolvedStyle, setResolvedStyle] = useState(null);
  const [isResolvingStyle, setIsResolvingStyle] = useState(false);
  const [isApplyingStyle, setIsApplyingStyle] = useState(false);

  const { addFeaturesToMap, replayLayerState } = useFeatureStateUpdater();

  // The visualisation as this pane draws it: the page's copy with the pane's own params.
  const visualisation = usePaneVisualisation(state, paneId, visualisationName);

  // Initialise resolved style when visualisation changes
  useEffect(() => {
    if (visualisation?.style) {
      setResolvedStyle(visualisation.style);
    }
  }, [visualisation?.style]);

  // Use resolved style for colour determination
  const colorStyle = useMemo(() => {
    return resolvedStyle?.split("-")[1] || DEFAULT_COLOR_STYLE;
  }, [resolvedStyle]);

  // Determine the layer key based on the visualisation type
  const layerKey = useMemo(() => {
    return visualisation?.type === "joinDataToMap"
      ? visualisation.joinLayer
      : visualisationName;
  }, [visualisation?.type, visualisation?.joinLayer, visualisationName]);

  // Retrieve classificationMethod per layer
  const classificationMethod =
    state.layers[layerKey]?.class_method ?? "d";

  // Determine the layerColorScheme based on visualisation type
  const layerColorScheme = useMemo(() => {
    return state.colorSchemesByLayer[layerKey] ?? defaultMapColourMapper[colorStyle];
  }, [layerKey, state.colorSchemesByLayer, colorStyle]);

  const shouldFilterDataToViewport = visualisation?.shouldFilterDataToViewport || false;

  // Use the custom hook to fetch data for the visualisation
  const {
    isLoading,
    data: visualisationData,
    error,
    dataWasReturnedButFiltered,
    fetchState,
    resetFetchState,
  } = useFetchVisualisationData(visualisation, {
    map,
    mapLayerId: layerKey,
    shouldFilterDataToViewport,
    debounceMs: 0, // visualisation comes from state.visualisations — already gated by MapLayout's debouncedFilterState
  });

  // Initialise classification method from visualisation config if not already set in state
  useEffect(() => {
    if (
      visualisation?.defaultClassification &&
      !state.layers[layerKey]?.class_method
    ) {
      dispatch({
        type: "UPDATE_CLASSIFICATION_METHOD",
        payload: {
          class_method: visualisation.defaultClassification,
          layerName: layerKey,
        },
      });
    }
  }, [layerKey, visualisation?.defaultClassification, state.layers, dispatch]);

  // The display mode currently driving this visualisation, read from state.
  const activeDisplayMode = getVisualisationDisplayMode(visualisation);

  const previousDisplayModeRef = useRef(activeDisplayMode);

  // Drop hand-edited bands when the display mode changes the units under them. Bands typed
  // in absolute terms are meaningless once the map switches to percentages, and leaving
  // them applied paints the whole layer a single colour. Only custom mode is reset: the
  // data-driven methods (quantile, logarithmic, Jenks) recompute from the new values on
  // their own and are deliberately left as the user set them.
  useEffect(() => {
    if (previousDisplayModeRef.current === activeDisplayMode) return;
    previousDisplayModeRef.current = activeDisplayMode;

    if (classificationMethod !== "c") return;

    // Order matters: UPDATE_CUSTOM_BANDS forces class_method back to "c", so the
    // classification reset has to follow it.
    dispatch({
      type: actionTypes.UPDATE_CUSTOM_BANDS,
      payload: { customBands: null, layerName: layerKey },
    });
    dispatch({
      type: actionTypes.UPDATE_CLASSIFICATION_METHOD,
      payload: { class_method: "d", layerName: layerKey },
    });
  }, [activeDisplayMode, classificationMethod, layerKey, dispatch]);

  // Reset fetch state when visualisation changes (page navigation)
  useEffect(() => {
    hasStyledLayerRef.current = false;
    prevCombinedDataRef.current = undefined;
    prevVisualisationDataRef.current = undefined;
    delete prevInvertRef.current[layerKey];
  }, [visualisationName, resetFetchState]);

  // Effect to resolve dynamic styling when visualisation data is available
  useEffect(() => {
    if (styleResolutionTimeoutRef.current) {
      clearTimeout(styleResolutionTimeoutRef.current);
    }

    const shouldResolveDynamically = 
      visualisation?.dynamicStyling && 
      visualisation.style && 
      !visualisation.style.includes('-');

    if (!shouldResolveDynamically) {
      setResolvedStyle(visualisation?.style);
      setIsResolvingStyle(false);
      return;
    }

    if (isLoading) {
      setIsResolvingStyle(true);
      return;
    }

    if (!visualisationData || visualisationData.length === 0) {
      setResolvedStyle(`${visualisation.style}-${DEFAULT_COLOR_STYLE}`);
      setIsResolvingStyle(false);
      return;
    }

    styleResolutionTimeoutRef.current = setTimeout(() => {
      dispatch({ type: actionTypes.SET_DYNAMIC_STYLING_LOADING });
      
      try {
        const newResolvedStyle = determineDynamicStyle(visualisationData, visualisation.style);
        setResolvedStyle(newResolvedStyle);
        setIsResolvingStyle(false);
        dispatch({ type: actionTypes.SET_DYNAMIC_STYLING_FINISHED });

        if (pendingUpdateRef.current) {
          pendingUpdateRef.current = false;
        }
      } catch (err) {
        console.warn('Failed to resolve dynamic style:', err);
        setResolvedStyle(`${visualisation.style}-${DEFAULT_COLOR_STYLE}`);
        setIsResolvingStyle(false);
        dispatch({ type: actionTypes.SET_DYNAMIC_STYLING_FINISHED });
      }
    }, 0);

    return () => {
      if (styleResolutionTimeoutRef.current) {
        clearTimeout(styleResolutionTimeoutRef.current);
      }
    };
  }, [visualisation?.style, visualisation?.dynamicStyling, visualisationData, isLoading, dispatch]);

  // Register this visualisation's fetch state with the shared loading counter so
  // the layout Dimmer stays on until every visualisation on the page has finished.
  const isFullyLoading = isLoading || isResolvingStyle || isApplyingStyle;
  useVisualisationLoadingCounter(isFullyLoading, dispatch);

  useEffect(() => {
    if (isLoading) {
      dispatch({ type: actionTypes.SET_DATA_REQUESTED, payload: true });
    }
  }, [isLoading, dispatch]);

  // Handle no data returned state based on fetch state machine
  useEffect(() => {
    switch (fetchState) {
      case DataFetchState.IDLE:
        // Don't change anything during idle - let previous state persist
        // until we actually start loading
        break;
      case DataFetchState.LOADING:
        // Clear the "no data" message while loading
        // This prevents stale "no data" from previous page/query
        dispatch({ type: actionTypes.SET_NO_DATA_RETURNED, payload: false });
        break;
      case DataFetchState.ERROR:
      case DataFetchState.EMPTY:
        // Genuinely no data or error occurred
        dispatch({ type: actionTypes.SET_NO_DATA_RETURNED, payload: true });
        break;
      case DataFetchState.SUCCESS:
        // Data loaded successfully
        dispatch({ type: actionTypes.SET_NO_DATA_RETURNED, payload: false });
        break;
      default:
        break;
    }
  }, [fetchState, dispatch]);

  // Update the visualisation data in the global state when fetched
  useEffect(() => {
    if (!isLoading && visualisationData) {
      dispatch({
        type: actionTypes.UPDATE_ALL_DATA,
        payload: { visualisationName, data: visualisationData, paneId },
      });
    }
  }, [visualisationData, dispatch, visualisationName, isLoading, paneId]);

  // The data this pane's colour classes are computed from: its own fresh data, plus the last
  // data of the other panes it shares classification with (so their colours compare).
  // Always an array: this feeds reclassifyData, which iterates the records to build bins. An
  // unrecognised (non-array) response shape must degrade to "no data" rather than throwing,
  // so the map falls back to its default style instead of crashing the page.
  const classificationPanes = selectClassificationPanes(state, visualisationName, paneId);
  const otherPanesData = useShallowStableArray(
    classificationPanes
      .filter((id) => id !== paneId)
      .map((id) => selectPaneData(state, id, visualisationName))
  );
  const combinedData = useMemo(() => {
    const own = toClassifiableArray(visualisationData, visualisationName);
    if (otherPanesData.length === 0) return own;
    return [
      ...own,
      ...otherPanesData.flatMap((data) => toClassifiableArray(data, visualisationName)),
    ];
  }, [visualisationData, otherPanesData, visualisationName]);

  /**
   * Reclassifies the provided data and updates the map style for a specified layer.
   *
   * @param {Object} mapItem - The map instance to which styles will be applied.
   * @param {Array} combinedDataForClassification - Data from both visualisations used for classification.
   * @param {Array} visualisationDataForMap - Data specific to this visualisation for updating the map.
   * @param {string} style - The style to be applied for reclassification.
   * @param {string} classificationMethod - The method used for data classification.
   * @param {string} layer - The layer name to be styled.
   */
  const reclassifyAndStyleMap = useCallback(
    (mapItem, combinedDataForClassification, visualisationDataForMap, style, classMethod, layer) => {
      if (!mapItem.getLayer(layer)) {
        console.warn(`Layer ${layer} not found on map during reclassifyAndStyleMap`);
        return;
      }

      // Get bandMetricName and customBands from state.layers
      const bandMetricName = state.layers[layerKey]?.bandMetricName;
      const customBands = state.layers[layerKey]?.customBands;

      // Get defaultClassification from visualisation
      const defaultClassification = visualisation?.defaultClassification;

      const reclassifiedData = reclassifyData(
        combinedDataForClassification,
        style,
        classMethod,
        appContext.defaultBands,
        currentPage,
        visualisation.queryParams,
        { bandMetricName, customBands, defaultClassification, displayMode: activeDisplayMode } // Pass bandMetricName, customBands, defaultClassification and the active display mode in options
      );

      // Get the metric definition for the current page/metric
      const metric = getMetricDefinition(
        appContext.defaultBands,
        currentPage,
        visualisation?.queryParams,
        { bandMetricName, displayMode: activeDisplayMode }
      );

      // Determine the current color scheme
      const currentColor =
        colorSchemes[colorStyle] &&
        colorSchemes[colorStyle].some((e) => e === layerColorScheme?.value)
          ? layerColorScheme.value
          : defaultMapColourMapper[colorStyle]?.value ||
            defaultMapColourMapper[DEFAULT_COLOR_STYLE].value;

      // Calculate the color palette based on the classification
      const invertColorScheme = state.layers[layerKey]?.invertedColorScheme === true;

      const isCustomColorSchemeSelected = Boolean(
        state.customColorSchemeSelectedByLayer?.[layerKey]
      );

      let colourPalette;
      if (!isCustomColorSchemeSelected && metric?.colours?.length === reclassifiedData.length) {
        colourPalette = metric.colours;
      } else {
        colourPalette = calculateColours(currentColor, reclassifiedData, invertColorScheme);
      }

      const layerConfig = state.layers[layerKey];
      let paintBins = reclassifiedData;
      let paintColours = colourPalette;
      let legendMetadata = {};

      if (colorStyle === "categorical") {
        const legendCacheField =
          visualisation?.legendCacheField || layerConfig?.legendCacheField || visualisation?.valueField || "value";
        const resolvedCategoricalColours = resolveCategoricalColours({
          bins: reclassifiedData,
          colours: colourPalette,
          cache: state.categoricalLegendCache,
          fieldName: legendCacheField,
          schemeName: currentColor,
        });
        const selectedColourOverrides = buildSelectedCategoricalColourOverrides({
          filters: state.filters,
          queryParams: visualisation?.queryParams,
          fieldName: legendCacheField,
          schemeName: currentColor,
        });

        resolvedCategoricalColours.resolvedBins.forEach((binValue, index) => {
          const legendCacheKey = buildCategoricalLegendKey({
            fieldName: legendCacheField,
            value: binValue,
          });
          const selectedOverride = legendCacheKey
            ? selectedColourOverrides[legendCacheKey]
            : null;

          if (selectedOverride && resolvedCategoricalColours.newCacheEntries[legendCacheKey]) {
            resolvedCategoricalColours.newCacheEntries[legendCacheKey] = selectedOverride;
            resolvedCategoricalColours.resolvedColours[index] = selectedOverride.colour;
          }
        });

        if (Object.keys(resolvedCategoricalColours.newCacheEntries).length > 0) {
          dispatch({
            type: actionTypes.REGISTER_CATEGORICAL_LEGEND_ITEMS,
            payload: resolvedCategoricalColours.newCacheEntries,
          });
        }

        paintBins = resolvedCategoricalColours.resolvedBins;
        paintColours = resolvedCategoricalColours.resolvedColours;
        legendMetadata = {
          legendCacheField,
        };
      }

      // Update the map style
      const opacityValue = document.getElementById(`opacity-${layerKey}`)?.value;

      // Get layer's default opacity from metadata, fallback to DEFAULT_OPACITY
      const layerObject = mapItem.getLayer(layer);
      const defaultOpacity = layerObject?.metadata?.defaultOpacity ?? DEFAULT_OPACITY;

      const paintProperty = createPaintProperty(
        paintBins,
        resolvedStyle,
        paintColours,
        opacityValue ? parseFloat(opacityValue) : defaultOpacity,
        layerConfig
      );

      // Use visualisationDataForMap to update the map features
      addFeaturesToMap(
        mapItem,
        paintProperty,
        state.layers,
        visualisationDataForMap,
        colorStyle,
        layer,
        legendMetadata
      );
    },
    [
      dispatch,
      state.categoricalLegendCache,
      state.filters,
      state.layers,
      resolvedStyle,
      appContext,
      currentPage,
      visualisation, 
      activeDisplayMode,
      layerColorScheme,
      layerKey,
      // calculateColours,
      colorStyle,
      addFeaturesToMap,
    ]
  );

  /**
   * Reset the map style to the default style for a specified layer.
   *
   * @param {string} style - The type of geometries of the visualisation.
   */
  const resetMapStyle = useCallback(
    (style) => {
      if (!map) return;
      
      const paintProperty = resetPaintProperty(style);
      addFeaturesToMap(
        map,
        paintProperty,
        state.layers,
        visualisationData,
        colorStyle,
        layerKey
      );
    },
    [map, state.layers, addFeaturesToMap, visualisationData, layerKey, colorStyle]
  );

  /**
   * Reclassifies GeoJSON data and styles the map accordingly.
   */
  const reclassifyAndStyleGeoJSONMap = useCallback(
    (featureCollection, style) => {
      if (!featureCollection || !map) {
        return;
      }
      
      if (!hasAnyGeometryNotNull(featureCollection)) {
        if (map.getLayer(visualisationName)) {
          map.removeLayer(visualisationName);
        }
        dispatch({ type: actionTypes.SET_NO_DATA_RETURNED, payload: true });
        return;
      }
      
      if (!map.getSource(visualisationName)) {
        map.addSource(visualisationName, {
          type: "geojson",
          data: featureCollection,
        });
      } else {
        map.getSource(visualisationName).setData(featureCollection);
      }

      const reclassifiedData = reclassifyGeoJSONData(featureCollection, style);

      const currentColor = colorSchemes[colorStyle]?.some(
        (e) => e === layerColorScheme?.value
      )
        ? layerColorScheme.value
        : defaultMapColourMapper[colorStyle]?.value;

      const colourPalette = calculateColours(currentColor, reclassifiedData);
      let paintBins = reclassifiedData;
      let paintColours = colourPalette;
      let legendMetadata = {};

      if (colorStyle === "categorical") {
        const legendCacheField =
          visualisation?.legendCacheField || state.layers[layerKey]?.legendCacheField || visualisation?.valueField || "category";
        const resolvedCategoricalColours = resolveCategoricalColours({
          bins: reclassifiedData,
          colours: colourPalette,
          cache: state.categoricalLegendCache,
          fieldName: legendCacheField,
          schemeName: currentColor,
        });

        if (Object.keys(resolvedCategoricalColours.newCacheEntries).length > 0) {
          dispatch({
            type: actionTypes.REGISTER_CATEGORICAL_LEGEND_ITEMS,
            payload: resolvedCategoricalColours.newCacheEntries,
          });
        }

        paintBins = resolvedCategoricalColours.resolvedBins;
        paintColours = resolvedCategoricalColours.resolvedColours;
        legendMetadata = {
          legendCacheField,
        };
      }

      const opacityValue = document.getElementById(`opacity-${layerKey}`)?.value;
      
      const paintProperty = createPaintProperty(
        paintBins,
        style,
        paintColours,
        opacityValue ? parseFloat(opacityValue) : DEFAULT_OPACITY,
        state.layers[layerKey]
      );

      const layers = map.getStyle().layers;
      const layerIndex = layers.findIndex(
        (layer) => layer.id.includes("-hover") || layer.id === "selected-feature-layer"
      );
      const beforeLayerId = layerIndex !== -1 ? layers[layerIndex].id : undefined;

      if (!map.getLayer(visualisationName)) {
        map.addLayer(
          {
            id: visualisationName,
            type: "fill",
            source: visualisationName,
            paint: paintProperty,
            metadata: {
              colorStyle: colorStyle,
              ...legendMetadata,
              isStylable: true,
              enforceNoColourSchemeSelector: visualisation?.enforceNoColourSchemeSelector ?? false,
              enforceNoClassificationMethod: visualisation?.enforceNoClassificationMethod ?? false,
              enforceNoCustomBanding: visualisation?.enforceNoCustomBanding ?? false,
            },
          },
          beforeLayerId
        );

        dispatch({
          type: "UPDATE_COLOR_SCHEME",
          payload: {
            layerName: visualisationName,
            color_scheme: layerColorScheme,
          },
        });
      } else {
        const existingLayer = map.getLayer(visualisationName);
        if (existingLayer) {
          existingLayer.metadata = {
            ...existingLayer.metadata,
            ...legendMetadata,
          };
        }
        for (const [paintPropertyName, paintPropertyArray] of Object.entries(paintProperty)) {
          map.setPaintProperty(visualisationName, paintPropertyName, paintPropertyArray);
        }
      }
    },
    [
      map,
      visualisationName,
      layerColorScheme,
      colorStyle,
      dispatch,
      layerKey,
      state.layers,
      state.categoricalLegendCache,
      visualisation,
    ]
  );

  /**
   * Core effect to reclassify and update the data on the map.
   */
  useEffect(() => {
    if (!map || !visualisation) return;

    const layerConfig = state.layers[layerKey];
    // GeoJSON draws its own source. It does not need a tile layer registered under the
    // visualisation name. Joined visualisations do: the target layer is what gets styled.
    if (!layerConfig && visualisation.type !== "geojson") {
      return;
    }

    // If the layer has missing parameters, it will not be added to the map by Layer.jsx.
    // Abort the styling process immediately to prevent infinite waiting.
    if (layerConfig?.missingParams && layerConfig.missingParams.length > 0) {
      setIsApplyingStyle(false);
      return;
    }

    // Determine if reclassification is needed
    const dataHasChanged =
      combinedData !== prevCombinedDataRef.current &&
      prevCombinedDataRef.current !== undefined;
    const visualisationDataHasChanged =
      visualisationData !== prevVisualisationDataRef.current &&
      prevVisualisationDataRef.current !== undefined;
    const colorHasChanged =
      layerColorScheme !== null &&
      prevColorRef.current[layerKey] !== undefined &&
      layerColorScheme !== prevColorRef.current[layerKey];
    const prevClassificationMethod = prevClassMethodRef.current[layerKey];
    const classificationHasChanged =
      classificationMethod !== prevClassificationMethod;

    const currentCustomBands = layerConfig?.customBands;
    const prevCustomBands = prevCustomBandsRef.current[layerKey];
    // Use `in` to distinguish "never initialised" (key absent) from "initialised but
    // no custom bands yet" (key present with undefined/null). This ensures the
    // transition from no custom bands to the first custom bands assignment is detected.
    const customBandsHasChanged =
      (layerKey in prevCustomBandsRef.current) &&
      !areNumericArraysEqual(currentCustomBands, prevCustomBands);

    const invertHasChanged =
      (layerKey in prevInvertRef.current) &&
      Boolean(state.layers[layerKey]?.invertedColorScheme) !== Boolean(prevInvertRef.current[layerKey]);

    const needUpdate =
      dataHasChanged ||
      visualisationDataHasChanged ||
      colorHasChanged ||
      classificationHasChanged ||
      customBandsHasChanged ||
      invertHasChanged;

    const previouslyHadNoData =
      prevVisualisationDataRef.current !== undefined &&
      !hasDrawableVisualisationData(prevVisualisationDataRef.current);
    const nowHasData = hasDrawableVisualisationData(visualisationData);
    const transitionedFromNoDataToData = previouslyHadNoData && nowHasData;

    const isFirstRun =
      (!hasStyledLayerRef.current || transitionedFromNoDataToData) && nowHasData;

    const isDeferredUpdate = forceUpdateCounter > 0 && !pendingUpdateRef.current;

    if (transitionedFromNoDataToData) {
      hasStyledLayerRef.current = false;
    }

    if (isResolvingStyle && (needUpdate || isFirstRun)) {
      pendingUpdateRef.current = true;
      return;
    }

    if (!needUpdate && !isFirstRun && !isDeferredUpdate) {
      return;
    }
    
    if (!resolvedStyle || !colorStyle) {
      return;
    }

    const dataToVisualise = visualisationData || [];
    const dataToClassify = combinedData;

    let cleanupFns = [];

    const performReclassification = () => {
      
      // Update the refs to the current data
      prevCombinedDataRef.current = combinedData;
      prevVisualisationDataRef.current = visualisationData;
      prevColorRef.current[layerKey] = layerColorScheme;
      prevClassMethodRef.current[layerKey] = classificationMethod;
      prevInvertRef.current[layerKey] = state.layers[layerKey]?.invertedColorScheme;
      // Store a stable snapshot of bands to avoid false negatives from accidental mutation.
      prevCustomBandsRef.current[layerKey] = Array.isArray(currentCustomBands)
        ? [...currentCustomBands]
        : currentCustomBands;
      
      switch (visualisation.type) {
        case "joinDataToMap": {
          // A join needs an array of records; treat anything else (including an
          // unrecognised response envelope) as "no data" rather than attempting to
          // classify it. `geojson` below deliberately accepts an object payload.
          if (
            !Array.isArray(dataToVisualise) ||
            dataToVisualise.length === 0
          ) {
            resetMapStyle(resolvedStyle);
          } else {
            reclassifyAndStyleMap(
              map,
              dataToClassify,
              dataToVisualise,
              resolvedStyle,
              classificationMethod,
              layerKey
            );
          }
          hasStyledLayerRef.current = true;
          break;
        }
        case "geojson": {
          const parsedData = dataToVisualise[0]?.feature_collection || dataToVisualise.feature_collection;
          if (parsedData) {
            reclassifyAndStyleGeoJSONMap(JSON.parse(parsedData), resolvedStyle);
          } else {
            const source = map.getSource(visualisationName);
            if (source) {
              source.setData({ type: "FeatureCollection", features: [] });
            }
          }
          hasStyledLayerRef.current = true;
          break;
        }
        default:
          break;
      }
    };

    if (visualisation.type === "joinDataToMap") {
      const { maxRetries, retryDelay } = LAYER_RETRY_CONFIG;
      let retryCount = 0;
      let isCleanedUp = false;

      setIsApplyingStyle(true);

      const checkLayerAndPerform = () => {
        if (isCleanedUp) return;

        if (map.isStyleLoaded() && map.getLayer(layerKey)) {
          performReclassification();
          setIsApplyingStyle(false);
        } else if (retryCount < maxRetries) {
          retryCount++;
          const timeoutId = setTimeout(checkLayerAndPerform, retryDelay);
          cleanupFns.push(() => clearTimeout(timeoutId));
        } else {
          const handleLayerReady = () => {
            if (isCleanedUp || !map.isStyleLoaded() || !map.getLayer(layerKey)) return;
            cleanup();
            performReclassification();
            setIsApplyingStyle(false);
          };

          const cleanup = () => {
            map.off("styledata", handleLayerReady);
            map.off("sourcedata", handleLayerReady);
          };

          map.on("styledata", handleLayerReady);
          map.on("sourcedata", handleLayerReady);
          cleanupFns.push(cleanup);
        }
      };

      cleanupFns.push(() => { 
        isCleanedUp = true; 
        setIsApplyingStyle(false);
      });
      checkLayerAndPerform();
    } else {
      performReclassification();
    }

    return () => {
      cleanupFns.forEach(fn => fn());
    };
  }, [
    combinedData,
    visualisationData,
    map,
    layerColorScheme,
    classificationMethod,
    resetMapStyle,
    resolvedStyle,
    isResolvingStyle,
    visualisation,
    visualisationName,
    // reclassifyAndStyleMap,
    layerKey,
    colorStyle,
    forceUpdateCounter,
    state.layers,
    resetMapStyle,
    reclassifyAndStyleMap,
    reclassifyAndStyleGeoJSONMap,
  ]);


  // Trigger update when style resolution completes if there was a pending update
  useEffect(() => {
    if (!isResolvingStyle && pendingUpdateRef.current && resolvedStyle && colorStyle) {
      pendingUpdateRef.current = false;
      prevCombinedDataRef.current = undefined;
      prevVisualisationDataRef.current = undefined;
      hasStyledLayerRef.current = false;
      setForceUpdateCounter((prev) => prev + 1);
    }
  }, [isResolvingStyle, resolvedStyle, colorStyle]);

  // Register a feature-state restorer with the central registry.
  // The transition coordinator (useBaseMapTransition) runs all registered
  // restorers after each style reload — without MapVisualisation needing to
  // listen for style.load directly.
  useEffect(() => {
    if (!map || !layerKey) return undefined;

    const restore = () => replayLayerState(map, state.layers, layerKey);

    return registerMapRestorer(
      map,
      `feature-state:${layerKey}`,
      restore
    );
  }, [
    map,
    layerKey,
    replayLayerState,
    state.layers,
  ]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (map && visualisation?.type === "geojson") {
        if (map.getLayer(visualisationName)) {
          map.removeLayer(visualisationName);
        }
        if (map.getSource(visualisationName)) {
          map.removeSource(visualisationName);
        }
      }
    };
  }, [map, visualisation?.type, visualisationName]);

  return null;
};
