import { updateUrlParameters, normaliseParamValue, normaliseDisplayMode } from "utils";
import { getBaseMap } from "../map/baseMaps";
import { expandFilterParamValues } from "utils/filterParams";

/**
 * Finds the first configured colour scheme value from filter options.
 *
 * Used during map initialisation to infer a starting colour scheme when one
 * is not explicitly set on a visualisation.
 *
 * @param {Array<Object>} filters - State filters that may contain values/values[].colourValue.
 * @returns {Object|null} The first discovered colourValue object, or null if none is found.
 */
const findFirstColourValue = (filters) => {
  for (const filter of filters) {
    if (filter.values && filter.values.values) {
      for (const valueItem of filter.values.values) {
        if (valueItem.colourValue) {
          return valueItem.colourValue;
        }
      }
    }
  }
  return null;
};

/**
 * Updates a params map (queryParams or pathParams) across a set of visualisations.
 *
 * @param {Object} visualisationsMap - The visualisations state slice (e.g., state.visualisations).
 * @param {string[]} visualisationNames - Names of visualisations to update.
 * @param {string} fieldName - The field to update ("queryParams" or "pathParams").
 * @param {string} paramName - The parameter name to update.
 * @param {string|number|Array} newParamValue - The value to set for the parameter.
 * @returns {Object} A new, updated visualisations map with param changes applied.
 */
function updateParamMap(visualisationsMap, visualisationNames, fieldName, paramName, newParamValue) {
  const updatedVisualisations = { ...visualisationsMap };
  visualisationNames.forEach((visName) => {
    const vis = updatedVisualisations[visName];
    if (!vis) return;

    const currentParams = vis[fieldName] || {};
    const isRequired = currentParams[paramName]?.required || false;

    updatedVisualisations[visName] = {
      ...vis,
      [fieldName]: {
        ...currentParams,
        [paramName]: {
          value: newParamValue,
          required: isRequired,
        },
      },
    };
  });

  return updatedVisualisations;
}

/**
 * Resolves the parameters a filter action updates.
 *
 * An explicit `payload.paramName` wins. Otherwise the filter's value is expanded, so a
 * multi-parameter filter (array `paramName` and/or `extraToggle`) updates each parameter.
 *
 * @param {Object} payload - The action payload ({ filter, value, paramName? }).
 * @returns {Object<string, any>} Parameter name to raw value.
 */
const getParamUpdates = (payload) => {
  if (payload.paramName) return { [payload.paramName]: payload.value };
  return expandFilterParamValues(payload.filter, payload.value);
};

/**
 * Applies `updateParamMap` for each parameter in `paramUpdates`.
 *
 * @param {Object} visualisationsMap - The visualisations state slice.
 * @param {string[]} visualisationNames - Names of visualisations to update.
 * @param {string} fieldName - "queryParams" or "pathParams".
 * @param {Object<string, any>} paramUpdates - Parameter name to raw value.
 * @param {"comma"|"slash"} joinStyle - How array values are joined.
 * @returns {Object} The updated visualisations map.
 */
const updateParamMaps = (visualisationsMap, visualisationNames, fieldName, paramUpdates, joinStyle) =>
  Object.entries(paramUpdates).reduce(
    (visMap, [paramName, value]) =>
      updateParamMap(visMap, visualisationNames, fieldName, paramName, normaliseParamValue(value, joinStyle)),
    visualisationsMap
  );

/**
 * Resolves legend text from a rule set based on the selected filter option.
 *
 * Matching order:
 * 1) rules.byDisplayValue against selectedValue.displayValue
 * 2) rules.byParamValue against selectedValue.paramValue
 * 3) rules.default
 * 4) fallbackValue
 *
 * Matching is case-insensitive and trims leading/trailing whitespace.
 *
 * @param {Object|undefined} rules - Rule object containing byDisplayValue/byParamValue/default.
 * @param {Object|undefined} selectedValue - Selected option ({ displayValue, paramValue }).
 * @param {string|undefined|null} fallbackValue - Value to use when no rule matches.
 * @returns {string|undefined|null} Resolved legend text.
 */
