/**
 * Updates the validity and visibility (hiding) of filter values based on the metadata table.
 * - Only sets `isValid` when `shouldBeValidated` is true, so the Dropdown won’t show icons otherwise.
 * - Hides invalid options when `shouldFilterOnValidation` OR `shouldBeFiltered` is true.
 * - Groups individual filters by common identifiers (DM/DS/Scen. 1/2/Left/Right/default).
 * @function updateFilterValidity
 * @param {Object} state - The current MapContext state (contains filters and metadata tables).
 * @param {Object} filterState - The current FilterContext state (current selections by filter id).
 * @returns {Array} Updated filters array with `isValid` and/or `isHidden` applied.
 */
export function updateFilterValidity(state, filterState) {
  // Filters without an options list (such as metadata-driven date ranges) have nothing to validate.
  const hasMetadataOptions = (filter) =>
    filter.values && filter.values.metadataTableName && Array.isArray(filter.values.values);
  const activeFilters = state.filters.filter(hasMetadataOptions);

  // Build full valid set for each filter from its metadata table
  const validValuesMap = {};
  // Initialise validValuesMap with all possible values for each filter
  activeFilters.forEach((filter) => {
    const sourceName = filter.values.metadataTableName;
    const metadataTable = state.metadataTables[sourceName];
    if (metadataTable) {
      validValuesMap[filter.id] = new Set(
        metadataTable.map((row) => row[filter.values.paramColumn])
      );
    }
  });

  // Group by identifiers
  const identifiers = ['DM', 'DS', 'Scen. 1', 'Scen. 2', 'Left', 'Right', 'Scenario 1', 'Scenario 2'];
  const filterGroups = activeFilters.reduce((groups, filter) => {
    const groupNames = identifiers.filter((id) => filter.filterName.includes(id));
    if (groupNames.length > 0) {
      groupNames.forEach((groupName) => {
        if (!groups[groupName]) groups[groupName] = [];
        groups[groupName].push(filter);
      });
    } else {
      if (!groups.default) groups.default = [];
      groups.default.push(filter);
    }
    return groups;
  }, {});

  // Narrow valid sets within each group based on selections,
  // but ONLY when the source filter has shouldFilterOthers = true,
  // and only apply narrowing to filters with shouldBeFiltered = true.
  Object.values(filterGroups).forEach((groupFilters) => {
    groupFilters.forEach((filter) => {
      if (!filter.shouldFilterOthers) return;

      const selectedValues = filterState[filter.id];
      if (
        selectedValues &&
        (!Array.isArray(selectedValues) || (Array.isArray(selectedValues) && selectedValues.length > 0))
      ) {
        const sourceName = filter.values.metadataTableName;
        const metadataTable = state.metadataTables[sourceName];
        if (!metadataTable) return;

        const validRows = Array.isArray(selectedValues)
          ? metadataTable.filter((row) => selectedValues.includes(row[filter.values.paramColumn]))
          : metadataTable.filter((row) => row[filter.values.paramColumn] === selectedValues);

        groupFilters.forEach((otherFilter) => {
          // Only narrow filters that should be filtered
          if (
            otherFilter.id !== filter.id &&
            otherFilter.values.metadataTableName === sourceName &&
            !!otherFilter.shouldBeFiltered
          ) {
            const validParamValues = new Set();
            validRows.forEach((row) => {
              validParamValues.add(row[otherFilter.values.paramColumn]);
            });
            validValuesMap[otherFilter.id] = new Set(
              [...validValuesMap[otherFilter.id]].filter((value) => validParamValues.has(value))
            );
          }
        });
      }
    });
  });

  // Apply isValid/isHidden per filter according to flags
  const updatedFilters = state.filters.map((filter) => {
    if (!hasMetadataOptions(filter)) return filter;

    const validSet = validValuesMap[filter.id];
    if (!validSet) return filter;

    const shouldSetIsValid = !!filter.shouldBeValidated;
    const shouldHideInvalid = !!filter.shouldFilterOnValidation || !!filter.shouldBeFiltered;

    const updatedValues = filter.values.values.map((value) => {
      const isValidNow = validSet.has(value.paramValue);

      return {
        ...value,
        // Only set isValid when shouldBeValidated is true; otherwise explicitly clear so Dropdown shows no icon
        ...(shouldSetIsValid ? { isValid: isValidNow } : { isValid: undefined }),
        // Hide when flags demand it; otherwise preserve current isHidden (default false)
        isHidden: shouldHideInvalid ? !isValidNow : (value.isHidden ?? false),
      };
    });

    return {
      ...filter,
      values: {
        ...filter.values,
        values: updatedValues,
      },
    };
  });

  return updatedFilters;
}

/**
 * Corrects cross-filter constraint violations in an initial filter values map.
 *
 * `getInitialFilterValue` computes each filter's default independently, so a
 * `shouldBeFiltered` filter's default may be invalid given the `shouldFilterOthers`
 * filter's default selection. This function applies `updateFilterValidity` to the
 * initial state and corrects any hidden values before the first dispatch, preventing
 * the first API call from using an invalid parameter combination.
 *
 * @param {Array}  filters        - Filter config objects with populated metadata values.
 * @param {Object} metadataTables - Metadata tables keyed by table name.
 * @param {Object} initialValues  - Map of { [filterId]: value } to derive corrected values from.
 * @returns {Object} A new values map with any cross-filter violations corrected.
 */
