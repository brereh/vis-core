/**
 * Helpers for the `dateRange` filter type.
 *
 * A date range filter value is `[from, to]`, or `[from, to, toggle]` when the filter has an
 * `extraToggle`. Dates are always ISO `YYYY-MM-DD` strings; `locale` only affects display.
 */

const ISO_DATE_PREFIX = /^(\d{4})-(\d{2})-(\d{2})/;

/**
 * Converts a value to an ISO `YYYY-MM-DD` date string.
 * Accepts ISO date or date-time strings (the date part is kept) and Date objects.
 * @param {any} value - The value to convert.
 * @returns {string|null} The ISO date, or null if the value is not a valid date.
 */
export const toIsoDate = (value) => {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    const pad = (n) => String(n).padStart(2, "0");
    return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
  }
  if (typeof value !== "string") return null;

  const match = ISO_DATE_PREFIX.exec(value.trim());
  if (!match) return null;
  const iso = `${match[1]}-${match[2]}-${match[3]}`;
  const parsed = new Date(`${iso}T00:00:00Z`);
  // Rejects dates such as 2025-02-30, which Date would roll over.
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== iso) return null;
  return iso;
};

/**
 * Formats an ISO date for display in the given locale, e.g. `06/10/2025` for `en-GB`.
 * @param {string} isoDate - An ISO `YYYY-MM-DD` date.
 * @param {string} [locale] - A BCP 47 locale; the runtime default when omitted.
 * @returns {string} The formatted date, or the input when it is not a valid date.
 */
export const formatDateForLocale = (isoDate, locale) => {
  const iso = toIsoDate(isoDate);
  if (!iso) return isoDate ?? "";
  try {
    return new Intl.DateTimeFormat(locale, {
      timeZone: "UTC",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(`${iso}T00:00:00Z`));
  } catch {
    return iso;
  }
};

/**
 * Clamps an ISO date to optional ISO bounds. ISO dates compare correctly as strings.
 * @param {string} isoDate - The date to clamp.
 * @param {string|null} [min] - The earliest allowed date.
 * @param {string|null} [max] - The latest allowed date.
 * @returns {string} The clamped date.
 */
export const clampIsoDate = (isoDate, min, max) => {
  if (min && isoDate < min) return min;
  if (max && isoDate > max) return max;
  return isoDate;
};

/**
 * Finds the earliest and latest dates in metadata rows.
 * @param {Object[]} rows - Metadata table rows.
 * @param {string} minColumn - Column read for the earliest date.
 * @param {string} [maxColumn=minColumn] - Column read for the latest date.
 * @returns {{min: string|null, max: string|null}}
 */
export const getDateBoundsFromRows = (rows, minColumn, maxColumn = minColumn) => {
  let min = null;
  let max = null;
  (Array.isArray(rows) ? rows : []).forEach((row) => {
    const low = toIsoDate(row?.[minColumn]);
    const high = toIsoDate(row?.[maxColumn]);
    if (low && (!min || low < min)) min = low;
    if (high && (!max || high > max)) max = high;
  });
  return { min, max };
};

/**
 * Returns the column names a metadata-driven date range reads its bounds from.
 * `minColumn`/`maxColumn` take precedence over a single `column` (or `paramColumn`).
 * @param {Object} values - The filter's `values` block.
 * @returns {{minColumn: string|undefined, maxColumn: string|undefined}}
 */
export const getDateBoundColumns = (values = {}) => {
  const column = values.column ?? values.paramColumn;
  return {
    minColumn: values.minColumn ?? column,
    maxColumn: values.maxColumn ?? column,
  };
};

/**
 * Normalises a date range value: converts both dates to ISO, clamps them to the filter's
 * `min`/`max` and fills a missing extra toggle value from its default.
 * @param {Object} filter - The dateRange filter configuration (with resolved `min`/`max`).
 * @param {any} value - The candidate value.
 * @returns {Array|null} The normalised value, or null when either date is missing or invalid,
 *   or `from` is after `to`.
 */
export const normaliseDateRangeValue = (filter, value) => {
  if (!Array.isArray(value)) return null;
  const min = toIsoDate(filter?.min);
  const max = toIsoDate(filter?.max);
  const from = toIsoDate(value[0]);
  const to = toIsoDate(value[1]);
  if (!from || !to) return null;

  const clampedFrom = clampIsoDate(from, min, max);
  const clampedTo = clampIsoDate(to, min, max);
  if (clampedFrom > clampedTo) return null;

  const normalised = [clampedFrom, clampedTo];
  if (filter?.extraToggle) {
    normalised.push(
      typeof value[2] === "boolean" ? value[2] : Boolean(filter.extraToggle.defaultValue)
    );
  }
  return normalised;
};

/**
 * Resolves a date range filter's default value. `defaultValue` entries may be ISO dates or the
 * keywords `"min"` and `"max"`; it defaults to `["min", "max"]`.
 * @param {Object} filter - The dateRange filter configuration (with resolved `min`/`max`).
 * @returns {Array|null} The default value, or null when it cannot be resolved.
 */
export const getDefaultDateRangeValue = (filter) => {
  const [rawFrom = "min", rawTo = "max"] = Array.isArray(filter?.defaultValue)
    ? filter.defaultValue
    : [];
  const resolve = (raw) => {
    if (raw === "min") return filter?.min;
    if (raw === "max") return filter?.max;
    return raw;
  };
  return normaliseDateRangeValue(filter, [resolve(rawFrom), resolve(rawTo)]);
};
