import { useContext, useEffect, useMemo, useState } from "react";
import { PageContext } from "contexts/PageContext";
import { FilterContext } from "contexts/FilterContext";
import { api } from "services";
import { updateFilterValidity, correctInitialCrossFilterValues, correctRuntimeCrossFilterValues } from "utils";
import { applyWhereConditions, sortValues, buildDeterministicFilterId } from "utils";
import { fetchWithCache } from "utils/metadataCache";
import { getFilterParamNames, isMultiParamFilter } from "utils/filterParams";
import { getDateBoundColumns, getDateBoundsFromRows, getDefaultDateRangeValue } from "utils/dateRange";

/**
 * callMetadataEndpoint
 * Executes a GET or POST request using the shared API service for metadata table fetches.
 *
 * Params:
 * - endpoint: { path: string, requestMethod?: 'GET'|'POST', requestOptions?: object, body?: object }
 *
 * Returns:
 * - Promise<any> Parsed response payload
 *
 * Errors:
 * - Propagates API errors to caller for handling (e.g., logging and safe fallbacks).
 */
async function callMetadataEndpoint(endpoint) {
  const method = (endpoint?.requestMethod || "GET").toUpperCase();
  const opts = endpoint?.requestOptions || undefined;
  if (method === "POST") return api.baseService.post(endpoint.path, endpoint.body ?? {}, opts);
  return api.baseService.get(endpoint.path, opts);
}

/**
 * Fetch a metadata table through the shared TTL cache.
 * Delegates to callMetadataEndpoint for the actual network request.
 *
 * @param {Object} endpoint - Endpoint configuration object.
 * @returns {Promise<any>} Parsed response payload (possibly cached).
 */
async function callMetadataEndpointWithCache(endpoint) {
  return fetchWithCache(endpoint, callMetadataEndpoint);
}

/**
 * useMetadataDrivenFilters
 * Canonical filter initialisation pipeline. Handles metadata table fetching, filter option
 * building, FilterContext initialisation, cross-filter correction, and runtime option hiding.
 *
 * Params:
 * - getInitialValue: optional function (filter) => value. Enables injected functions to override 
 *   the default config-driven value resolution. This is particularly useful for using 
 *  `filterPersistence` in map pages. Non-map pages omit this and use the default, though this
 *  can be overridden.
 *
 * Returns:
 * - { filters, filterState, onFilterChange, isReady } — consumed by all page types.
 * - { metadataTables, filtersWithIds, paramNameToUuidMap, emptyTables, emptyMetadataFilters }
 *   — additional data consumed by MapProvider to sync the canonical filter state to mapReducer.
 *
 * Errors:
 * - The hook catches and logs fetch errors and continues with empty tables/filters (resilient UI).
 */