export function correctInitialCrossFilterValues(filters, metadataTables, initialValues) {
  const pseudoState = { filters, metadataTables };
  const validated = updateFilterValidity(pseudoState, initialValues);

  const corrected = { ...initialValues };

  validated.forEach((filter) => {
    if (!filter.shouldBeFiltered || !filter.values?.values) return;

    const currentValue = corrected[filter.id];

    if (filter.multiSelect) {
      if (!Array.isArray(currentValue) || currentValue.length === 0) return;

      const visibleValues = currentValue.filter((val) =>
        filter.values.values.some((v) => v.paramValue === val && !v.isHidden),
      );

      if (visibleValues.length !== currentValue.length) {
        corrected[filter.id] =
          visibleValues.length > 0
            ? visibleValues
            : filter.values.values.filter((v) => !v.isHidden).map((v) => v.paramValue);
      }
    } else {
      if (currentValue === null || currentValue === undefined) return;

      const currentOption = filter.values.values.find((v) => v.paramValue === currentValue);
      if (currentOption?.isHidden) {
        const firstVisible = filter.values.values.find((v) => !v.isHidden);
        corrected[filter.id] = firstVisible?.paramValue ?? null;
      }
    }
  });

  return corrected;
}

/**
 * Corrects cross-filter constraint violations in the current FilterContext state at runtime.
 *
 * Called after `validatedFilters` changes (e.g. the user changed a `shouldFilterOthers`
 * filter). At that point the filter options have been re-narrowed by `updateFilterValidity`,
 * but the selected values in FilterContext may still reference options that are now hidden.
 * This function dispatches `SET_FILTER_VALUE` for each such filter to realign the selection
 * with the new visible set.
 *
 * @param {Array}    validatedFilters - Filter configs with `isHidden` already applied.
 * @param {Object}   filterState      - Current FilterContext state (selected values by filter id).
 * @param {Function} filterDispatch   - FilterContext dispatch function.
 * @returns {boolean} True if at least one correction was dispatched.
 */
export function correctRuntimeCrossFilterValues(validatedFilters, filterState, filterDispatch) {
  let corrected = false;

  validatedFilters.forEach((filter) => {
    if (!filter.shouldBeFiltered || !filter.values?.values) return;

    const currentValue = filterState[filter.id];

    if (filter.multiSelect) {
      if (!Array.isArray(currentValue) || currentValue.length === 0) return;

      const visibleValues = currentValue.filter((val) =>
        filter.values.values.some((v) => v.paramValue === val && !v.isHidden),
      );

      if (visibleValues.length !== currentValue.length) {
        filterDispatch({
          type: "SET_FILTER_VALUE",
          payload: {
            filterId: filter.id,
            value:
              visibleValues.length > 0
                ? visibleValues
                : filter.values.values.filter((v) => !v.isHidden).map((v) => v.paramValue),
            filter,
          },
        });
        corrected = true;
      }
    } else {
      if (currentValue === null || currentValue === undefined) return;

      const currentOption = filter.values.values.find((v) => v.paramValue === currentValue);
      if (currentOption?.isHidden) {
        const firstVisible = filter.values.values.find((v) => !v.isHidden);
        filterDispatch({
          type: "SET_FILTER_VALUE",
          payload: { filterId: filter.id, value: firstVisible?.paramValue ?? null, filter },
        });
        corrected = true;
      }
    }
  });

  return corrected;
}

/**
 * Check if the condition is valid.
 * @function isValidCondition
 * @param {Object} condition - The condition to validate.
 * @returns {boolean} True if the condition is valid, false otherwise.
 */
export const isValidCondition = (condition) => {
  const validOperands = ['=', '!=', '>', '<', '>=', '<=', 'IN', 'NOT IN'];
  return condition &&
    typeof condition.column === 'string' &&
    validOperands.includes(condition.operand) &&
    (typeof condition.value !== 'undefined' || Array.isArray(condition.values));
};

/**
 * Apply a condition to filter the data.
 * @function applyCondition
 * @param {Array} data - The data to filter.
 * @param {Object} condition - The condition to apply.
 * @returns {Array} The filtered data.
 */
export const applyCondition = (data, condition) => {
  const { column, operand, value, values } = condition;

  return data.filter(item => {
    switch (operand) {
      case '=':
        return item[column] === value;
      case '!=':
        return item[column] !== value;
      case '>':
        return item[column] > value;
      case '<':
        return item[column] < value;
      case '>=':
        return item[column] >= value;
      case '<=':
        return item[column] <= value;
      case 'IN':
        return Array.isArray(values) && values.includes(item[column]);
      case 'NOT IN':
        return Array.isArray(values) && !values.includes(item[column]);
      default:
        return true;
    }
  });
};