function resolveLegendTextByRules(rules, selectedValue, fallbackValue) {
  if (!rules) {
    return fallbackValue;
  }

  // Normalise incoming values so matching is resilient to case/spacing differences.
  const normalise = (value) => String(value ?? "").trim().toLowerCase();
  const selectedDisplayValue = normalise(selectedValue?.displayValue);
  const selectedParamValue = normalise(selectedValue?.paramValue);

  // Prefer display label matching when configured.
  const byDisplayValue = rules.byDisplayValue || {};
  for (const [displayValue, legendSubtitleText] of Object.entries(byDisplayValue)) {
    if (normalise(displayValue) === selectedDisplayValue) {
      return legendSubtitleText;
    }
  }

  // Fall back to param-value matching when labels are unstable or not unique.
  const byParamValue = rules.byParamValue || {};
  for (const [paramValue, legendSubtitleText] of Object.entries(byParamValue)) {
    if (normalise(paramValue) === selectedParamValue) {
      return legendSubtitleText;
    }
  }

  return rules.default ?? fallbackValue;
}

/**
 * Extracts legend display/subtitle rules for a specific visualisation.
 *
 * Supports both the newer `legendValues` array style and legacy top-level
 * rule fields on the filter object for backward compatibility.
 *
 * @param {Object} filter - Filter definition from page config.
 * @param {string} visName - Visualisation name being updated.
 * @returns {{displayRules: Object|undefined, subtitleRules: Object|undefined}} Rule pair for display/subtitle text.
 */
function getLegendRulesForVisualisation(filter, visName) {
  const legendValues = Array.isArray(filter?.legendValues)
    ? filter.legendValues
    : [];

  // Pick a visualisation-specific config when present, otherwise use first/default config.
  const legendConfig =
    legendValues.find((config) => config?.visualisationName === visName) ||
    legendValues.find((config) => config?.visualisation === visName) ||
    legendValues[0] ||
    {};

  return {
    displayRules:
      legendConfig.legendDisplayValueRules || filter?.legendDisplayValueRules,
    subtitleRules:
      legendConfig.legendSubtitleTextValueRules ||
      legendConfig.legendSubtitleTextRules ||
      filter?.legendSubtitleTextValueRules ||
      filter?.legendSubtitleTextRules,
  };
}

