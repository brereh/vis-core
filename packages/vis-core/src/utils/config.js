import { formatNumber, formatOrdinal } from "./text";
import { filterHasParam } from "./filterParams";

const autoFormatSimpleValue = (value) => {
  // numbers: format >= 1000 with commas
  if (typeof value === "number") {
    if (Math.abs(value) >= 1000) {
      return formatNumber(value); // already imported
    }
    return String(value);
  }

  // numeric strings: treat like numbers
  if (typeof value === "string" && value.trim() !== "" && !isNaN(value)) {
    const num = Number(value);
    if (Math.abs(num) >= 1000) {
      return formatNumber(num);
    }
    return value;
  }

  // everything else
  return String(value ?? "");
};

/**
 * Replace placeholders in the `target` object with values from the `source` object.
 *
 * Placeholders in the `target` object should follow the format `{key}` where `key` corresponds
 * to a property in the `source` object. The function will recursively process nested objects and arrays.
 *
 * @param {Object} target - The object with placeholders to be replaced.
 * @param {Object} source - The object providing values to replace placeholders.
 * @returns {Object} - A new object with placeholders replaced by values from the `source`.
 *
 * @throws {TypeError} - Throws if `target` or `source` is not an object.
 * @throws {Error} - Throws if a placeholder key in `target` does not exist in `source`.
 *
 * @example
 * ```js
 * const target = {
 *     name: "@firstName@ @lastName@",
 *     address: {
 *         city: "@city@",
 *         postcode: "@postcode@"
 *     },
 *     items: ["@item1@", "@item2@"]
 * };
 *
 * const source = {
 *     firstName: "John",
 *     lastName: "Doe",
 *     city: "London",
 *     postcode: "NW1 6XE",
 *     item1: "Apple",
 *     item2: "Banana"
 * };
 *
 * try {
 *     const result = replacePlaceholdersInObject(target, source);
 *     console.log(result);
 * } catch (error) {
 *     console.error(error.message);
 * }
 *
 * Yields
 * {
 *    "name": "John Doe",
 *    "address": {
 *        "city": "London",
 *        "postcode": "NW1 6XE"
 *    },
 *    "items": ["Apple", "Banana"]
 *}
 */
export function replacePlaceholdersInObject(target, source) {
  // Validate input
  if (typeof target !== "object" || target === null || Array.isArray(target)) {
    throw new TypeError("The `target` must be a non-null object.");
  }
  if (typeof source !== "object" || source === null || Array.isArray(source)) {
    throw new TypeError("The `source` must be a non-null object.");
  }

  /**
   * Recursively replace placeholders in the target object or array.
   *
   * @param {any} item - The current item being processed (could be a string, object, array, etc.).
   * @returns {any} - The processed item with placeholders replaced.
   */
  function recursiveReplace(item) {
    // Process strings with placeholder pattern {key}
    if (typeof item === "string") {
      return item.replace(/\@(\w+)\@/g, (match, key) => {
        if (!(key in source)) {
          throw new Error(
            `Placeholder key "${key}" not found in source object.`
          );
        }
        return source[key];
      });
    }

    // Recursively process objects
    if (typeof item === "object" && item !== null) {
      const result = Array.isArray(item) ? [] : {};
      for (let key in item) {
        if (item.hasOwnProperty(key)) {
          result[key] = recursiveReplace(item[key]);
        }
      }
      return result;
    }

    // For other types (number, boolean, etc.), return as is
    return item;
  }

  return recursiveReplace(target);
}

