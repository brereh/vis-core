/**
 * Utility for managing filter state persistence in localStorage
 * 
 * Filter states are persisted using a unique key combining filterName and paramName
 * to ensure proper identification across different pages.
 */

import { getDefaultDateRangeValue, normaliseDateRangeValue } from "./dateRange";

const FILTER_STORAGE_PREFIX = 'filter_state_';

/**
 * Generate a unique storage key for a filter based on filterName and paramName
 * @param {string} filterName - The name of the filter
 * @param {string} paramName - The parameter name of the filter
 * @returns {string} The unique storage key
 */
export const generateFilterStorageKey = (filterName, paramName) => {
  if (!filterName || !paramName) {
    console.warn('Cannot generate filter storage key without filterName and paramName');
    return null;
  }
  return `${FILTER_STORAGE_PREFIX}${filterName}_${paramName}`;
};

/**
 * Save a filter's value to localStorage
 * @param {Object} filter - The filter configuration object
 * @param {any} value - The value to persist
 * @returns {boolean} True if saved successfully, false otherwise
 */
export const saveFilterState = (filter, value) => {
  if (!filter || !filter.persistState) {
    return false;
  }

  const storageKey = generateFilterStorageKey(filter.filterName, filter.paramName);
  if (!storageKey) {
    return false;
  }

  try {
    const stateData = {
      value: value,
      timestamp: new Date().toISOString(),
      filterName: filter.filterName,
      paramName: filter.paramName,
    };
    localStorage.setItem(storageKey, JSON.stringify(stateData));
    console.log(`[Filter Persistence] Saved: ${storageKey}`, value);
    return true;
  } catch (error) {
    console.error('Failed to save filter state to localStorage:', error);
    return false;
  }
};

/**
 * Load a filter's persisted value from localStorage
 * @param {Object} filter - The filter configuration object
 * @returns {any|null} The persisted value or null if not found or invalid
 */
export const loadFilterState = (filter) => {
  if (!filter || !filter.persistState) {
    return null;
  }

  const storageKey = generateFilterStorageKey(filter.filterName, filter.paramName);
  if (!storageKey) {
    return null;
  }

  try {
    const storedData = localStorage.getItem(storageKey);
    if (!storedData) {
      console.log(`[Filter Persistence] No stored value for: ${storageKey}`);
      return null;
    }

    const parsed = JSON.parse(storedData);
    console.log(`[Filter Persistence] Loaded: ${storageKey}`, parsed.value);
    return parsed.value;
  } catch (error) {
    console.error('Failed to load filter state from localStorage:', error);
    return null;
  }
};

/**
 * Clear a specific filter's persisted state
 * @param {Object} filter - The filter configuration object
 * @returns {boolean} True if cleared successfully, false otherwise
 */
export const clearFilterState = (filter) => {
  if (!filter) {
    return false;
  }

  const storageKey = generateFilterStorageKey(filter.filterName, filter.paramName);
  if (!storageKey) {
    return false;
  }

  try {
    localStorage.removeItem(storageKey);
    return true;
  } catch (error) {
    console.error('Failed to clear filter state from localStorage:', error);
    return false;
  }
};

/**
 * Clear all persisted filter states
 * @returns {number} The number of filters cleared
 */
export const clearAllFilterStates = () => {
  try {
    let count = 0;
    const keysToRemove = [];
    
    // Collect all filter storage keys
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(FILTER_STORAGE_PREFIX)) {
        keysToRemove.push(key);
      }
    }
    
    // Remove collected keys
    keysToRemove.forEach(key => {
      localStorage.removeItem(key);
      count++;
    });
    
    return count;
  } catch (error) {
    console.error('Failed to clear all filter states from localStorage:', error);
    return 0;
  }
};

/**
 * Validate if a persisted value is still valid for the current filter options
 * This helps prevent "No data available" scenarios when switching pages
 * 
 * @param {Object} filter - The filter configuration object
 * @param {any} persistedValue - The value loaded from localStorage
 * @returns {boolean} True if the value is valid for the current filter
 */
export const isPersistedValueValid = (filter, persistedValue) => {
  if (persistedValue === null || persistedValue === undefined) {
    return false;
  }

  // Date ranges are valid when both dates parse and are in order; bounds are clamped later.
  if (filter.type === "dateRange") {
    return normaliseDateRangeValue({ ...filter, min: null, max: null }, persistedValue) !== null;
  }

  // For filters without values (like map filters), we can't validate
  if (!filter.values || !filter.values.values) {
    return true;
  }

  const availableValues = filter.values.values.map(v => v.paramValue);

  // For multi-select filters
  if (Array.isArray(persistedValue)) {
    // Check if at least some values are still valid
    const validValues = persistedValue.filter(v => availableValues.includes(v));
    return validValues.length > 0;
  }

  // For single-select filters
  return availableValues.includes(persistedValue);
};

/**
 * Get the initial value for a filter, considering persisted state
 * This function prioritizes persisted valid values, then falls back to default
 * 
 * @param {Object} filter - The filter configuration object
 * @returns {any} The initial value to use for the filter
 */
export const getInitialFilterValue = (filter) => {
  if (filter.type === "dateRange") {
    // A persisted range is clamped to the current min/max, then falls back to the default.
    const persistedValue = filter.persistState ? loadFilterState(filter) : null;
    const restored =
      persistedValue !== null && isPersistedValueValid(filter, persistedValue)
        ? normaliseDateRangeValue(filter, persistedValue)
        : null;
    return restored ?? getDefaultDateRangeValue(filter);
  }

  // First, try to load persisted state if persistence is enabled
  if (filter.persistState) {
    const persistedValue = loadFilterState(filter);
    
    if (persistedValue !== null && isPersistedValueValid(filter, persistedValue)) {
      console.log(`[Filter Persistence] Using persisted value for ${filter.filterName}:`, persistedValue);
      return persistedValue;
    } else if (persistedValue !== null) {
      console.log(`[Filter Persistence] Persisted value invalid for ${filter.filterName}:`, persistedValue);
    }
  }

  // Fall back to default initialization logic
  if (filter.shouldBeBlankOnInit) {
    return filter.multiSelect ? [] : null;
  }

  if (filter.multiSelect && filter.shouldInitialSelectAllInMultiSelect) {
    return filter.values?.values?.map(item => item.paramValue) || [];
  }

  return (
    filter.defaultValue ||
    filter.min ||
    filter.values?.values?.[0]?.paramValue ||
    null
  );
};

/**
 * Reorder filter values to prioritize a persisted value
 * This makes the persisted value appear first in the list, becoming the default selection
 * 
 * @param {Object} filter - The filter configuration object
 * @param {any} persistedValue - The value to prioritize
 * @returns {Object} A new filter object with reordered values
 */
export const reorderFilterValuesForPersistedState = (filter, persistedValue) => {
  if (!filter.values || !filter.values.values || !persistedValue) {
    return filter;
  }

  const values = [...filter.values.values];
  
  // For single-select, move the persisted value to the front
  if (!Array.isArray(persistedValue)) {
    const index = values.findIndex(v => v.paramValue === persistedValue);
    if (index > 0) {
      const [item] = values.splice(index, 1);
      values.unshift(item);
    }
  } else {
    // For multi-select, reorder to have persisted values first
    const persistedSet = new Set(persistedValue);
    const persistedItems = values.filter(v => persistedSet.has(v.paramValue));
    const otherItems = values.filter(v => !persistedSet.has(v.paramValue));
    values.splice(0, values.length, ...persistedItems, ...otherItems);
  }

  return {
    ...filter,
    values: {
      ...filter.values,
      values: values,
    },
  };
};
