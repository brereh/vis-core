import { Fragment, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import styled from "styled-components";
import { Dimmer } from "Components/Dimmer";
import { Sidebar } from "Components/Sidebar";
import { DynamicStylingStatus } from "Components/DynamicStylingStatus/DynamicStylingStatus";
import { PageContext } from "contexts/PageContext";
import { AppContext } from "contexts/AppContext";
import { DockedLayoutContext } from "contexts/DockedLayoutContext";
import { ToastProvider } from "contexts/ToastContext";
import { AccordionSection, MapLayerSection } from "Components/Sidebar/Accordion";
import { useMapContext } from "hooks/useMapContext";
import { useFilterContext } from "hooks/useFilterContext";
import { useLayerZoomMessage } from "hooks/useLayerZoomMessage";
import { useDebounced } from "hooks/useDebounced";
import { loremIpsum, updateFilterValidity, getInitialFilterValue } from "utils";
import { defaultBgColour } from "defaults";
import DualMaps from "./DualMaps";
import Map from "./Map";
import { actionTypes } from "reducers";

const LayoutContainer = styled.div`
  display: flex;
  height: calc(100vh - 75px);
  overflow: hidden;
  @media ${props => props.theme.mq.mobile} {
   flex-direction: column;   /* stack Sidebar above Map */
   height: auto;             /* let content dictate height */
   overflow: visible;
  }
`;

const MapContainer = styled.div`
  flex: 1;
  position: relative;
  display: flex;
  overflow: hidden;
  @media ${props => props.theme.mq.mobile} {
   flex: 0 0 auto;
   min-height: 60vh; /* ensure minimum height on mobile */}
`;

const MobileCardsSlot = styled.div`
  display: none;  
  @media ${props => props.theme.mq.mobile} {
    display: block;
    width: 100%;
    }
`;

const MobileLegendSlot = styled.section`
  display: none;

  @media ${props => props.theme.mq.mobile} {
    display: block;
    width: 100%;
    box-sizing: border-box
  }
`;

// Narrower than this, the docked layout falls back to the overlay sidebar and cards.
export const DOCKED_LAYOUT_MIN_WIDTH = 1100;
const DOCKED_LAYOUT_QUERY = `(min-width: ${DOCKED_LAYOUT_MIN_WIDTH}px)`;
const DEFAULT_DOCKED_PROMPT = "Click a feature on the map to see its summary";

/**
 * Tracks whether the viewport is wide enough for the docked layout.
 * Assumes a wide viewport when matchMedia is unavailable.
 *
 * @param {boolean} enabled - Whether the page asked for the docked layout.
 * @returns {boolean} True when the docked layout should render.
 */
const useDockedLayout = (enabled) => {
  const getMatches = () =>
    typeof window === "undefined" || typeof window.matchMedia !== "function"
      ? true
      : window.matchMedia(DOCKED_LAYOUT_QUERY).matches;
  const [isWide, setIsWide] = useState(getMatches);

  useEffect(() => {
    if (!enabled || typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return undefined;
    }
    const mql = window.matchMedia(DOCKED_LAYOUT_QUERY);
    const onChange = () => setIsWide(mql.matches);
    onChange();
    mql.addEventListener?.("change", onChange);
    return () => mql.removeEventListener?.("change", onChange);
  }, [enabled]);

  return enabled && isWide;
};

const DockedFiltersColumn = styled.aside`
  flex: 0 0 420px;
  height: 100%;
  overflow: hidden;
`;

const DockedFeatureColumn = styled.aside`
  flex: 0 0 460px;
  height: 100%;
  padding: 16px;
  box-sizing: border-box;
  overflow-y: auto;
  overflow-x: hidden;
  background-color: var(--palette-white);
  border-left: 1px solid var(--palette-mid-grey);
`;

const DockedPrompt = styled.p`
  margin: 0;
  color: var(--palette-grey);
  font-size: 0.9rem;
`;

const VisuallyHidden = styled.div`
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  padding: 0;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
`;

/**
 * MapLayout component is the main layout component that composes the Map,
 * Sidebar, and MapLayerSection components. It serves as the container for
 * the map visualisation and its associated controls.
 * The component uses the MapContext to manage the state of the map and its
 * layers, and it provides the necessary props to the Sidebar and MapLayerSection
 * components.
 *
 * Docked layout (opt-in): set `config.layout: "docked"` on the page, or
 * `defaultMapLayout: "docked"` on the app config, to show the filters and the
 * selected feature's callout cards as fixed columns either side of the map.
 * See docs/Docked Map Layout.md.
 *
 * @component
 * @returns {JSX.Element} The rendered MapLayout component.
 */
export const MapLayout = () => {
  const { state, dispatch } = useMapContext();
  const { state: filterState, dispatch: filterDispatch } = useFilterContext();
  const isDynamicStylingLoading = state.isDynamicStylingLoading;
  const pageContext = useContext(PageContext);
  const initializedRef = useRef(false);
  const pageRef = useRef(pageContext);
  const layerZoomMessage = useLayerZoomMessage();
  const [sidebarIsOpen, setSidebarIsOpen] = useState(true);

  const appContext = useContext(AppContext);
  const requestedLayout = pageContext.config?.layout ?? appContext?.defaultMapLayout;
  // Fullscreen callout cards position themselves over the whole map, so they
  // can't live in the docked column: such pages keep the overlay layout.
  const hasFullscreenCard = Object.values(state.visualisations ?? {}).some(
    (visualisation) =>
      visualisation?.type === "calloutCard" && visualisation.cardType === "fullscreen"
  );
  const isDocked = useDockedLayout(
    requestedLayout === "docked" && pageContext.type === "MapLayout" && !hasFullscreenCard
  );
  const [calloutSlot, setCalloutSlot] = useState(null);
  const [selection, setSelection] = useState({ hasSelection: false, announcement: "" });
  const dockedContextValue = useMemo(
    () => (isDocked ? { calloutSlot, setSelection } : null),
    [isDocked, calloutSlot]
  );

  // Domain-agnostic extension point: pages can supply extra sidebar sections via
  // config.additionalMapLayoutAccordionSections so apps can inject bespoke controls without
  // vis-core knowing anything about them. Each descriptor is rendered inside its own
  // AccordionSection by default; set `accordion: false` to render the content bare (no
  // collapsible header). Shape: { component, props?, title?, defaultValue?, accordion? }.
  const additionalAccordionSections =
    pageContext.config?.additionalMapLayoutAccordionSections ?? [];

  // Debounced copy of filterState used to gate map-action dispatches (UPDATE_PARAMETERISED_LAYER,
  // UPDATE_COLOR_SCHEME, etc.) so repaints and data fetches fire together rather than
  // immediately on each selector interaction. Selector UI still updates from the live filterState.
  const debouncedFilterState = useDebounced(filterState, 400);

  const isFiltersDebouncing = debouncedFilterState !== filterState;
  
  // We keep the dimmer on if filters are debouncing.
  // We also use a small 50ms buffer state for transitioning out of loading, 
  // to prevent a 1-frame micro-gap flash between the debounce resolving and 
  // the visualisations registering their loading state.
  const [isTransitioning, setIsTransitioning] = useState(false);
  const isCurrentlyLoading = state.isLoading || state.visualisationLoadingCount > 0 || isFiltersDebouncing;
  
  useEffect(() => {
    if (isCurrentlyLoading) {
      setIsTransitioning(true);
    } else {
      const timer = setTimeout(() => setIsTransitioning(false), 50);
      return () => clearTimeout(timer);
    }
  }, [isCurrentlyLoading]);

  const isLoading = isCurrentlyLoading || isTransitioning;

  useEffect(() => {
    if (!initializedRef.current && state.pageIsReady) {
      state.filters.forEach((filter) => {
        filter.actions.forEach((actionObj) => {
          // Use getInitialFilterValue to get persisted state or default value
          let defaultValue = getInitialFilterValue(filter);

          let sides = "";
          if (filter.filterName.includes("Left")) sides = "left";
          else if (filter.filterName.includes("Right")) sides = "right";
          else sides = "both";
          dispatch({
            type: actionObj.action,
            payload: { filter, value: defaultValue, sides: sides, ...actionObj.payload },
          });
        });
      });
      initializedRef.current = true;
    }
  }, [dispatch, state.pageIsReady, state.filters, state.visualisations]);

  useEffect(() => {
    if (pageRef.current !== pageContext) {
      initializedRef.current = false;
      pageRef.current = pageContext;
      filterDispatch({ type: "RESET_FILTERS" });
    }
  }, [pageContext, filterDispatch]);

  const handleFilterChange = useCallback((filter, value) => {
    filterDispatch({
      type: 'SET_FILTER_VALUE',
      payload: { filterId: filter.id, value, filter },
    });
  }, [filterDispatch]);

  /**
   * Retrieves the full option objects corresponding to a filter's selected value(s).
   *
   * @param {Object} filter - The filter configuration object, containing a `values` property with an array of options.
   * @param {any|any[]} value - The currently selected value (scalar for single-select) or array of values (for multi-select).
   * @returns {Object[]} An array of matching option objects from the filter's configuration. Returns an empty array if no matches are found or if the filter lacks options.
   */
  const getSelectedFilterOptions = useCallback((filter, value) => {
    const values = filter.values?.values;
    if (!Array.isArray(values)) return [];

    if (Array.isArray(value)) {
      const selected = new Set(value);
      return values.filter((item) => selected.has(item.paramValue));
    }

    const selected = values.find((item) => item.paramValue === value);
    return selected ? [selected] : [];
  }, []);

  /**
   * Constructs the payload for dispatching map reducer actions triggered by filter changes.
   *
   * @param {Object} filter - The filter configuration object triggering the action.
   * @param {Object} action - The action definition, including its base `payload` and action type (e.g., `UPDATE_COLOR_SCHEME`).
   * @param {any|any[]} value - The currently selected value(s) for the filter.
   * @param {string[]} [sides] - Optional list of panel sides the action applies to, used in dual-map layouts.
   * @returns {Object} The enriched payload containing the filter, selected value(s), original action payload parameters, and potentially resolved colour schemes.
   */
  const buildFilterActionPayload = useCallback((filter, action, value, sides) => {
    const selectedOptions = getSelectedFilterOptions(filter, value);
    const payload = { filter, value, ...action.payload };

    if (sides) payload.sides = sides;

    if (action.action === "UPDATE_COLOR_SCHEME") {
      const colourValue = selectedOptions.find((option) => option.colourValue)?.colourValue;
      if (colourValue) payload.color_scheme = colourValue;
    }

    return payload;
  }, [getSelectedFilterOptions]);

  /**
   * Effect A (immediate): keep derived filters in sync with their source selection and metadata.
   * Fires on every filterState change so the UI responds without waiting for the debounce.
   * For every filter that declares `deriveFromFilter`, we:
   * - read the current value of its source filter (`sourceParamName`)
   * - optionally apply override rules driven by other controller filters
   * - otherwise look up a preferred/fallback value from the source metadata (`metadataColumn`)
   * - sync the derived filter to the resolved value, or clear it if no match
   */
  useEffect(() => {
    const derivedFilters = state.filters.filter((filter) => filter.deriveFromFilter);

    for (const derivedFilter of derivedFilters) {
      const {
        sourceParamName,
        metadataColumn,
        preferredValues = [],
      } = derivedFilter.deriveFromFilter ?? {};

      if (!sourceParamName) {
        continue;
      }

      const sourceFilter = state.filters.find((f) => f.paramName === sourceParamName);
      if (!sourceFilter) {
        continue;
      }

      const selectedSourceValue = filterState[sourceFilter.id];
      const sourceMetadataName = sourceFilter.values?.metadataTableName;
      const sourceMetadata = sourceMetadataName ? state.metadataTables[sourceMetadataName] : null;

      let derivedValue = null;

      if (Array.isArray(derivedFilter.overrideRules)) {
        for (const rule of derivedFilter.overrideRules) {
          const controllerFilter = state.filters.find(
            (f) => f.paramName === rule.controllerParamName
          );
          if (!controllerFilter) continue;

          const controllerValue =
            filterState[controllerFilter.id] ?? controllerFilter.defaultValue ?? null;

          if (controllerValue === rule.controllerValue) {
            derivedValue = rule.derivedValue;
            break;
          }
        }
      }

      if (
        derivedValue == null &&
        selectedSourceValue != null &&
        metadataColumn &&
        Array.isArray(sourceMetadata)
      ) {
        const matchingRows = sourceMetadata.filter(
          (row) => row?.[sourceFilter.values.paramColumn] === selectedSourceValue
        );

        if (matchingRows.length > 0) {
          let preferredRow = null;
          if (preferredValues.length > 0) {
            preferredRow = preferredValues
              .map((value) => matchingRows.find((row) => row?.[metadataColumn] === value))
              .find((row) => row);
          }

          const fallbackRow = preferredRow ?? matchingRows[0];
          derivedValue = fallbackRow?.[metadataColumn] ?? null;
        }
      }

      const currentDerivedValue = filterState[derivedFilter.id];

      if (
        derivedValue !== null &&
        derivedValue !== currentDerivedValue
      ) {
        filterDispatch({
          type: "SET_FILTER_VALUE",
          payload: { filterId: derivedFilter.id, value: derivedValue },
        });
        return;
      }

      if (
        derivedValue === null &&
        currentDerivedValue != null
      ) {
        filterDispatch({
          type: "SET_FILTER_VALUE",
          payload: { filterId: derivedFilter.id, value: null },
        });
        return;
      }
    }
  }, [filterState, state.metadataTables, state.filters, filterDispatch]);

  /**
   * Effect B1 - immediate cross-filter validation.
   *
   * Keeps metadata-driven filter option visibility in sync with the live FilterContext state.
   * This must run immediately, not against the debounced filter state, because dependent
   * filters such as `shouldBeFiltered` dropdowns need their visible options updated as soon
   * as a controlling `shouldFilterOthers` filter changes.
   *
   * Example:
   * - Main filter has `shouldFilterOthers: true`.
   * - Sub-filter has `shouldBeFiltered: true`.
   * - When main filter changes, sub-filter options are narrowed immediately using
   *   `updateFilterValidity`.
   *
   * This effect only updates the MapContext filter definitions/options. It does not dispatch
   * expensive map or API actions. Those are handled separately by the debounced action effect.
   *
   * Keeping this separate prevents feedback loops where stale debounced state re-validates
   * filters against an old controller value and causes dependent dropdowns to oscillate.
   */
  useEffect(() => {
    const validatedFilters = updateFilterValidity(state, filterState);

    if (JSON.stringify(validatedFilters) !== JSON.stringify(state.filters)) {
      dispatch({
        type: "UPDATE_FILTER_VALUES",
        payload: { updatedFilters: validatedFilters },
      });
    }
  }, [filterState, state.metadataTables, state.filters, dispatch]);

  /**
   * Effect B2 - debounced map action dispatch.
   *
   * Dispatches filter-driven map actions after the filter state has settled for the debounce
   * window. This gates expensive downstream work such as parameterised layer updates, query
   * param updates, colour scheme changes, data fetches, and map repaints.
   *
   * Important:
   * - This effect must not perform cross-filter validation.
   * - Validation uses the live `filterState` in the immediate validation effect.
   * - This effect uses `debouncedFilterState` only to delay expensive visualisation actions.
   *
   * Splitting validation and action dispatch avoids stale-state feedback loops:
   * the UI updates dependent dropdown options immediately, while map/API work waits until
   * the user has stopped changing filters.
   */
  useEffect(() => {
    if (isFiltersDebouncing) return;

    state.filters.forEach((filter) => {
      const filterValue = debouncedFilterState[filter.id];

      if (!filter.visualisations?.[0]?.includes("Side")) {
        filter.actions.forEach((action) => {
          dispatch({
            type: action.action,
            payload: buildFilterActionPayload(filter, action, filterValue),
          });
        });
      } else {
        filter.actions.forEach((action) => {
          let sides = "";

          if (filter.filterName.includes("Left")) sides = "left";
          else if (filter.filterName.includes("Right")) sides = "right";
          else sides = "both";

          dispatch({
            type: action.action,
            payload: buildFilterActionPayload(filter, action, filterValue, sides),
          });
        });
      }
    });
  }, [debouncedFilterState, state.filters, dispatch, buildFilterActionPayload, isFiltersDebouncing]);

  const handleColorChange = (color, layerName) => {
    dispatch({
      type: actionTypes.UPDATE_COLOR_SCHEME,
      payload: { layerName: layerName, color_scheme: color },
    });
  };  

  const handleClassificationChange = (classType, layerName) => {
    dispatch({
      type: "UPDATE_CLASSIFICATION_METHOD",
      payload: { class_method: classType, layerName },
    });
  };

  const handleCustomBandsChange = (customBands, layerName) => {
    dispatch({
      type: "UPDATE_CUSTOM_BANDS",
      payload: { customBands, layerName },
    });
  };

  const loadingHeading = state.visualisationLoadingCount > 0
    ? "Loading map layers"
    : "Preparing your map";
  const loadingMessages = [
    "Fetching the latest visualisation data...",
    "Almost there, thanks for waiting.",
    "Applying colours and map styling...",
  ];

  const sidebarElement = (
    <Sidebar
        pageName={pageContext.pageName}
        aboutVisualisationText={pageContext.about ?? loremIpsum}
        filters={state.filters}
        legalText={pageContext.legalText ?? loremIpsum}
        onFilterChange={handleFilterChange}
        bgColor={pageContext.navbarLinkBgColour || defaultBgColour}
        additionalFeatures={pageContext.config.additionalFeatures}
        infoBoxText={layerZoomMessage}
        downloadPath={pageContext.config.downloadPath}
        downloadShapefilePath={pageContext.config.downloadShapefilePath}
        requestMethod={pageContext.config.requestMethod}
        setIsOpen={setSidebarIsOpen}
        docked={isDocked}
        description={isDocked ? pageContext.description : undefined}
      >
        <MapLayerSection
          handleColorChange={handleColorChange}
          handleClassificationChange={handleClassificationChange}
          handleCustomBandsChange={handleCustomBandsChange}
        />
        {additionalAccordionSections.map((section, index) => {
          const SectionComponent = section.component;
          const content = SectionComponent
            ? <SectionComponent {...(section.props ?? {})} />
            : section.content;
          const key = section.title ?? index;
          // Opt out of the collapsible wrapper to render the content on its own.
          if (section.accordion === false) {
            return <Fragment key={key}>{content}</Fragment>;
          }
          return (
            <AccordionSection
              key={key}
              title={section.title}
              defaultValue={section.defaultValue}
            >
              {content}
            </AccordionSection>
          );
        })}
      </Sidebar>
  );

  return (
    <ToastProvider>
      <DockedLayoutContext.Provider value={dockedContextValue}>
      <LayoutContainer>
      <Dimmer
        dimmed={isLoading}
        showLoader={true}
        statusHeading={loadingHeading}
        statusMessages={loadingMessages}
      />
      <DynamicStylingStatus isResolving={isDynamicStylingLoading} />
      {isDocked ? (
        <DockedFiltersColumn aria-label="Filters">{sidebarElement}</DockedFiltersColumn>
      ) : (
        sidebarElement
      )}

      {pageContext.type === "MapLayout" && (
        <MapContainer>
          <Map extraCopyrightText={pageContext.extraCopyrightText ?? ""} sidebarIsOpen={sidebarIsOpen} showMapStyleToggle={false} resizeWithContainer={isDocked}/>
        </MapContainer>
      )}
      {isDocked && (
        <DockedFeatureColumn aria-label="Selected feature">
          <VisuallyHidden aria-live="polite" role="status">
            {selection.announcement}
          </VisuallyHidden>
          {!selection.hasSelection && (
            <DockedPrompt>{pageContext.config?.dockedPrompt ?? DEFAULT_DOCKED_PROMPT}</DockedPrompt>
          )}
          <div ref={setCalloutSlot} data-testid="docked-callout-slot" />
        </DockedFeatureColumn>
      )}
      {pageContext.type === "DualMapLayout" && (
        <MapContainer>
          <DualMaps extraCopyrightText={pageContext.extraCopyrightText ?? "" } showMapStyleToggle={false}/>
        </MapContainer>
      )}

      {/* Mobile-only: where summary cards will be portaled into */}
      <MobileCardsSlot id="mobile-cards-slot" className="mobile-cards-slot"/>
      
        <MobileLegendSlot id="mobile-legend-slot" aria-label="Legend" />
      </LayoutContainer>
      </DockedLayoutContext.Provider>
    </ToastProvider>
  );
};