/**
 * Replaces placeholders in an HTML fragment with actual data values.
 *
 * Placeholders in the HTML fragment may appear in one of three formats:
 *
 * 1. Simple replacement: {key}
 *    - This will be replaced by data[key]. If no matching key is found, the original placeholder remains.
 *
 * 2. Function call replacement (parentheses): {functionName(argKey)}
 *    - This allows you to pass the data value (data[argKey]) through a formatting function.
 *    - The function is looked up in an allowed functions object (which can include custom functions).
 *
 * 3. Function call replacement (colon): {functionName:argKey}
 *    - Alternative syntax for function calls, useful for simpler templates.
 *    - Functions with 2+ parameters receive (value, data), functions with 1 parameter receive just (value).
 *
 * The allowed functions object is built by merging any customFunctions provided from options with default functions.
 *
 * @param {string} htmlFragment - The HTML content containing placeholders.
 * @param {Object} data - An object mapping keys to values for substitution.
 * @param {Object} [options={}] - Optional configuration settings.
 * @param {Object} [options.customFunctions] - An object mapping function names to custom formatter functions.
 * @param {boolean} [options.keepUndefined=false] - If true, undefined placeholders will remain as text (e.g., "{key}")
 *                                                  instead of being replaced by "N/A".
 * @returns {string} - The HTML string with placeholders replaced by their corresponding values or formatted values.
 *
 * @example
 *
 * const html = '<div>{formatNumber(value)} and {percent:l1_l2_l3}</div>';
 * const data = { value: 1234567, l1_l2_l3: 50, total: 100 };
 * const customFns = {
 *   formatNumber: (num) => Number(num).toLocaleString(),
 *   percent: (val, data) => ((val / data.total) * 100).toFixed(1) + '%'
 * };
 *
 * const result = replacePlaceholders(html, data, { customFunctions: customFns });
 * // result: '<div>1,234,567 and 50.0%</div>'
 */
export const replacePlaceholders = (htmlFragment, data, options = {}) => {
  // Define default functions here (universal across apps)
  const defaultFunctions = {
    formatNumber,
    formatOrdinal,
  };

  // Merge with custom functions if provided
  const allowedFunctions = {
    ...defaultFunctions,
    ...(options.customFunctions || {}),
  };

  let result = htmlFragment;

  // Step 1: Handle colon syntax {functionName:argKey}
  result = result.replace(
    /\{(\w+):([a-zA-Z0-9_.]+)\}/g,
    (match, functionName, argKey) => {
      const arg = data[argKey];

      // If arg is undefined, return the original placeholder
      if (arg === undefined) {
        return match;
      }

      // Check if the function is allowed
      const func = allowedFunctions[functionName];
      if (func && typeof func === "function") {
        try {
          // Check function parameter count to determine how to call it
          if (func.length >= 2) {
            // Functions with 2+ parameters get both value and full data object
            return func(arg, data);
          } else {
            // Functions with 1 parameter get just the value
            return func(arg);
          }
        } catch (error) {
          console.warn(`Error applying function ${functionName}:`, error);
          return String(arg);
        }
      }

      // If function is not allowed, return the original placeholder
      return match;
    }
  );

  // Step 2: Handle parentheses syntax {functionName(argKey)} (existing functionality)
  result = result.replace(
    /\{(\w+)\(([a-zA-Z0-9_.]+)\)\}/g,
    (match, functionName, argKey) => {
      const arg = data[argKey];

      // If arg is undefined, check options to decide whether to keep placeholder or return "N/A"
      if (arg === undefined) {
        return options.keepUndefined ? match : "N/A";
      }

      // Check if the function is allowed
      const func = allowedFunctions[functionName];
      if (func && typeof func === "function") {
        try {
          // Check function parameter count to determine how to call it
          if (func.length >= 2) {
            // Functions with 2+ parameters get both value and full data object
            return func(arg, data);
          } else {
            // Functions with 1 parameter get just the value
            return func(arg);
          }
        } catch (error) {
          console.warn(`Error applying function ${functionName}:`, error);
          return String(arg);
        }
      }

      // If function is not allowed, return the original placeholder
      return match;
    }
  );

  // Step 3: Handle simple replacement {key} (existing functionality)
  result = result.replace(/\{([a-zA-Z0-9_]+)\}/g, (match, key) => {
    const value = data[key];
    // If value is undefined, check options to decide whether to keep placeholder or return "N/A"
    if (value === undefined) {
      return options.keepUndefined ? match : "N/A";
    }
    return autoFormatSimpleValue(value);
  });

  return result;
};

