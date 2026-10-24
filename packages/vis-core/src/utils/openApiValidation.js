import { extractParamsWithValuesSeparated, getGetParameters } from "./apiParams";
import { buildParamsMap } from "./config";
import { getFilterParamNames } from "./filterParams";

const DEFAULT_EXCLUDED_PARAMS = ["x", "y", "z"]; // tile placeholders

const normaliseFiltersToParamNameSet = (filters = []) => {
  const set = new Set();
  if (!Array.isArray(filters)) return set;
  for (const filter of filters) {
    // Multi-parameter filters (e.g. date ranges) cover every parameter they set.
    getFilterParamNames(filter).forEach((paramName) => set.add(paramName));
  }
  return set;
};

const normalisePages = (appConfig) => {
  const pages = appConfig?.appPages;
  if (!pages) return [];
  return Array.isArray(pages) ? pages : [];
};

const isRoutePresentInSchema = (apiSchema, apiRoute) => {
  return Boolean(apiSchema?.paths && Object.prototype.hasOwnProperty.call(apiSchema.paths, apiRoute));
};

const getEffectiveParamsMaps = (apiSchema, apiRoute, filters) => {
  const apiParameters = getGetParameters(apiSchema, apiRoute);
  const queryParams = buildParamsMap(apiParameters, "query", filters);
  const pathParams = buildParamsMap(apiParameters, "path", filters);

  // Mirror MapContext behavior: if schema has no required params, treat all as required.
  const hasRequired = apiParameters.some((p) => Boolean(p?.required));
  if (!hasRequired) {
    Object.keys(queryParams).forEach((k) => {
      queryParams[k].required = true;
    });
    Object.keys(pathParams).forEach((k) => {
      pathParams[k].required = true;
    });
  }

  return { apiParameters, queryParams, pathParams };
};

/**
 * Validate that each page config has filters that cover required OpenAPI params.
 *
 * This is intended as a lightweight, always-on developer aid. It performs no
 * network calls and only runs against an already-fetched OpenAPI/Swagger schema.
 *
 * What it checks (for each page):
 * - Every visualisation `dataPath` exists in the schema (warning if missing).
 * - Every required query/path param (as interpreted by MapContext) is either:
 *   - provided by a filter `paramName`, OR
 *   - has a schema default, OR
 *   - is hard-coded in the URL (e.g. `?dataset_id=...`), OR
 *   - is one of the excluded params (default: x/y/z).
 *
 * @param {Object} appConfig - The app config object (typically AppContext value).
 * @param {Object} apiSchema - OpenAPI schema.
 * @param {Object} [options]
 * @param {string[]} [options.excludedParams] - Params to ignore.
 * @returns {{errors: Array, warnings: Array}} Validation results.
 */
export function validateAppConfigAgainstOpenApi(appConfig, apiSchema, options = {}) {
  const excludedParams = Array.isArray(options.excludedParams)
    ? options.excludedParams
    : DEFAULT_EXCLUDED_PARAMS;

  const errors = [];
  const warnings = [];

  const pages = normalisePages(appConfig);
  if (!pages.length) return { errors, warnings };

  for (const page of pages) {
    const pageName = page?.pageName || page?.name || page?.id || "(unknown page)";
    const pageConfig = page?.config;

    const pageFilters = pageConfig?.filters || [];
    const downloadFilters = pageConfig?.additionalFeatures?.download?.filters || [];
    const paramNameSet = new Set([
      ...normaliseFiltersToParamNameSet(pageFilters),
      ...normaliseFiltersToParamNameSet(downloadFilters),
    ]);

    const endpoints = [];
    const visualisations = pageConfig?.visualisations;
    if (Array.isArray(visualisations)) {
      for (const vis of visualisations) {
        if (typeof vis?.dataPath === "string" && vis.dataPath.trim()) {
          endpoints.push({ kind: "visualisation", name: vis?.name, route: vis.dataPath });
        }
      }
    }

    const downloadPath = pageConfig?.additionalFeatures?.download?.downloadPath;
    if (typeof downloadPath === "string" && downloadPath.trim()) {
      endpoints.push({ kind: "download", name: "download", route: downloadPath });
    }

    for (const endpoint of endpoints) {
      const apiRoute = endpoint.route;

      if (!isRoutePresentInSchema(apiSchema, apiRoute)) {
        warnings.push({
          type: "missing_schema_path",
          pageName,
          kind: endpoint.kind,
          endpointName: endpoint.name,
          route: apiRoute,
          message: `Route not found in OpenAPI schema: ${apiRoute}`,
        });
        // If the route isn't in the schema, we cannot validate required params.
        continue;
      }

      const { queryParams, pathParams } = getEffectiveParamsMaps(apiSchema, apiRoute, pageFilters);

      const { pathParams: specifiedPathParams, queryParams: specifiedQueryParams } =
        extractParamsWithValuesSeparated(apiRoute);

      const validateMap = (paramsMap, location, specifiedMap) => {
        for (const [paramName, def] of Object.entries(paramsMap || {})) {
          if (!def?.required) continue;
          if (excludedParams.includes(paramName)) continue;

          const hasSchemaDefault = def.value !== null && def.value !== undefined;
          const isHardCodedInUrl = Object.prototype.hasOwnProperty.call(specifiedMap, paramName) &&
            specifiedMap[paramName] !== undefined &&
            specifiedMap[paramName] !== "";
          const isProvidedByFilter = paramNameSet.has(paramName);

          if (hasSchemaDefault || isHardCodedInUrl || isProvidedByFilter) continue;

          errors.push({
            type: "missing_paramName",
            pageName,
            kind: endpoint.kind,
            endpointName: endpoint.name,
            route: apiRoute,
            location,
            paramName,
            message: `Missing filter paramName '${paramName}' for required ${location} param on ${apiRoute}`,
          });
        }
      };

      validateMap(pathParams, "path", specifiedPathParams);
      validateMap(queryParams, "query", specifiedQueryParams);
    }
  }

  return { errors, warnings };
}
