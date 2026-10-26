import React, { createContext, useCallback, useEffect, useContext, useMemo, useReducer } from "react";
import { actionTypes, mapReducer, errorActionTypes } from "reducers";
import {
  hasRouteParameterOrQuery,
  updateUrlParameters,
  extractParamsWithValues,
  processParameters,
  checkSecurityRequirements,
  parseStringToArray,
  getGetParameters,
  buildParamsMap,
  getDefaultLayerBufferSize,
  buildCategoricalLegendKey,
  getInitialFilterValue,
  isPersistedValueValid,
  isMapViewMemoryEnabled,
  filterMemoryKey,
  readMapView,
  writeMapView,
} from "utils";
import { defaultMapZoom, defaultMapCentre, defaultMapStyle } from "defaults";
import { getDownloadMetadataPath } from "utils/downloads";
import { AppContext } from "./AppContext";
import { PageContext } from "./PageContext";
import { FilterContext } from "./FilterContext";
import { ErrorContext } from "./ErrorContext";
import { api } from "services";
import { useMetadataDrivenFilters } from "hooks/useMetadataDrivenFilters";
import { BASE_MAPS, DEFAULT_BASE_MAP_ID, getBaseMap } from "../map/baseMaps";
import { readBaseMapPreference, writeBaseMapPreference } from "../map/baseMapPreference";

// Create a context for the app configuration
export const MapContext = createContext();

/**
 * Helper function to check for duplicate values in an array.
 * @function isDuplicateValue
 * @param {Array} values - The array of values.
 * @param {Object} value - The value to check for duplicates.
 * @returns {boolean} True if the value is a duplicate, false otherwise.
 */
const isDuplicateValue = (values, value) => {
  return values.some(existingValue => 
    existingValue.paramValue === value.paramValue &&
    existingValue.displayValue === value.displayValue
  );
};

/**
 * Builds initial categorical cache entries from filter values that define explicit colours.
 *
 * @param {Array} filters - The configured filters for the page.
 * @returns {Object} A cache seed keyed by categorical legend key.
 */
const buildCacheSeedFromFilters = (filters = []) => {
  return filters.reduce((cacheSeed, filter) => {
    const filterValues = filter?.values?.values;
    if (!Array.isArray(filterValues)) {
      return cacheSeed;
    }

    const fieldName = filter.legendCacheField || filter.valueField || filter.paramName;

    filterValues.forEach((valueItem) => {
      if (typeof valueItem?.colourValue !== "string" || valueItem.colourValue.trim() === "") {
        return;
      }

      const value = valueItem.paramValue ?? valueItem.value ?? valueItem.displayValue;
      const legendCacheKey = buildCategoricalLegendKey({ fieldName, value });
      if (!legendCacheKey) {
        return;
      }

      cacheSeed[legendCacheKey] = {
        label: valueItem.displayValue ?? String(value ?? "").trim(),
        colour: valueItem.colourValue,
        fieldName: String(fieldName ?? "").trim() || "value",
        schemeName: filter.schemeName ?? null,
      };
    });

    return cacheSeed;
  }, {});
};

/**
 * MapProvider component to manage map-related state and context.
 * @function MapProvider
 * @property {React.ReactNode} children - Child components to be wrapped by the context provider.
 * @returns {JSX.Element} The map context provider component.
 */