/**
 * Filters a glossary data object by excluding entries that contain any items from a specified exclude list.
 *
 * @param {Object} glossaryData - The glossary data to be filtered. This should be an object where each key is a unique identifier
 *                                and each value is an object representing a glossary entry. Each glossary entry object should have
 *                                an `exclude` property, which is an array of items to be checked against the exclude list.
 * @param {string|Array<string>} excludeList - A string or an array of strings representing items to be excluded. If any item in the
 *                                             `exclude` array of a glossary entry matches an item in this list, that glossary entry
 *                                             will be excluded from the result.
 * @returns {Object} - A new object containing only the glossary entries that do not have any items in their `exclude` array
 *                     matching any item in the exclude list.
 *
 * @example
 * const glossaryData = {
 *   term1: { definition: "Definition 1", exclude: ["item1", "item2"] },
 *   term2: { definition: "Definition 2", exclude: ["item3"] },
 *   term3: { definition: "Definition 3", exclude: [] }
 * };
 * const excludeList = ["item1", "item3"];
 * const result = filterGlossaryData(glossaryData, excludeList);
 * // result will be:
 * // {
 * //   term3: { definition: "Definition 3", exclude: [] }
 * // }
 *
 * @example
 * const glossaryData = {
 *   term1: { definition: "Definition 1", exclude: ["item1", "item2"] },
 *   term2: { definition: "Definition 2", exclude: ["item3"] },
 *   term3: { definition: "Definition 3", exclude: [] }
 * };
 * const excludeList = "item1";
 * const result = filterGlossaryData(glossaryData, excludeList);
 * // result will be:
 * // {
 * //   term2: { definition: "Definition 2", exclude: ["item3"] },
 * //   term3: { definition: "Definition 3", exclude: [] }
 * // }
 */
export function filterGlossaryData(glossaryData, excludeList) {
  const filteredGlossaryData = {};
  const excludeArray = Array.isArray(excludeList) ? excludeList : [excludeList];

  for (const key in glossaryData) {
    if (glossaryData.hasOwnProperty(key)) {
      const entry = glossaryData[key];
      const entryExcludeArray = Array.isArray(entry.exclude)
        ? entry.exclude
        : [];

      if (
        !entryExcludeArray.some((excludeItem) =>
          excludeArray.includes(excludeItem)
        )
      ) {
        filteredGlossaryData[key] = entry;
      }
    }
  }

  return filteredGlossaryData;
}

/**
 * Checks if a specified paramName in the filters array has forceRequired set to true.
 *
 * @param {Array} filters - The array of filter objects to search through.
 * @param {string} targetParamName - The paramName to search for in the filters array.
 * @returns {boolean} - Returns true if the specified paramName is found and forceRequired is true, otherwise returns false.
 */
export function isParamNameForceRequired(filters, targetParamName) {
  const filter = filters.find((f) => filterHasParam(f, targetParamName));
  return filter ? filter.forceRequired === true : false;
}

/**
 * Build a params map for a given parameter location ("query" or "path") from OpenAPI parameter definitions.
 *
 * - Path params are set required by default (per OpenAPI spec), but we still honor 'required' and
 *   any "force required" logic from filters.
 * - Query params use the schema's 'required' flag, optionally overridden by your filter rules.
 * - Default values from the parameter schema are used when present; otherwise null.
 *
 * @param {Array<Object>} parameters - Array of OpenAPI parameter definitions.
 * @param {"query"|"path"} location - The parameter location to extract.
 * @param {Object} filters - Page filters (used by isParamNameForceRequired to optionally force required).
 * @returns {Object<string, {value:any, required:boolean}>} - A params map suitable for your visualisation state.
 */
export function buildParamsMap(parameters, location, filters) {
  const map = {};
  parameters.forEach((param) => {
    if (param.in !== location) return;

    const forcedRequired = isParamNameForceRequired(filters, param.name);
    // Per OpenAPI, path params must be required; we keep that behavior but still allow explicit config.
    const required =
      location === "path" ? true : Boolean(param.required || forcedRequired);

    const defaultValue = param?.schema?.default ?? null;

    map[param.name] = {
      value: defaultValue,
      required,
    };
  });
  return map;
}


/**
 * Build a deterministic, stable filter id based on the filter definition.
 * The id is derived from meaningful fields that should be stable across renders:
 * - paramName
 * - filterName
 * - type
 * - visualisations (joined)
 *
 * If collisions occur (e.g., multiple filters produce the same base id), a
 * numeric suffix is appended in a deterministic order.
 *
 * @param {Object} filter - The filter configuration object from pageContext.config.filters.
 * @param {Set<string>} usedIds - A set of ids already produced for this initialisation; mutated by the function.
 * @returns {string} Deterministic and unique id for the filter.
 */
