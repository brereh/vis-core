import Cookies from "js-cookie";

import { getProdOrDev, getApiBaseDomain, getApiBaseDomainDev } from "../../runtime";

class BaseService {
  /**
   * Creates an instance of BaseService.
   * @constructor
   * @param {Object} [config={ pathPrefix: "" }] - The configuration object.
   * @property {string} config.pathPrefix - The prefix to be added to the path.
   * @property {string} [config.pathPostfix] - The postfix to be added to the path.
   * @property {"csv"|"repeat"} [config.defaultArrayFormat="csv"] - Default query array format.
   */
  constructor(config = { pathPrefix: "" }) {
    const postFix =
    config?.pathPostfix && !String(config.pathPostfix).startsWith(":")
      ? String(config.pathPostfix)
      : "";
    
    this._pathPrefix = config?.pathPrefix ?? "";
    this._postFix = postFix;
    this._defaultArrayFormat =
      config?.defaultArrayFormat === "repeat" ? "repeat" : "csv";
  }

  /**
   * Builds the full URL using the base URL, path prefix, and provided path.
   * @param {string} path - The path to be appended to the base URL.
   * @returns {string} The full URL.
   */
  _buildUrl(path) {
    const mode = (getProdOrDev() || "").toLowerCase();

    let base =
      mode === "production"
        ? (getApiBaseDomain() || "")
        : (getApiBaseDomainDev() || "https://localhost:7127");

    base = base.replace(/\/+$/, ""); // strip trailing slash

    let url = `${base}${this._postFix || ""}`;
    if (this._pathPrefix) url += `/${this._pathPrefix}`;
    url += `/${String(path || "").replace(/^\/+/, "")}`;

    return url;
  }

  /**
   * Public: Builds an absolute URL from either an absolute or relative input.
   * - Absolute URLs (http/https) are returned unchanged.
   * - Relative URLs are prefixed with a leading slash if missing and combined with the API base.
   * @param {string} inputUrl - Absolute or relative URL.
   * @returns {string} Absolute URL that targets the configured API base domain.
   */
  buildAbsoluteUrl(inputUrl) {
    if (typeof inputUrl !== "string" || inputUrl.length === 0) {
      throw new Error("buildAbsoluteUrl: inputUrl must be a non-empty string");
    }
    const isAbsolute = /^https?:\/\//i.test(inputUrl);
    if (isAbsolute) return inputUrl;

    const withSlash = inputUrl.startsWith("/") ? inputUrl : `/${inputUrl}`;
    return this._buildUrl(withSlash);
  }

  /**
   * Builds a URL-encoded query string from a dictionary of query parameters.
   * Arrays default to CSV (comma-separated) unless overridden by options.arrayFormat === "repeat".
   *
   * @param {Record<string, any>} [queryDict={}]
   * @param {{ arrayFormat?: "csv"|"repeat" }} [options]
   * @returns {string} Query string without the leading '?'.
   */
  _buildQueryString(queryDict = {}, options = {}) {
    const arrayFormat =
      options?.arrayFormat === "repeat" ? "repeat" : this._defaultArrayFormat;

    const sp = new URLSearchParams();

    Object.entries(queryDict || {}).forEach(([key, rawVal]) => {
      if (rawVal === undefined || rawVal === null) return;

      if (Array.isArray(rawVal)) {
        if (arrayFormat === "repeat") {
          rawVal.forEach((v) => {
            if (v === undefined || v === null) return;
            sp.append(key, String(v));
          });
        } else {
          const csv = rawVal
            .filter((v) => v !== undefined && v !== null)
            .map((v) => String(v))
            .join(",");
          if (csv.length > 0) sp.set(key, csv);
        }
        return;
      }

      sp.set(key, String(rawVal));
    });

    return sp.toString();
  }

  /**
   * Backwards-compatible alias.
   * NOTE: now URL-encodes and arrays default to CSV.
   *
   * @deprecated Prefer _buildQueryString
   */
  _buildQuery(queryDict = {}) {
    return this._buildQueryString(queryDict);
  }

