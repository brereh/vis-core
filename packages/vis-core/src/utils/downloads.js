// Helpers shared by the sidebar download section and the per-feature download button.

import { DEFAULT_DOWNLOAD_METADATA_PATH } from "defaults";
import { getUserRoles } from "./auth";

/**
 * Resolves the endpoint used to look up `values.source: 'api'` filter options.
 * Page config wins over app config; both fall back to the TAME default so existing
 * apps behave as before.
 *
 * @param {Object} [pageConfig] - The page config (`pageContext.config`).
 * @param {Object} [appConfig] - The app config (`AppContext` value).
 * @returns {string} The metadata path.
 */
export function getDownloadMetadataPath(pageConfig, appConfig) {
  return (
    pageConfig?.downloadMetadataPath ||
    appConfig?.downloadMetadataPath ||
    DEFAULT_DOWNLOAD_METADATA_PATH
  );
}

/**
 * Replaces `{name}` placeholders in a path with URL-encoded values.
 *
 * @param {string} template - The path, for example `/api/sites/{id}`.
 * @param {Object} [values={}] - Values to substitute, keyed by placeholder name.
 * @returns {{ path: string, missing: Array<string> }} The filled path and any placeholders
 *   that had no value (left in place).
 *
 * @example
 * fillPathTemplate("/api/sites/{id}", { id: 72 }) // => { path: "/api/sites/72", missing: [] }
 */
export function fillPathTemplate(template, values = {}) {
  const missing = [];
  const path = String(template ?? "").replace(/\{([A-Za-z0-9_]+)\}/g, (match, name) => {
    const value = values?.[name];
    if (value === undefined || value === null || value === "") {
      missing.push(name);
      return match;
    }
    return encodeURIComponent(String(value));
  });
  return { path, missing };
}

/**
 * Expands `{app}` in role names to the app name, lower-cased.
 *
 * @param {Array<string>|string} [roles] - Role names, for example `["{app}_admin"]`.
 * @param {string} [appName] - The app name.
 * @returns {Array<string>} The expanded, lower-cased role names.
 */
export function expandRoleTemplates(roles, appName) {
  if (!roles) return [];
  const list = Array.isArray(roles) ? roles : [roles];
  const app = String(appName ?? "").toLowerCase();
  return list
    .filter(Boolean)
    .map((role) => String(role).replace(/\{app\}/gi, app).toLowerCase());
}

/**
 * Whether the current user holds at least one of the given roles. An empty or missing
 * list means no restriction.
 *
 * @param {Array<string>} [roles] - Role names, already expanded.
 * @returns {boolean} True if there is no restriction or the user holds one of the roles.
 */
export function userHasAnyRole(roles) {
  if (!Array.isArray(roles) || roles.length === 0) return true;
  const userRoles = getUserRoles();
  return roles.some((role) => userRoles.includes(String(role).toLowerCase()));
}