export const buildDeterministicFilterId = (filter, usedIds) => {
  const slugify = (value) =>
    String(value)
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/gi, "-")
      .replace(/^-+|-+$/g, "");

  const baseParts = [
    filter.paramName || "",
    filter.filterName || "",
    filter.type || "",
    Array.isArray(filter.visualisations) ? filter.visualisations.join("|") : "",
  ].filter(Boolean);

  // If everything is empty, default to 'filter'
  const base =
    baseParts
      .map(slugify)
      .filter(Boolean)
      .join("__") || "filter";

  let id = base;
  let i = 1;

  // Ensure uniqueness while maintaining determinism for given config order
  while (usedIds.has(id)) {
    i += 1;
    id = `${base}--${i}`;
  }

  usedIds.add(id);
  return id;
};

// Function to detect if the OS is Windows 10 or lower
export function isWindows10OrLower() {
  const { userAgent } = navigator;
  const windowsVersionMatch = userAgent.match(/Windows NT (\d+\.\d+)/);
  if (windowsVersionMatch) {
    const version = parseFloat(windowsVersionMatch[1]);
    // Windows NT versions: 10.0 (Windows 10), 6.3 (Windows 8.1), 6.2 (Windows 8), etc.
    // Windows 10 is version 10.0, so include it and any lower versions
    return version <= 10.0;
  }
  return false;
}

export const getScrollbarWidth = (scrollbarWidthProp) => {
  // Create a temporary div container
  const outer = document.createElement("div");
  outer.style.visibility = "hidden";
  outer.style.scrollbarWidth = scrollbarWidthProp;
  outer.style.overflow = "scroll"; // Force scrollbars
  outer.style.msOverflowStyle = "scrollbar"; // Needed for WinJS apps
  document.body.appendChild(outer);

  // Create a temporary inner div
  const inner = document.createElement("div");
  outer.appendChild(inner);

  // Calculate the scrollbar width
  const scrollbarWidth = outer.offsetWidth - inner.offsetWidth;

  // Clean up
  outer.parentNode.removeChild(outer);

  return scrollbarWidth;
};

/**
 * Apply one or multiple "where" conditions to a dataset (array of row objects).
 *
 * Supports the following operators:
 *   - 'in': rowValue must be included in values (array or scalar)
 *   - 'notIn': rowValue must NOT be included in values (array or scalar)
 *   - 'equals': rowValue === value
 *   - 'notEquals': rowValue !== value
 *   - 'isNull': rowValue == null (matches null or undefined)
 *   - 'notNull': rowValue != null (excludes null and undefined)
 *
 * @param {Array<Object>} rows - The input dataset rows.
 * @param {Object|Array<Object>} where - A single condition or an array of conditions.
 * @returns {Array<Object>} - Rows that pass all conditions.
 *
 * Condition shape:
 *   {
 *     column: string,
 *     values?: any | any[], // not required for isNull/notNull
 *     operator?: 'in' | 'notIn' | 'equals' | 'notEquals' | 'isNull' | 'notNull'
 *   }
 */
export const applyWhereConditions = (rows, where) => {
  const conditions = Array.isArray(where) ? where : [where];

  return rows.filter((row) => {
    // AND all conditions
    return conditions.every((cond) => {
      if (!cond || !cond.column) return true; // ignore malformed condition

      const operator = cond.operator || "in";
      const rowValue = row[cond.column];

      // Normalize condition values to an array for 'in'/'notIn', and a single value for equality ops
      const rawValues = cond.values;
      const valuesArray = Array.isArray(rawValues) ? rawValues : [rawValues];
      const equalsValue = Array.isArray(rawValues) ? rawValues[0] : rawValues;

      switch (operator) {
        case "equals":
          return rowValue === equalsValue;
        case "notEquals":
          return rowValue !== equalsValue;
        case "notIn":
          return !valuesArray.includes(rowValue);
        case "isNull":
          return rowValue == null;
        case "notNull":
          return rowValue != null;
        case "in":
        default:
          return valuesArray.includes(rowValue);
      }
    });
  });
};