  /**
   * Applies path parameters to a sub-path by replacing placeholders with provided values.
   * Supports two placeholder styles:
   * - Express style: /resource/:id
   * - RFC style: /resource/{id}
   *
   * Values are URL-encoded. Array values are joined based on arrayStyle.
   *
   * @param {string} subPath - The sub-path that may contain placeholders.
   * @param {Object} [pathParams={}] - A map of placeholder name to value.
   * @param {Object} [opts] - Options controlling replacement behavior.
   * @param {boolean} [opts.allowMissing=false] - If false, throws when a placeholder is missing in pathParams.
   * @param {"comma"|"slash"} [opts.arrayStyle="comma"] - How to join array values in a single placeholder.
   * @returns {string} The sub-path with placeholders replaced.
   * @throws {Error} If a placeholder is missing and allowMissing is false.
   *
   * @example
   * this._applyPathParams("/users/:userId/orders/{orderId}", { userId: 1, orderId: "A/B" })
   * // => "/users/1/orders/A%2FB"
   */
  _applyPathParams(subPath, pathParams = {}, opts = { allowMissing: false, arrayStyle: "comma" }) {
    if (typeof subPath !== "string") {
      throw new Error("_applyPathParams: subPath must be a string");
    }
    const { allowMissing = false, arrayStyle = "comma" } = opts;

    const placeholderRegex = /:([A-Za-z0-9_]+)|\{([A-Za-z0-9_]+)\}/g;

    const replaced = subPath.replace(placeholderRegex, (match, expressName, rfcName) => {
      const name = expressName || rfcName;
      const rawVal = pathParams[name];

      if (rawVal === undefined || rawVal === null) {
        if (allowMissing) {
          // leave placeholder as-is
          return match;
        } else {
          throw new Error(`Missing path param "${name}" for subPath "${subPath}"`);
        }
      }

      // Handle arrays if provided
      if (Array.isArray(rawVal)) {
        const joiner = arrayStyle === "slash" ? "/" : ",";
        return rawVal.map((v) => encodeURIComponent(String(v))).join(joiner);
      }

      // Basic primitives
      return encodeURIComponent(String(rawVal));
    });

    return replaced;
  }

  /**
   * Unwraps common list response shapes into an array.
   * Supports { data }, { results }, { rows }.
   *
   * @param {any} res
   * @returns {any[]}
   */
  unwrapListResponse(res) {
    if (Array.isArray(res)) return res;
    const candidate = res?.data ?? res?.results ?? res?.rows;
    return Array.isArray(candidate) ? candidate : [];
  }

  /**
   * Unwraps common object response shapes into an object/value.
   * Supports { data }, { result }.
   *
   * @param {any} res
   * @returns {any|null}
   */
  unwrapObjectResponse(res) {
    if (res === undefined || res === null) return null;
    return res?.data ?? res?.result ?? res;
  }

  /**
   * Makes a GET request to the specified path with additional options.
   *
   * @param {string} path - The path for the GET request.
   * @param {Object} [addOptions={}] - Additional options for the fetch request.
   * @param {boolean} [skipAuth=false] - Flag to skip adding Authorization header.
   * @returns {Promise<Object>} The response data.
   */
  async _get(path, addOptions = {}, skipAuth = false) {
    const url = this._buildUrl(path);
    const jwtToken = skipAuth ? null : Cookies.get("token");
    const options = {
      method: "GET",
      headers: {
        ...(jwtToken ? { Authorization: `Bearer ${jwtToken}` } : {}),
        ...addOptions.headers,
      },
      ...addOptions,
    };
    const result = await fetch(url, options).catch((error) => {
      if (error.name !== 'AbortError') {
        console.log(error);
      }
      throw error;
    });
    if (!result.ok) {
      throw new Error(`HTTP error! status: ${result.status}`);
    }
    return await result.json();
  }

  /**
   * Makes a GET request to the specified sub-path with path and query parameters.
   *
   * @param {string} [subPath=""] - The sub-path for the GET request.
   * @param {Object} [options={}] - Additional options, including query parameters.
   * @property {Object} [options.queryParams={}] - The query parameters for the GET request.
   * @property {Object} [options.pathParams={}] - Values for path placeholders.
   * @param {boolean} [options.skipAuth=false] - Flag to skip adding Authorization header.
   * @property {{ arrayFormat?: "csv"|"repeat" }} [options.queryOptions] - Array format (repeat or csv)
   * @returns {Promise<Object>} The response data.
   *
   * @example
   * service.get("/locations/{locationId}", {
   *   pathParams: { locationId: 42 },
   *   queryParams: { scenarioId: 123 },
   * });
   * // GET /locations/42?scenarioId=123
   */
  async get(
    subPath = "",
    options = { queryParams: {}, pathParams: {}, skipAuth: false }
  ) {
    const withPathParams = this._applyPathParams(
      subPath,
      options?.pathParams || {}
    );
    const params = this._buildQueryString(options?.queryParams || {}, {
      arrayFormat: options?.queryOptions?.arrayFormat,
    });
    const path = params ? `${withPathParams}?${params}` : withPathParams;
    return await this._get(
      path,
      options.signal ? { signal: options.signal } : {},
      options.skipAuth
    );
  }