export const MapProvider = ({ children }) => {
  const appContext = useContext(AppContext);
  const pageContext = useContext(PageContext);
  const errorContext = useContext(ErrorContext);
  const errorDispatch = errorContext?.dispatch ?? (() => {}); // no-op if provider missing

  // The view remembered from an earlier visit to this page in this tab, if the page remembers it.
  const rememberView = isMapViewMemoryEnabled(appContext, pageContext);
  const rememberedView = useMemo(
    () => (rememberView ? readMapView(pageContext.url) : null),
    [rememberView, pageContext.url]
  );
  const rememberedZoom = Number.isFinite(rememberedView?.zoom) ? rememberedView.zoom : null;
  const rememberedCentre = Array.isArray(rememberedView?.centre) ? rememberedView.centre : null;

  // Initialize state within the provider function
  const initialBaseMapId =
    readBaseMapPreference(BASE_MAPS) ??
    appContext.defaultBaseMapId ??
    (appContext.mapStyle ? null : DEFAULT_BASE_MAP_ID);

  const initialMapStyle = initialBaseMapId
    ? getBaseMap(initialBaseMapId).resolveStyle()
    : (appContext.mapStyle ?? defaultMapStyle());

  const initialState = {
    baseMapId: initialBaseMapId,
    mapStyle: initialMapStyle,
    mapCentre: rememberedCentre ?? (pageContext.customMapCentre
      ? parseStringToArray(pageContext.customMapCentre)
      : defaultMapCentre),
    mapZoom: rememberedZoom ?? (pageContext.customMapZoom
      ? parseFloat(pageContext.customMapZoom)
      : defaultMapZoom),
    layers: {},
    colorSchemesByLayer: {},
    customColorSchemeSelectedByLayer: {},
    visualisations: {},
    leftVisualisations: {},
    rightVisualisations: {},
    metadataTables: {},
    metadataFilters: [],
    filters: [],
    map: null,
    isMapReady: false,
    isLoading: true,
    isDynamicStylingLoading: false,
    visualisationLoadingCount: 0,
    pageIsReady: false,
    metadataError: null,
    categoricalLegendCache: {},
    selectionMode: null,
    selectionLayer: null,
    selectedFeatures: [],
    isFeatureSelectActive: false,
    visualisedFeatureIds: null,
    currentZoom: rememberedZoom ?? (pageContext.customMapZoom
      ? parseFloat(pageContext.customMapZoom)
      : defaultMapZoom),
  };


  const [state, dispatch] = useReducer(mapReducer, initialState);

  const contextValue = React.useMemo(() => {
    return { state, dispatch };
  }, [state, dispatch]);

  useEffect(() => {
    if (state.baseMapId) {
      writeBaseMapPreference(state.baseMapId);
    }
  }, [state.baseMapId]);

  // Remembered filter values win when still valid; otherwise URL-param / persisted / default.
  const getInitialValue = useCallback(
    (filter) => {
      const remembered = rememberedView?.filters?.[filterMemoryKey(filter)];
      return isPersistedValueValid(filter, remembered) ? remembered : getInitialFilterValue(filter);
    },
    [rememberedView]
  );

  // Core filter pipeline — useMetadataDrivenFilters owns metadata table fetching, filter option building,
  // FilterContext initialisation, cross-filter correction, and runtime option hiding.
  // `getInitialFilterValue` is passed so map pages pick up URL-param / persisted-state values.
  const {
    filtersWithIds,
    metadataTables,
    paramNameToUuidMap,
    emptyTables,
    emptyMetadataFilters,
    isReady: filtersReady,
  } = useMetadataDrivenFilters({ getInitialValue });

  // Remember the camera after each move, for the next visit.
  useEffect(() => {
    const map = state.map;
    if (!rememberView || !map) return undefined;
    const save = () => {
      const { lng, lat } = map.getCenter();
      writeMapView(pageContext.url, { centre: [lng, lat], zoom: map.getZoom() });
    };
    map.on("moveend", save);
    return () => map.off("moveend", save);
  }, [rememberView, state.map, pageContext.url]);

  // Remember the filter values, keyed so they match the same filters on the next visit.
  const filterState = useContext(FilterContext)?.state;
  useEffect(() => {
    if (!rememberView || !filtersReady || !filterState) return;
    const filters = {};
    filtersWithIds.forEach((f) => {
      if (f.id in filterState) filters[filterMemoryKey(f)] = filterState[f.id];
    });
    writeMapView(pageContext.url, { filters });
  }, [rememberView, filtersReady, filterState, filtersWithIds, pageContext.url]);

  // Initialise layers and visualisations from page config.
  // This is independent of filter init and runs immediately on page change.
  useEffect(() => {
    dispatch({ type: actionTypes.SET_IS_LOADING });

    // Initialise non-parameterised layers
    pageContext.config.layers
      .filter((layer) => !hasRouteParameterOrQuery(layer.path))
      .forEach((layer) => {
        const bufferSize = getDefaultLayerBufferSize(layer.geometryType, layer?.bufferSize);
        dispatch({ type: actionTypes.ADD_LAYER, payload: { [layer.name]: { ...layer, bufferSize } } });
      });

    // Initialise parameterised layers based on corresponding filters
    pageContext.config.layers
      .filter((layer) => hasRouteParameterOrQuery(layer.path))
      .forEach((layer) => {
        const bufferSize = getDefaultLayerBufferSize(layer.geometryType, layer?.bufferSize);
        const allParamsWithValues = extractParamsWithValues(layer.path);
        const excludedParams = ['x', 'y', 'z'];
        const { params, missingParams } = processParameters(
          allParamsWithValues,
          pageContext.config.filters,
          excludedParams
        );
        const updatedPath = updateUrlParameters(layer.path, layer.path, params);
        dispatch({
          type: actionTypes.ADD_LAYER,
          payload: {
            [layer.name]: {
              ...layer,
              path: updatedPath,
              pathTemplate: layer.path,
              bufferSize,
              missingParams,
            },
          },
        });
      });

    // Initialise visualisations
    const apiSchema = appContext.apiSchema;
    pageContext.config.visualisations.forEach((visConfig) => {
      const apiRoute = visConfig.dataPath;
      
      // Collect all GET parameters (path-level + operation-level)
      const apiParameters = getGetParameters(apiSchema, apiRoute);
      
      // Build query and path params maps
      const queryParams = buildParamsMap(apiParameters, 'query', pageContext.config.filters);
      const pathParams = buildParamsMap(apiParameters, 'path', pageContext.config.filters);
      
      const requiresAuth = checkSecurityRequirements(apiSchema, apiRoute);
      
      // If no parameters are marked as required in the schema, set all to required
      const hasRequiredParams = apiParameters.some((param) => param.required);
      if (!hasRequiredParams) {
        Object.keys(queryParams).forEach((key) => {
          queryParams[key].required = true;
        });
        Object.keys(pathParams).forEach((key) => {
          pathParams[key].required = true;
        });
      }
      dispatch({
        type: actionTypes.ADD_VISUALISATION,
        payload: {
          [visConfig.name]: {
            ...visConfig,
            dataPath: apiRoute,
            queryParams,
            pathParams,
            data: [],
            paintProperty: {},
            requiresAuth,
          },
        },
      });
    });

    return () => {
      dispatch({ type: actionTypes.RESET_CONTEXT });
    };
  }, [pageContext]);

  // Sync filter pipeline output to mapReducer once metadata-driven filters ready.
  // Handles the map-specific concerns the hook intentionally does not own:
  //   - legacy `api` source resolution
  //   - `sides` property for dual-map (Left/Right) filter layout (visualisation-specific)
  //   - error reporting via ErrorContext
  //   - categorical legend cache seeding
  //   - mapReducer dispatches (SET_FILTERS, SET_METADATA_TABLES, SET_PAGE_IS_READY, etc.)
  useEffect(() => {
    if (!filtersReady) return;

    let cancelled = false;
    (async () => {
      // Abort early if any required metadata tables returned no data.
      if (emptyTables.length > 0) {
        console.warn('[MapContext] aborting due to empty metadata tables', {
          pageName: pageContext.pageName,
          emptyTables,
        });

        const message =
          emptyTables.length === 1
            ? 'The metadata table is empty or contains no valid data. This page requires valid metadata to function properly.'
            : `${emptyTables.length} metadata tables are empty or contain no valid data. This page requires valid metadata to function properly.`;

        const technicalDetails =
          emptyTables.length === 1
            ? `Metadata table: ${emptyTables[0]}\nError: Table "${emptyTables[0]}" returned no data from the API.`
            : `Empty metadata tables (${emptyTables.length}):\n${emptyTables.map((t) => `- ${t}`).join('\n')}`;

        // Dispatch into ErrorContext reducer so MapContext sets SET_ERROR
        errorDispatch({
          type: errorActionTypes.SET_ERROR,
          payload: {
            title: 'Configuration Error',
            subtitle: 'Unable to Load Page',
            message,
            supportMessage: 'Please contact support for assistance',
            supportDetails: 'This issue typically indicates a data configuration problem that requires administrative attention.',
            technicalDetails,
          },
        });

        dispatch({ type: actionTypes.SET_LOADING_FINISHED });
        return;
      }

      // Resolve `api` source filters (TAME-specific: fetches distinct values from the data API).
      // All other sources are already handled by the hook.
      let processedFilters = filtersWithIds;
      const apiSourceFilters = filtersWithIds.filter((f) => f.values?.source === 'api');
      if (apiSourceFilters.length > 0) {
        try {
          const path = getDownloadMetadataPath(pageContext.config, appContext);
          const dataPath = { dataPath: pageContext.config.visualisations[0].dataPath };
          const metadataFilters = await api.baseService.post(path, dataPath, { skipAuth: false });
          if (cancelled) return;
          const apiFilterValues = Object.groupBy(metadataFilters, ({ field_name }) => field_name);
          processedFilters = filtersWithIds.map((f) => {
            if (f.values?.source !== 'api') return f;
            const baseParamName = f.paramName.includes('DoMinimum')
              ? f.paramName.replace('DoMinimum', '')
              : f.paramName.includes('DoSomething')
              ? f.paramName.replace('DoSomething', '')
              : f.paramName;
            return {
              ...f,
              values: {
                ...f.values,
                values: apiFilterValues[baseParamName][0].distinct_values.map((v) => ({
                  displayValue: v,
                  paramValue: v,
                })),
              },
            };
          });
        } catch (error) {
          console.error('Error fetching api source filters', error);
        }
      }

      // Apply the `sides` property for dual-map (Left/Right) filter layout.
      const filtersWithSides = processedFilters.map((filter) => {
        if (!filter.visualisations?.[0]?.includes('Side')) return filter;
        const sides = filter.filterName.includes('Left')
          ? 'left'
          : filter.filterName.includes('Right')
          ? 'right'
          : 'both';
        return { ...filter, sides };
      });

      // Report empty metadata filter warnings (non-fatal — page still loads behind error overlay).
      if (emptyMetadataFilters.length > 0) {
        console.warn('[MapContext] empty metadata filters detected', {
          pageName: pageContext.pageName,
          emptyMetadataFilters,
        });
        const technicalDetails = emptyMetadataFilters
          .map(
            ({ filterName, paramName, metadataTableName }) =>
              `Filter: ${filterName || paramName}\nParameter: ${paramName}\nMetadata table: ${metadataTableName}`
          )
          .join('\n\n');
        errorDispatch({
          type: errorActionTypes.SET_ERROR,
          payload: {
            title: 'No Filter Values Available',
            subtitle: 'A metadata filter returned no values',
            message:
              emptyMetadataFilters.length === 1
                ? `The filter "${emptyMetadataFilters[0].filterName || emptyMetadataFilters[0].paramName}" has no available values from the API for the current metadata query.`
                : 'One or more filters have no available values from the API for the current metadata query.',
            supportMessage: 'Please contact support if the issue persists.',
            supportDetails: 'The filters listed below were built from metadata, but the filtered API result returned no options.',
            technicalDetails,
          },
        });
        console.warn('[MapContext] continuing initialisation so the page can render behind the error overlay', {
          pageName: pageContext.pageName,
        });
      }

      // Sync everything to mapReducer.
      dispatch({ type: actionTypes.SET_FILTERS, payload: filtersWithSides });
      dispatch({ type: actionTypes.SET_METADATA_TABLES, payload: metadataTables });
      dispatch({ type: actionTypes.SET_PARAM_NAME_TO_UUID_MAP, payload: paramNameToUuidMap });
      const categoricalLegendSeed = buildCacheSeedFromFilters(filtersWithSides);
      if (Object.keys(categoricalLegendSeed).length > 0) {
        dispatch({
          type: actionTypes.MERGE_CATEGORICAL_LEGEND_CACHE,
          payload: categoricalLegendSeed,
        });
      }
      dispatch({ type: actionTypes.SET_PAGE_IS_READY, payload: true });
      dispatch({ type: actionTypes.SET_LOADING_FINISHED });
    })();

    return () => { cancelled = true; };
  }, [filtersReady, filtersWithIds, metadataTables, paramNameToUuidMap, emptyTables, emptyMetadataFilters, pageContext]);

  return (
    <MapContext.Provider value={contextValue}>
      {/* We no longer conditionally hide children based on pageIsReady. 
          This prevents MapLibre from unmounting/remounting, 
          letting MapLayout's internal Dimmer handle the loading state instead. */}
      {children}
    </MapContext.Provider>
  );
};