// TODO delineate actionTypes into separate namespaces
export const actionTypes = {
  UPDATE_MAP_CENTRE: "UPDATE_MAP_CENTRE",
  UPDATE_MAP_ZOOM: "UPDATE_MAP_ZOOM",
  UPDATE_MAP_STYLE: "UPDATE_MAP_STYLE",
  INITIALISE_SIDEBAR: "INITIALISE_SIDEBAR",
  SET_PAGE_INFO: "SET_PAGE_INFO",
  SET_MAP: "SET_MAP",
  SET_DUAL_MAPS: "SET_DUAL_MAPS",
  ADD_LAYER: "ADD_LAYER",
  ADD_PARAMETERISED_LAYER: "ADD_PARAMETERISED_LAYER",
  UPDATE_PARAMETERISED_LAYER: "UPDATE_PARAMETERISED_LAYER",
  UPDATE_LAYER_PAINT: "UPDATE_LAYER_PAINT",
  ADD_VISUALISATION: "ADD_VISUALISATION",
  UPDATE_QUERY_PARAMS: "UPDATE_QUERY_PARAMS",
  UPDATE_PATH_PARAMS: "UPDATE_PATH_PARAMS",
  UPDATE_DUAL_PATH_PARAMS: "UPDATE_DUAL_PATH_PARAMS",
  UPDATE_DUAL_QUERY_PARAMS: "UPDATE_DUAL_QUERY_PARAMS",
  UPDATE_ALL_DATA: "UPDATE_ALL_DATA",
  SET_DATA_REQUESTED: "SET_DATA_REQUESTED",
  SET_NO_DATA_RETURNED: "SET_NO_DATA_RETURNED",
  UPDATE_COLOR_SCHEME: "UPDATE_COLOR_SCHEME",
  JOIN_DATA: "JOIN_DATA",
  SET_IS_LOADING: "SET_IS_LOADING",
  SET_LOADING_FINISHED: "SET_LOADING_FINISHED",
  INCREMENT_VISUALISATION_LOADING: "INCREMENT_VISUALISATION_LOADING",
  DECREMENT_VISUALISATION_LOADING: "DECREMENT_VISUALISATION_LOADING",
  SET_DYNAMIC_STYLING_LOADING: "SET_DYNAMIC_STYLING_LOADING",
  SET_DYNAMIC_STYLING_FINISHED: "SET_DYNAMIC_STYLING_FINISHED",
  UPDATE_LEGEND_TEXT: "UPDATE_LEGEND_TEXT",
  UPDATE_DISPLAY_MODE: "UPDATE_DISPLAY_MODE",
  UPDATE_CLASSIFICATION_METHOD: "UPDATE_CLASSIFICATION_METHOD",
  UPDATE_CUSTOM_BANDS: "UPDATE_CUSTOM_BANDS",
  UPDATE_LAYER_WIDTH_FACTOR: "UPDATE_LAYER_WIDTH_FACTOR",
  UPDATE_METADATA_FILTER: "UPDATE_METADATA_FILTER",
  SET_METADATA_TABLES: "SET_METADATA_TABLES",
  SET_METADATA_ERROR: "SET_METADATA_ERROR",
  SET_FILTERS: "SET_FILTERS",
  RESET_CONTEXT: "RESET_CONTEXT",
  UPDATE_FILTER_VALUES: "UPDATE_FILTER_VALUES",
  SET_SELECTION_MODE: "SET_SELECTION_MODE",
  SET_SELECTED_FEATURES: "SET_SELECTED_FEATURES",
  SET_IS_FEATURE_SELECT_ACTIVE: "SET_IS_FEATURE_SELECT_ACTIVE",
  UPDATE_VISUALISED_FEATURES: "UPDATE_VISUALISED_FEATURES",
  SET_BOUNDS_AND_CENTROID: 'SET_BOUNDS_AND_CENTROID',
  CLEAR_BOUNDS_AND_CENTROID: 'CLEAR_BOUNDS_AND_CENTROID',
  UPDATE_DOWNLOAD_QUERY_PARAMS: "UPDATE_DOWNLOAD_QUERY_PARAMS",
  SET_DRAW_INSTANCE: "SET_DRAW_INSTANCE",
  STORE_CURRENT_ZOOM: "STORE_CURRENT_ZOOM",
  UPDATE_LAYER_TOOLTIP_URL: 'UPDATE_LAYER_TOOLTIP_URL',
  SET_PARAM_NAME_TO_UUID_MAP: 'SET_PARAM_NAME_TO_UUID_MAP',
  REGISTER_CATEGORICAL_LEGEND_ITEMS: "REGISTER_CATEGORICAL_LEGEND_ITEMS",
  MERGE_CATEGORICAL_LEGEND_CACHE: "MERGE_CATEGORICAL_LEGEND_CACHE",
  CLEAR_CATEGORICAL_LEGEND_CACHE: "CLEAR_CATEGORICAL_LEGEND_CACHE",
  TOGGLE_INVERTED_COLOR_SCHEME: "TOGGLE_INVERTED_COLOR_SCHEME",
  SET_BASE_MAP: "SET_BASE_MAP",
};

/**
 * Merges new categorical legend entries into the existing cache.
 *
 * @param {Object} currentCache - The current categorical legend cache.
 * @param {Object} nextEntries - The entries to merge into the cache.
 * @returns {Object} The merged cache.
 */
const mergeCategoricalLegendEntries = (currentCache = {}, nextEntries = {}) => {
  if (!nextEntries || typeof nextEntries !== "object") {
    return currentCache;
  }

  return {
    ...currentCache,
    ...nextEntries,
  };
};

