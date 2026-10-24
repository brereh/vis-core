/**
 * Helpers for the optional time axis, bands and gaps on `line` and
 * `multiple_line` charts. Kept free of React so they can be unit tested
 * on their own.
 */
import { brandTokens, brandThemeDefaults } from "defaults";

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const CLOCK_RE = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/;

/**
 * Returns true when the value is a clock time such as "08:15" or "24:00".
 * @param {*} value
 * @returns {boolean}
 */
export const isClockTime = (value) =>
  typeof value === "string" && CLOCK_RE.test(value.trim());

/**
 * Parses an x value for a time axis into milliseconds.
 * - "HH:mm" / "HH:mm:ss" become an offset from midnight ("24:00" is allowed).
 * - ISO dates and datetimes become epoch milliseconds.
 * - Finite numbers and Date objects are used as they are.
 *
 * @param {string|number|Date} value
 * @returns {number|null} Milliseconds, or null when the value cannot be parsed
 */
export const parseTimeValue = (value) => {
  if (value === null || value === undefined || value === "") return null;
  if (value instanceof Date) {
    const t = value.getTime();
    return Number.isFinite(t) ? t : null;
  }
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const str = String(value).trim();
  const clock = str.match(CLOCK_RE);
  if (clock) {
    const [, h, m, s] = clock;
    return Number(h) * HOUR + Number(m) * MINUTE + Number(s || 0) * 1000;
  }
  const t = Date.parse(str);
  return Number.isFinite(t) ? t : null;
};

/**
 * Parses a tick interval such as "15m", "3h", "1d" or "90min" into
 * milliseconds. Numbers are treated as milliseconds.
 *
 * @param {string|number} interval
 * @returns {number|null}
 */
export const parseTickInterval = (interval) => {
  if (typeof interval === "number") {
    return Number.isFinite(interval) && interval > 0 ? interval : null;
  }
  if (typeof interval !== "string") return null;
  const match = interval
    .trim()
    .toLowerCase()
    .match(/^(\d+(?:\.\d+)?)\s*(s|sec|m|min|h|hr|d|day)s?$/);
  if (!match) return null;
  const n = Number(match[1]);
  const unit = match[2];
  const factor =
    unit === "s" || unit === "sec"
      ? 1000
      : unit === "m" || unit === "min"
        ? MINUTE
        : unit === "h" || unit === "hr"
          ? HOUR
          : DAY;
  return n > 0 ? n * factor : null;
};

const pad = (n) => String(n).padStart(2, "0");

/**
 * Formats milliseconds from parseTimeValue using a small token format:
 * YYYY, MM, DD, HH, mm, ss.
 *
 * @param {number} ms - Milliseconds
 * @param {string} [format="HH:mm"]
 * @param {Object} [options]
 * @param {boolean} [options.clock] - Values are offsets from midnight; "24:00" is shown as such
 * @param {boolean} [options.utc] - Read datetime fields in UTC rather than local time
 * @returns {string}
 */
export const formatTimeValue = (ms, format = "HH:mm", { clock = false, utc = false } = {}) => {
  if (!Number.isFinite(ms)) return "";
  const useUtc = clock || utc;
  const d = new Date(ms);
  let hours = useUtc ? d.getUTCHours() : d.getHours();
  // A clock axis ends at midnight of the next day: show it as 24:00, not 00:00.
  if (clock && ms > 0 && ms % DAY === 0) hours = 24 * (ms / DAY);
  const fields = {
    YYYY: String(useUtc ? d.getUTCFullYear() : d.getFullYear()),
    MM: pad((useUtc ? d.getUTCMonth() : d.getMonth()) + 1),
    DD: pad(useUtc ? d.getUTCDate() : d.getDate()),
    HH: pad(hours),
    mm: pad(useUtc ? d.getUTCMinutes() : d.getMinutes()),
    ss: pad(useUtc ? d.getUTCSeconds() : d.getSeconds()),
  };
  return format.replace(/YYYY|MM|DD|HH|mm|ss/g, (token) => fields[token]);
};

/**
 * Builds tick positions every `intervalMs` between min and max, aligned to
 * midnight (UTC midnight for clock and UTC axes, local midnight otherwise).
 *
 * @param {number} min
 * @param {number} max
 * @param {number} intervalMs
 * @param {Object} [options]
 * @param {boolean} [options.utc] - Align to UTC midnight
 * @param {number} [options.maxTicks=500] - Safety cap on the number of ticks
 * @returns {number[]}
 */
export const buildTimeTicks = (min, max, intervalMs, { utc = true, maxTicks = 500 } = {}) => {
  if (!Number.isFinite(min) || !Number.isFinite(max) || !(intervalMs > 0) || max < min) {
    return [];
  }
  let origin;
  if (utc) {
    origin = Math.floor(min / DAY) * DAY;
  } else {
    const d = new Date(min);
    origin = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  }
  const first = origin + Math.ceil((min - origin) / intervalMs) * intervalMs;
  const ticks = [];
  for (let t = first; t <= max && ticks.length < maxTicks; t += intervalMs) {
    ticks.push(t);
  }
  return ticks;
};

/**
 * Resolves a colour that may be a theme token name ("accent", "primary",
 * "warning", ...) or a brand palette name ("teal", "navy", ...). Anything
 * else (hex, rgb(), var(--...)) is returned unchanged.
 *
 * @param {string} colour
 * @param {Object} [theme] - styled-components theme
 * @returns {string|undefined}
 */
export const resolveColourToken = (colour, theme) => {
  if (!colour || typeof colour !== "string") return colour || undefined;
  const themeColour = theme?.colors?.[colour];
  if (typeof themeColour === "string") return themeColour;
  const defaultColour = brandThemeDefaults.colors[colour];
  if (typeof defaultColour === "string") return defaultColour;
  const paletteColour = brandTokens.palette[colour];
  if (typeof paletteColour === "string") return paletteColour;
  return colour;
};

/** Tones a band may use, mapped to theme colour tokens. */
export const BAND_TONES = ["accent", "muted", "warning"];

/**
 * Returns the fill colour for a band tone. Unknown tones fall back to accent.
 * @param {string} tone
 * @param {Object} [theme]
 * @returns {string}
 */
export const bandToneColour = (tone, theme) =>
  resolveColourToken(BAND_TONES.includes(tone) ? tone : "accent", theme);

/**
 * Normalises `bands` or `gaps` config into ranges positioned on the x axis.
 * On a time axis `from`/`to` are parsed as times; otherwise they are used
 * as category values. Invalid entries are dropped.
 *
 * @param {Array<{from, to, label?, tone?}>} ranges
 * @param {boolean} isTime
 * @returns {Array<{x1, x2, from, to, label, tone}>}
 */
export const normaliseRanges = (ranges, isTime) =>
  (Array.isArray(ranges) ? ranges : [])
    .map((r) => {
      if (!r || r.from === undefined || r.to === undefined) return null;
      const x1 = isTime ? parseTimeValue(r.from) : r.from;
      const x2 = isTime ? parseTimeValue(r.to) : r.to;
      if (x1 === null || x2 === null) return null;
      return { ...r, x1, x2 };
    })
    .filter(Boolean);
