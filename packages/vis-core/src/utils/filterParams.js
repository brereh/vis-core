/**
 * Helpers for filters that set more than one API parameter.
 *
 * Most filters have a single string `paramName` and a scalar or array value. A filter can
 * instead set several parameters by giving `paramName` as an array (for example a date range,
 * `["date_from", "date_to"]`) and/or an `extraToggle` with its own `paramName`. Its value is
 * then an array with one entry per parameter, in the order returned by `getFilterParamNames`.
 */

/**
 * Returns true when a filter sets more than one parameter.
 * @param {Object} filter - The filter configuration object.
 * @returns {boolean}
 */
export const isMultiParamFilter = (filter) =>
  Array.isArray(filter?.paramName) || Boolean(filter?.extraToggle?.paramName);

/**
 * Lists every parameter name a filter sets: its `paramName` (or each entry of an array
 * `paramName`), followed by `extraToggle.paramName` when configured.
 * @param {Object} filter - The filter configuration object.
 * @returns {string[]} The parameter names, in value order.
 */
export const getFilterParamNames = (filter) => {
  if (!filter) return [];
  const names = Array.isArray(filter.paramName) ? [...filter.paramName] : [filter.paramName];
  if (filter.extraToggle?.paramName) names.push(filter.extraToggle.paramName);
  return names.filter((name) => typeof name === "string" && name.trim() !== "");
};

/**
 * Returns true when the filter sets the given parameter.
 * @param {Object} filter - The filter configuration object.
 * @param {string} paramName - The parameter name to look for.
 * @returns {boolean}
 */
export const filterHasParam = (filter, paramName) =>
  getFilterParamNames(filter).includes(paramName);

/**
 * Maps a filter value to the parameters it sets.
 *
 * Single-parameter filters return `{ [paramName]: value }` unchanged. Multi-parameter filters
 * pair each parameter name with the value at the same index. A missing `extraToggle` value
 * falls back to `extraToggle.defaultValue` (or `false`) once the rest of the value is set.
 *
 * @param {Object} filter - The filter configuration object.
 * @param {any} value - The filter value from FilterContext.
 * @returns {Object<string, any>} Parameter name to value.
 */
export const expandFilterParamValues = (filter, value) => {
  if (!isMultiParamFilter(filter)) return { [filter?.paramName]: value };

  const names = getFilterParamNames(filter);
  const values = Array.isArray(value) ? value : [];
  const toggleIndex = filter.extraToggle?.paramName ? names.length - 1 : -1;

  return Object.fromEntries(
    names.map((name, index) => {
      let paramValue = values[index];
      if (index === toggleIndex && paramValue === undefined && values.length > 0) {
        paramValue = Boolean(filter.extraToggle.defaultValue);
      }
      return [name, paramValue];
    })
  );
};