/**
 * Reducer function for managing map state.
 * @function mapReducer
 * @param {Object} state - The current state.
 * @param {Object} action - The action to be performed.
 * @property {string} action.type - The type of action.
 * @property {Object} action.payload - The payload of the action.
 * @returns {Object} The new state.
 */
export const mapReducer = (state, action) => {
  switch (action.type) {
    case actionTypes.STORE_CURRENT_ZOOM: {
      return { ...state, currentZoom: action.payload }
    }

    case actionTypes.SET_BOUNDS_AND_CENTROID: {
      const { centroid, bounds, featureName, layerMetadata } = action.payload;
      return { ...state, mapBoundsAndCentroid: { centroid, bounds, featureName, layerMetadata } };
    }

    case actionTypes.CLEAR_BOUNDS_AND_CENTROID:
      return { ...state, mapBoundsAndCentroid: null };

    case actionTypes.SET_DRAW_INSTANCE:
      return {
        ...state,
        drawInstance: action.payload,
      };

    case actionTypes.UPDATE_VISUALISED_FEATURES: {
      const { filter, value } = action.payload;
      const { layer } = filter;
      const newVisualisedFeatureIds = {
        ...state.visualisedFeatureIds,
        [layer]: value,
      };
      return { ...state, visualisedFeatureIds: newVisualisedFeatureIds };
    }
    case actionTypes.SET_SELECTION_MODE:
      return { ...state, selectionMode: action.payload };
    case actionTypes.SET_SELECTED_FEATURES:
      return { ...state, selectedFeatures: action.payload };
    case actionTypes.SET_IS_FEATURE_SELECT_ACTIVE:
      return { ...state, isFeatureSelectActive: action.payload };
    case actionTypes.UPDATE_MAP_CENTRE:
      return { ...state, mapCentre: action.payload };
    case actionTypes.UPDATE_MAP_ZOOM:
      return { ...state, mapZoom: action.payload };
    case actionTypes.UPDATE_MAP_STYLE:
      return { ...state, mapStyle: action.payload };
    case actionTypes.RESET_CONTEXT:
      return {
        ...state,
        layers: {},
        colorSchemesByLayer: {},
        customColorSchemeSelectedByLayer: {},
        visualisations: {},
        filters: [],
        leftVisualisations: {},
        rightVisualisations: {},
        isLoading: true,
        visualisationLoadingCount: 0,
        pageIsReady: false,
        selectionMode: null,
        selectionLayer: null,
        selectedFeatures: [],
        isFeatureSelectActive: false,
        visualisedFeatureIds: null,
        mapBoundsAndCentroid: null,
      };
    case actionTypes.REGISTER_CATEGORICAL_LEGEND_ITEMS:
    case actionTypes.MERGE_CATEGORICAL_LEGEND_CACHE:
      return {
        ...state,
        categoricalLegendCache: mergeCategoricalLegendEntries(
          state.categoricalLegendCache,
          action.payload
        ),
      };
    case actionTypes.CLEAR_CATEGORICAL_LEGEND_CACHE:
      return {
        ...state,
        categoricalLegendCache: {},
      };
    case actionTypes.SET_PAGE_INFO:
      return { ...state, pageInfo: action.payload };
    case actionTypes.INITIALISE_SIDEBAR:
      return { ...state, filters: action.payload };
    case actionTypes.ADD_LAYER: {
      const newLayers = { ...state.layers };
      const newColorSchemes = { ...state.colorSchemesByLayer };

      Object.keys(action.payload).forEach(layerName => {
        const layerData = action.payload[layerName];
        // invertColourOnLaunch (page config) seeds the runtime invertedColorScheme flag.
        // Fall back to any pre-existing invertedColorScheme on the layer object.
        const invertedColorScheme =
          layerData.invertColourOnLaunch !== undefined
            ? Boolean(layerData.invertColourOnLaunch)
            : Boolean(layerData.invertedColorScheme);
        newLayers[layerName] = { ...layerData, invertedColorScheme };
        if (!newColorSchemes[layerName]) {
          newColorSchemes[layerName] = { value: "YlGnBu", label: "YlGnBu" };
        }
      });

      return {
        ...state,
        layers: newLayers,
        colorSchemesByLayer: newColorSchemes,
      };
    }
    case actionTypes.UPDATE_PARAMETERISED_LAYER: {
      // Get the layer name and new parameters from the payload
      const layerName = action.payload.targetLayer;
      const newParamValue = action.payload.value;

      if (newParamValue == null) {
        // Do not update the layer if value is null
        return state; // Return the current state unmodified
      }

      // Prepare the parameters object for replacement (one entry per parameter the filter sets)
      const params = expandFilterParamValues(action.payload.filter, newParamValue);
      const paramNames = Object.keys(params);

      // Opt-in for dual maps: a layer with separateSidePaths keeps a separate path per side,
      // so a "Left"/"Right" filter only changes the tiles on its own map. Any other filter
      // (sides "both" or unset) changes both sides, and layer.path for single-map use.
      const layer = state.layers[layerName];
      if (layer.separateSidePaths) {
        const side = action.payload.sides;
        const isOneSide = side === "left" || side === "right";
        const targetSides = isOneSide ? [side] : ["left", "right"];
        const sidePaths = { ...(layer.sidePaths ?? { left: layer.path, right: layer.path }) };
        const sideMissingParams = {
          ...(layer.sideMissingParams ?? {
            left: layer.missingParams || [],
            right: layer.missingParams || [],
          }),
        };
        targetSides.forEach((target) => {
          sidePaths[target] = updateUrlParameters(layer.pathTemplate, sidePaths[target], params);
          sideMissingParams[target] = sideMissingParams[target].filter(
            (param) => !paramNames.includes(param)
          );
        });
        return {
          ...state,
          layers: {
            ...state.layers,
            [layerName]: {
              ...layer,
              path: isOneSide
                ? layer.path
                : updateUrlParameters(layer.pathTemplate, layer.path, params),
              sidePaths,
              sideMissingParams,
              // The layer is added to both maps once neither side is missing anything.
              missingParams: [...new Set([...sideMissingParams.left, ...sideMissingParams.right])],
            },
          },
        };
      }

      // Update the path of the layer with the new parameters
      const updatedPath = updateUrlParameters(
        state.layers[layerName].pathTemplate,
        state.layers[layerName].path,
        params
      );

      // Update the missingParams array if it exists
      const currentMissingParams = state.layers[layerName].missingParams || [];
      const updatedMissingParams = currentMissingParams.filter(
        (param) => !paramNames.includes(param)
      );

      // Update the layer in the state
      return {
        ...state,
        layers: {
          ...state.layers,
          [layerName]: {
            ...state.layers[layerName],
            path: updatedPath,
            missingParams: updatedMissingParams,
          },
        },
      };
    }
    case actionTypes.UPDATE_LAYER_PAINT: {
      const { layerName, paintProperty } = action.payload;
      return {
        ...state,
        layers: {
          ...state.layers,
          [layerName]: {
            ...state.layers[layerName],
            paint: {
              ...state.layers[layerName].paint,
              ...paintProperty,
            },
          },
        },
      };
    }

    case actionTypes.UPDATE_COLOR_SCHEME: {
      const { layerName, color_scheme } = action.payload;
      return {
        ...state,
        colorSchemesByLayer: {
          ...state.colorSchemesByLayer,
          [layerName]: color_scheme,
        },
        customColorSchemeSelectedByLayer: {
          ...state.customColorSchemeSelectedByLayer,
          [layerName]: true,
        },
      };
    }

    case actionTypes.UPDATE_CLASSIFICATION_METHOD: {
      const { class_method, layerName } = action.payload;
      return {
        ...state,
        layers: {
          ...state.layers,
          [layerName]: {
            ...state.layers[layerName],
            class_method,
          },
        },
      };
    }

    case actionTypes.UPDATE_CUSTOM_BANDS: {
      const { customBands, layerName } = action.payload;
      return {
        ...state,
        layers: {
          ...state.layers,
          [layerName]: {
            ...state.layers[layerName],
            customBands,
            class_method: 'c', // Set to custom classification
          },
        },
      };
    }

    case actionTypes.UPDATE_LAYER_WIDTH_FACTOR: {
      const { layerName, widthFactor } = action.payload;
      return {
        ...state,
        layers: {
          ...state.layers,
          [layerName]: {
            ...state.layers[layerName],
            widthFactor,
          },
        },
      };
    }

    case actionTypes.TOGGLE_INVERTED_COLOR_SCHEME: {
      const { layerName } = action.payload;
      return {
        ...state,
        layers: {
          ...state.layers,
          [layerName]: {
            ...state.layers[layerName],
            invertedColorScheme: !state.layers[layerName]?.invertedColorScheme,
          },
        },
      };
    }

    case actionTypes.ADD_VISUALISATION: {
      // Logic to add a visualisation.
      const addedVisualisations = Object.fromEntries(
        Object.entries(action.payload).map(([visName, visualisation]) => [
          visName,
          {
            ...visualisation,
            displayMode: normaliseDisplayMode(visualisation?.displayMode),
          },
        ])
      );

      const visualisationContent = {
        ...state.visualisations,
        ...addedVisualisations,
      };
      return {
        ...state,
        visualisations: visualisationContent,
        leftVisualisations: visualisationContent,
        rightVisualisations: visualisationContent,
      };
    }

    case actionTypes.UPDATE_PATH_PARAMS: {
      const visualisationNames = action.payload.filter.visualisations;
      const joinStyle = action.payload.joinStyle || action.payload.filter?.joinStyle || "slash";

      const updatedVisualisations = updateParamMaps(
        state.visualisations,
        visualisationNames,
        "pathParams",
        getParamUpdates(action.payload),
        joinStyle
      );

      return {
        ...state,
        visualisations: updatedVisualisations,
      };
    }

    case actionTypes.UPDATE_DUAL_PATH_PARAMS: {
      const visualisationNames = action.payload.filter.visualisations;
      const joinStyle = action.payload.joinStyle || action.payload.filter?.joinStyle || "slash";
      const paramUpdates = getParamUpdates(action.payload);

      // Prepare the target(s) based on sides
      const targets = (() => {
        switch (action.payload.sides) {
          case "left":
            return [{ ...state.leftVisualisations }];
          case "right":
            return [{ ...state.rightVisualisations }];
          case "both":
            return [{ ...state.leftVisualisations }, { ...state.rightVisualisations }];
          default:
            return [{ ...state.leftVisualisations }];
        }
      })();

      // Apply updates to each target pane
      const updatedTargets = targets.map((visMap) =>
        updateParamMaps(visMap, visualisationNames, "pathParams", paramUpdates, joinStyle)
      );

      // Return updated state matching requested sides
      switch (action.payload.sides) {
        case "left":
          return { ...state, leftVisualisations: updatedTargets[0] };
        case "right":
          return { ...state, rightVisualisations: updatedTargets[0] };
        case "both":
          return {
            ...state,
            leftVisualisations: updatedTargets[0],
            rightVisualisations: updatedTargets[1],
          };
        default:
          return { ...state, leftVisualisations: updatedTargets[0] };
      }
    }

    case actionTypes.UPDATE_QUERY_PARAMS: {
      const visualisationNames = action.payload.filter.visualisations;

      // For query params, use comma-delimited arrays by default
      const updatedVisualisations = updateParamMaps(
        state.visualisations,
        visualisationNames,
        "queryParams",
        getParamUpdates(action.payload),
        "comma"
      );

      return {
        ...state,
        visualisations: updatedVisualisations,
      };
    }

    case actionTypes.UPDATE_DUAL_QUERY_PARAMS: {
      const visualisationNames = action.payload.filter.visualisations;

      // For query params, use comma-delimited arrays by default
      const paramUpdates = getParamUpdates(action.payload);

      // Prepare the target(s) based on sides
      const targets = (() => {
        switch (action.payload.sides) {
          case "left":
            return [{ ...state.leftVisualisations }];
          case "right":
            return [{ ...state.rightVisualisations }];
          case "both":
            return [{ ...state.leftVisualisations }, { ...state.rightVisualisations }];
          default:
            return [{ ...state.leftVisualisations }];
        }
      })();

      // Apply updates to each target pane
      const updatedTargets = targets.map((visMap) =>
        updateParamMaps(visMap, visualisationNames, "queryParams", paramUpdates, "comma")
      );

      // Return updated state matching requested sides
      switch (action.payload.sides) {
        case "left":
          return { ...state, leftVisualisations: updatedTargets[0] };
        case "right":
          return { ...state, rightVisualisations: updatedTargets[0] };
        case "both":
          return {
            ...state,
            leftVisualisations: updatedTargets[0],
            rightVisualisations: updatedTargets[1],
          };
        default:
          return { ...state, leftVisualisations: updatedTargets[0] };
      }
    }

    case actionTypes.UPDATE_ALL_DATA: {
      const side = action.payload.left;
      switch (side) {
        case true: {
          return {
            ...state,
            leftVisualisations: {
              ...state.leftVisualisations,
              [action.payload.visualisationName]: {
                ...state.leftVisualisations[action.payload.visualisationName],
                data: action.payload.data,
              },
            },
          };
        }
        case false: {
          return {
            ...state,
            rightVisualisations: {
              ...state.rightVisualisations,
              [action.payload.visualisationName]: {
                ...state.rightVisualisations[action.payload.visualisationName],
                data: action.payload.data,
              },
            },
          };
        }
        default:
          return {
            ...state,
            visualisations: {
              ...state.visualisations,
              [action.payload.visualisationName]: {
                ...state.visualisations[action.payload.visualisationName],
                data: action.payload.data,
              },
            },
          };
      }
    }

    case actionTypes.SET_DATA_REQUESTED:
      return { ...state, dataRequested: action.payload };

      case actionTypes.SET_NO_DATA_RETURNED:
        return { ...state, noDataReturned: action.payload };

    case actionTypes.SET_MAP: {
      const { map } = action.payload;
      // Attempt to find a colourValue
      const visualisationName = Object.keys(state.visualisations)[0];
      let colourValue = findFirstColourValue(state.filters) || state.visualisations[visualisationName].colorValue;

      // If colourValue is null, default to { value: "YlGnBu", label: "YlGnBu" }
      if (!colourValue) {
        colourValue = { value: "YlGnBu", label: "YlGnBu" };
      }  

      return {
        ...state,
        map: map, // Store the map instance directly in the state
        // color_scheme: colourValue, // Use either the found or default colourValue
        // class_method: "d",
      };
    }

    case actionTypes.SET_BASE_MAP: {
      const baseMapId = action.payload;
      const baseMap = getBaseMap(baseMapId);
      return {
        ...state,
        baseMapId,
        mapStyle: baseMap ? baseMap.resolveStyle() : state.mapStyle,
      };
    }

    case actionTypes.SET_DUAL_MAPS: {
      const { maps } = action.payload;
      // Attempt to find a colourValue
      const visualisationName = Object.keys(state.visualisations)[0];
      let colourValue = findFirstColourValue(state.filters) || state.visualisations[visualisationName].colorValue;
    
      // If colourValue is null, default to { value: "YlGnBu", label: "YlGnBu" }
      if (!colourValue) {
        colourValue = { value: "YlGnBu", label: "YlGnBu" };
      }

      return {
        ...state,
        maps: maps, // Store the map instances directly in the state
        color_scheme: colourValue, // Use either the found or default colourValue
        class_method: "d",
      };
    }
    case actionTypes.SET_IS_LOADING: {
      return { ...state, isLoading: true };
    }
    case actionTypes.SET_LOADING_FINISHED: {
      return { ...state, isLoading: false };
    }
    case actionTypes.INCREMENT_VISUALISATION_LOADING: {
      return { ...state, visualisationLoadingCount: (state.visualisationLoadingCount ?? 0) + 1 };
    }
    case actionTypes.DECREMENT_VISUALISATION_LOADING: {
      return { ...state, visualisationLoadingCount: Math.max(0, (state.visualisationLoadingCount ?? 0) - 1) };
    }
    case actionTypes.SET_DYNAMIC_STYLING_LOADING: {
      return { ...state, isDynamicStylingLoading: true };
    }
    case actionTypes.SET_DYNAMIC_STYLING_FINISHED: {
      return { ...state, isDynamicStylingLoading: false };
    }
    case actionTypes.UPDATE_LEGEND_TEXT: {
      const visualisationNames = action.payload.filter.visualisations;
      const newParamValue = action.payload.value;
      const values = action.payload.filter?.values?.values || [];
      const position = values.findIndex(
        (value) => value.paramValue === newParamValue
      );
      const required_values = values[position];

      const updatedVisualisations = { ...state.visualisations };

      visualisationNames.forEach((visName) => {
        if (updatedVisualisations[visName]) {
          const legendRules = getLegendRulesForVisualisation(
            action.payload.filter,
            visName
          );
          const currentLegendText = updatedVisualisations[visName]?.legendText?.[0] || {};
          const resolvedDisplayValue = resolveLegendTextByRules(
            legendRules.displayRules,
            required_values,
            required_values?.displayValue ?? currentLegendText.displayValue
          );
          const resolvedLegendSubtitleText = resolveLegendTextByRules(
            legendRules.subtitleRules,
            required_values,
            required_values?.legendSubtitleText ?? currentLegendText.legendSubtitleText
          );

          const newLegendText = {
            displayValue: resolvedDisplayValue,
            legendSubtitleText: resolvedLegendSubtitleText,
          };

          updatedVisualisations[visName] = {
            ...updatedVisualisations[visName],
            // Replace legendText with a single resolved entry used by legend/map label components.
            legendText: [newLegendText], // Replace the existing legendText array with the new one
          };
        }
      });

      // Return the new state with updated visualisations
      return {
        ...state,
        visualisations: updatedVisualisations,
      };
    }
    case actionTypes.UPDATE_DISPLAY_MODE: {
      // Track the display mode on the visualisation itself.
      const displayMode = normaliseDisplayMode(action.payload.value);

      // A display-mode filter that names no visualisations applies to all of them: the
      // mode describes the data the page is drawn from, not one layer's styling.
      const visualisationNames =
        action.payload.filter?.visualisations ?? Object.keys(state.visualisations);

      const updatedVisualisations = { ...state.visualisations };

      visualisationNames.forEach((visName) => {
        if (!updatedVisualisations[visName]) return;

        updatedVisualisations[visName] = {
          ...updatedVisualisations[visName],
          displayMode,
        };
      });

      return {
        ...state,
        visualisations: updatedVisualisations,
      };
    }
    case actionTypes.UPDATE_METADATA_FILTER: {
      return { ...state, metadataFilters: action.payload.metadataFilters };
    }
    case actionTypes.SET_METADATA_TABLES: {
      return { ...state, metadataTables: action.payload };
    }
    case actionTypes.SET_METADATA_ERROR: {
      return { ...state, metadataError: action.payload };
    }
    case actionTypes.SET_FILTERS: {
      return { ...state, filters: action.payload };
    }
    case actionTypes.UPDATE_FILTER_VALUES: {
      return { ...state, filters: action.payload.updatedFilters };
    }
    case actionTypes.SET_PAGE_IS_READY: {
      return {
        ...state,
        pageIsReady: action.payload,
      };
    }
    case actionTypes.UPDATE_LAYER_TOOLTIP_URL: {
      const { layerName, requestUrl } = action.payload;
      return {
        ...state,
        layers: {
          ...state.layers,
          [layerName]: {
            ...state.layers[layerName],
            customTooltip: {
              ...state.layers[layerName].customTooltip,
              requestUrl,
            },
          },
        },
      };
    }

    case actionTypes.SET_PARAM_NAME_TO_UUID_MAP:
      return {
        ...state,
        paramNameToUuidMap: action.payload,
      };
    default:
      return state;
  }
};