  /**
   * Makes a POST request to the specified path with data and additional options.
   *
   * @param {string} path - The path for the POST request.
   * @param {Object} data - The data to be sent in the request body.
   * @param {Object} [addOptions={}] - Additional options for the fetch request.
   * @param {boolean} [skipAuth=false] - Flag to skip adding Authorization header.
   * @returns {Promise<Object>} The response data.
   * @throws {Error} On a non-2xx response, with `status` and, when the body is JSON, `body`.
   */
  async _post(path, data, addOptions = {}, skipAuth = false) {
    const url = this._buildUrl(path);
    const jwtToken = skipAuth ? null : Cookies.get("token"); // Get the JWT token from cookies if skipAuth is false
    const options = {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(jwtToken ? { Authorization: `Bearer ${jwtToken}` } : {}),
        ...addOptions.headers,
      },
      body: JSON.stringify(data),
      ...addOptions,
    };
    const result = await fetch(url, options).catch((error) => {
      if (error.name !== 'AbortError') {
        console.log(error);
      }
      throw error;
    });
    if (!result.ok) {
      const error = new Error(`HTTP error! status: ${result.status}`);
      // Callers that need more than the message (for example a sign-in step) can read these.
      error.status = result.status;
      try {
        error.body = await result.json();
      } catch {
        error.body = undefined;
      }
      throw error;
    }
    return await result.json();
  }

  /**
   * Makes a POST request to the specified path with data, path and query parameters.
   *
   * @param {string} [subPath=""] - The sub-path for the POST request.
   * @param {Object} data - The data to be sent in the request body.
   * @param {Object} [options={}] - Additional options, including query parameters.
   * @property {Object} [options.pathParams={}] - Values for path placeholders.
   * @property {Object} [options.queryParams={}] - The query parameters for the POST request.
   * @property {{ arrayFormat?: "csv"|"repeat" }} [options.queryOptions]
   * @returns {Promise<Object>} The response data.
   * 
   * @example
   * service.post("/locations/{locationId}", payload, {
   *   pathParams: { locationId: 42 },
   *   queryParams: { scenarioId: 123 },
   * });
   * // POST /locations/42?scenarioId=123
   */
  async post(
    subPath = "",
    data,
    options = { queryParams: {}, pathParams: {}, skipAuth: false }
  ) {
    const withPathParams = this._applyPathParams(
      subPath,
      options?.pathParams || {}
    );
    const params = this._buildQueryString(options?.queryParams || {}, {
      arrayFormat: options?.queryOptions?.arrayFormat,
    });
    const path = params ? `${withPathParams}?${params}` : withPathParams;
    return await this._post(path, data, {}, options.skipAuth);
  }

  /**
   * Makes a DELETE request to the specified path.
   *
   * @param {string} path - The path for the DELETE request.
   * @param {Object} [addOptions={}] - Additional fetch options.
   * @param {boolean} [skipAuth=false] - Flag to skip adding Authorization header.
   * @returns {Promise<Object|null>} The response data, or null if no body.
   */
  async _delete(path, addOptions = {}, skipAuth = false) {
    const url = this._buildUrl(path);
    const jwtToken = skipAuth ? null : Cookies.get("token");
    const options = {
      method: "DELETE",
      headers: {
        ...(jwtToken ? { Authorization: `Bearer ${jwtToken}` } : {}),
        ...addOptions.headers,
      },
      ...addOptions,
    };
    const result = await fetch(url, options).catch((error) => console.log(error));
    if (!result.ok) {
      throw new Error(`HTTP error! status: ${result.status}`);
    }
    const text = await result.text();
    return text ? JSON.parse(text) : null;
  }

  /**
   * Makes a DELETE request to the specified sub-path with optional path parameters.
   *
   * @param {string} [subPath=""] - The sub-path for the DELETE request.
   * @param {Object} [options={}] - Additional options.
   * @property {Object} [options.pathParams={}] - Values for path placeholders.
   * @property {boolean} [options.skipAuth=false] - Flag to skip Authorization header.
   * @returns {Promise<Object|null>} The response data, or null if no body.
   */
  async delete(subPath = "", options = { pathParams: {}, skipAuth: false }) {
    const withPathParams = this._applyPathParams(subPath, options?.pathParams || {});
    return await this._delete(withPathParams, {}, options?.skipAuth ?? false);
  }
}

export default BaseService;