export function useMetadataDrivenFilters({ getInitialValue = null } = {}) {
  const pageContext = useContext(PageContext);
  const { state: filterState, dispatch: filterDispatch } = useContext(FilterContext);

  const [metadataTables, setMetadataTables] = useState({});
  const [filtersWithIds, setFiltersWithIds] = useState([]);
  const [paramNameToUuidMap, setParamNameToUuidMap] = useState({});
  const [emptyTables, setEmptyTables] = useState([]);
  const [emptyMetadataFilters, setEmptyMetadataFilters] = useState([]);
  const [isReady, setIsReady] = useState(false);

  // 1) Fetch metadata tables via API (GET/POST supported).
  //    Reset isReady so MapProvider's sync effect does not fire with stale data during page
  //    navigation; it will only re-fire once this effect completes and effect 3 sets ready again.
  useEffect(() => {
    setIsReady(false);
    let cancelled = false;
    const loadTables = async () => {
      try {
        const tables = {};
        const empty = [];
        for (const table of pageContext.config.metadataTables || []) {
          const response = await callMetadataEndpointWithCache(table);
          let rows = response;
          if (Array.isArray(table.where) && table.where.length > 0) {
            rows = applyWhereConditions(rows, table.where);
          }
          tables[table.name] = rows;
          if (!Array.isArray(rows) || rows.length === 0) empty.push(table.name);
        }
        if (!cancelled) {
          setMetadataTables(tables);
          setEmptyTables(empty);
        }
      } catch (err) {
        console.error("useMetadataDrivenFilters: failed to fetch metadata tables:", err);
        if (!cancelled) {
          setMetadataTables({});
          setEmptyTables([]);
        }
      }
    };
    loadTables();
    return () => { cancelled = true; };
  }, [pageContext]);

  // 2) Build filters with deterministic IDs and options from metadata tables.
  //    Only `metadataTable` sources have their options built here. All other sources
  //    (`local`, `api`, `map`, `slider`, `mapFeatureSelect`, etc.) are treated as
  //    passthroughs — their values are already in the config or resolved externally.
  //
  //    Guard: if there are configured metadata tables but effect 1 hasn't completed yet
  //    (metadataTables is still the initial {}), bail out. Without this, effect 2 would run
  //    with empty tables, produce filters with values.values = [], then effect 3 would fire
  //    setIsReady(true), causing the page to render before real options are available and
  //    crashing Toggle/Checkbox on filter.values.values[0].paramValue.
  useEffect(() => {
    const configuredTableCount = (pageContext.config.metadataTables || []).length;
    if (configuredTableCount > 0 && Object.keys(metadataTables).length === 0) return;

    const used = new Set();
    const uuidMap = {};
    const emptyFilters = [];

    const built = (pageContext.config.filters || []).map((f) => {
      const id = buildDeterministicFilterId(f, used);
      const filter = { ...f, id };
      // Multi-parameter filters (e.g. date ranges) are findable by each parameter name.
      if (isMultiParamFilter(f)) getFilterParamNames(f).forEach((name) => { uuidMap[name] = id; });
      else uuidMap[f.paramName] = id;

      if (filter.type === "dateRange" && filter.values?.source === "metadataTable") {
        // Date ranges take their min/max from the metadata table instead of building options.
        const table = metadataTables[filter.values.metadataTableName] || [];
        const rows = filter.values.where ? applyWhereConditions(table, filter.values.where) : table;
        const { minColumn, maxColumn } = getDateBoundColumns(filter.values);
        const { min, max } = getDateBoundsFromRows(rows, minColumn, maxColumn);
        if (min) filter.min = min;
        if (max) filter.max = max;

        if (!filter.min || !filter.max) {
          emptyFilters.push({
            filterName: filter.filterName,
            paramName: filter.paramName,
            metadataTableName: filter.values.metadataTableName,
          });
        }
      } else if (filter.values?.source === "metadataTable") {
        const table = metadataTables[filter.values.metadataTableName] || [];
        let rows = table;
        if (filter.values.where) rows = applyWhereConditions(table, filter.values.where);

        let options = [];
        rows.forEach((row) => {
          const value = {
            displayValue: row[filter.values.displayColumn],
            paramValue: row[filter.values.paramColumn],
            legendSubtitleText: row[filter.values?.legendSubtitleTextColumn] || null,
            infoOnHover: row[filter.values?.infoOnHoverColumn] ?? null,
            infoBelowOnChange: row[filter.values?.infoBelowOnChangeColumn] ?? null,
            sortValue: filter.values.sortColumn ? row[filter.values.sortColumn] : undefined,
          };
          // Deduplicate on (displayValue, paramValue)
          if (!options.some((o) => o.paramValue === value.paramValue && o.displayValue === value.displayValue)) {
            options.push(value);
          }
        });

        if (filter.values.sort) options = sortValues(options, filter.values.sort);
        if (filter.values.exclude) options = options.filter((o) => !filter.values.exclude.includes(o.paramValue));

        filter.values = { ...filter.values, values: options };

        if (options.length === 0) {
          emptyFilters.push({
            filterName: filter.filterName,
            paramName: filter.paramName,
            metadataTableName: filter.values.metadataTableName,
          });
        }
      }

      return filter;
    });

    setFiltersWithIds(built);
    setParamNameToUuidMap(uuidMap);
    setEmptyMetadataFilters(emptyFilters);
  }, [pageContext, metadataTables]);

  // 3) Initialise defaults into FilterContext (single/multi).
  //    `getInitialValue` (if provided) replaces the default computation — map pages pass
  //    `getInitialFilterValue` to pick up URL-param / persisted-state aware values.
  useEffect(() => {
    const configuredFilterCount = (pageContext.config?.filters || []).length;

    if (configuredFilterCount === 0) {
      filterDispatch({ type: "INITIALIZE_FILTERS", payload: {} });
      setIsReady(true);
      return;
    }

    if (!filtersWithIds.length) return;

    const computeDefault = getInitialValue || ((f) => {
      if (f.type === "dateRange") return getDefaultDateRangeValue(f);
      if (f.shouldBeBlankOnInit) return null;
      if (f.multiSelect && f.shouldInitialSelectAllInMultiSelect) {
        return f.defaultValue ?? f.min ?? (f.values?.values || []).map((v) => v.paramValue);
      }
      return f.defaultValue ?? f.min ?? f.values?.values?.[0]?.paramValue ?? null;
    });

    const initial = {};
    filtersWithIds.forEach((f) => { initial[f.id] = computeDefault(f); });

    // Enforce cross-filter constraints on the initial values before dispatching.
    // Each filter's default is computed independently, so a shouldBeFiltered filter's
    // default may be invalid given the shouldFilterOthers filter's default selection.
    // Correcting here prevents the first fetch from using an invalid combination.
    const correctedInitial = correctInitialCrossFilterValues(filtersWithIds, metadataTables, initial);

    filterDispatch({ type: "INITIALIZE_FILTERS", payload: correctedInitial });

    setIsReady(true);
  }, [filtersWithIds, metadataTables, filterDispatch, getInitialValue, pageContext]);

  // 4) Apply dependency validation/hiding (same routine used in MapLayout).
  const validatedFilters = useMemo(() => {
    if (!isReady) return filtersWithIds;
    const stateLike = { filters: filtersWithIds, metadataTables };
    return updateFilterValidity(stateLike, filterState);
  }, [filtersWithIds, metadataTables, filterState, isReady]);

  // 5) Auto-correct shouldBeFiltered filter values at runtime when a
  //    shouldFilterOthers filter changes and invalidates another filter's selection.
  useEffect(() => {
    if (!isReady) return;
    correctRuntimeCrossFilterValues(validatedFilters, filterState, filterDispatch);
  }, [validatedFilters, filterState, filterDispatch, isReady]);

  /**
   * onFilterChange
   * Dispatches a filter value update into FilterContext.
   *
   * Params:
   * - filter: filter metadata (must include .id)
   * - value: any (array for multi, scalar or null for single)
   *
   * Returns:
   * - void
   */
  const onFilterChange = (filter, value) => {
    filterDispatch({ type: "SET_FILTER_VALUE", payload: { filterId: filter.id, value } });
  };

  return {
    // Consumed by all page types:
    filters: validatedFilters,
    filterState,
    onFilterChange,
    isReady,
    // Consumed by MapProvider to sync the canonical filter state to mapReducer:
    metadataTables,
    filtersWithIds,
    paramNameToUuidMap,
    emptyTables,
    emptyMetadataFilters,
  };
}