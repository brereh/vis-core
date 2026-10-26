import React, { useMemo, useEffect, useState, useRef } from 'react';
import Select from 'react-select';
import makeAnimated from 'react-select/animated';
import styled, { useTheme } from 'styled-components';
import { ChevronRightIcon } from '@heroicons/react/20/solid';
import { useFilterContext } from "hooks/useFilterContext";
import { SelectorLabel } from './SelectorLabel';
import { makeSelectStyles, selectComponents } from 'utils/selectStyles';
import { useDockedSelectOptions } from "./useDockedSelectOptions";

const CONTROL_COLOUR = 'var(--palette-mid-grey, #f0f0f7)';

/**
 * Styled container around the dropdown and the optional info panel below.
 */
const StyledDropdown = styled.div`
  width: 100%;
  margin-bottom: 10px;
  display: flex;
  flex-direction: column;
  position: relative;
`;

const InfoBelowPanel = styled.div`
  margin-top: -2px;
  padding: 8px 10px;
  background: ${({ theme }) => theme?.colors?.muted || CONTROL_COLOUR};
  border-right: 1px solid ${({ theme }) => theme?.colors?.border || CONTROL_COLOUR};
  border-bottom: 1px solid ${({ theme }) => theme?.colors?.border || CONTROL_COLOUR};
  border-left: 1px solid ${({ theme }) => theme?.colors?.border || CONTROL_COLOUR};
  border-top: none;
  border-radius: 0 0 ${(p) => p.theme?.borderRadius || "4px"} ${(p) => p.theme?.borderRadius || "4px"};
  font-size: 0.85rem;
  color: ${({ theme }) => theme?.colors?.text || "var(--text-icon)"};
  position: relative;
  z-index: 0;

  &::before {
    content: '';
    position: absolute;
    top: 0;
    bottom: 0;
    left: 0;
    width: 3px;
    background: ${({ theme }) => theme?.colors?.accent || "var(--palette-teal, #00dec6)"};
    border-bottom-left-radius: ${(p) => p.theme?.borderRadius || "4px"};
  }
`;

/**
 * Button that toggles the collapse state of the info panel.
 * Uses a ChevronRightIcon rotated to indicate expanded/collapsed.
 *
 * @param {{ $collapsed: boolean }} props - whether the panel is collapsed (controls icon rotation).
 */
const CollapseButton = styled.button`
  position: absolute;
  top: 4px;
  right: 6px;
  background: transparent;
  border: none;
  cursor: pointer;
  color: ${({ theme }) => theme?.colors?.textMuted || "#666"};
  font-size: 0.9rem;
  padding: 2px;
  line-height: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;

  svg {
    width: 18px;
    height: 18px;
    transition: transform 160ms ease;
    transform: rotate(${(p) => (p.$collapsed ? '0deg' : '90deg')});
  }
`;

/**
 * Wrapper for the expanded info content.
 * Adds right padding so the absolute-positioned collapse button does not overlap content.
 */
const InfoBelowContent = styled.div`
  padding-right: 24px;
`;

const InfoBelowSummary = styled.div`
  font-size: 0.8rem;
  color: #555;
  padding-right: 24px;
`;

/**
* Renders a validity icon (✅ for valid, ⚠️ for invalid).
*
* @param {Object} props
* @param {boolean} props.isValid - Validity state
* @returns {JSX.Element} The icon element.
*/
const ValidityIcon = ({ isValid }) => (
  <span style={{ marginRight: 10 }}>{isValid ? '✅' : '⚠️'}</span>
);

/**
* Renders a label with an optional validity icon and ellipsis overflow behavior.
*
* @param {Object} props
* @param {string} props.label - Option label
* @param {boolean} [props.showIcon] - Whether to render a validity icon
* @param {boolean} [props.isValid] - Validity state (used when showIcon = true)
* @returns {JSX.Element} Label content with optional icon.
*/
// Wrapping follows the react-select value style: ellipsis by default, wrapped when the select
// sets `wrapValues` (docked layout).
const INHERIT_WRAP = { overflow: 'inherit', textOverflow: 'inherit', whiteSpace: 'inherit' };

const LabelWithValidity = ({ label, showIcon, isValid }) => (
  <span style={{ display: 'inline-flex', alignItems: 'center', minWidth: 0, maxWidth: '100%', ...INHERIT_WRAP }}>
    {showIcon && <ValidityIcon isValid={isValid} />}
    <span style={INHERIT_WRAP}>
      {label}
    </span>
  </span>
);

/**
* Unified label renderer for both menu and value contexts.
* - In 'value' context: shows label + validity icon (when applicable).
* - In 'menu' context: shows label + validity icon and any infoOnHover on the right.
*
* @param {Object} data - The option data { label, value, isValid, infoOnHover }
* @param {Object} meta - Includes { context: 'menu' | 'value' | 'input', selectProps }
* @returns {JSX.Element | string} JSX for custom rendering, or string fallback.
*/
const formatOptionLabel = (data, meta) => {
  const showIcon =
    typeof data?.isValid !== 'undefined' && data?.value !== 'all';

  if (meta.context === 'value') {
    return <LabelWithValidity label={data.label} showIcon={showIcon} isValid={data.isValid} />;
  }

  if (meta.context === 'menu') {
    const hasInfoOnHover = !!data.infoOnHover && data.value !== 'all';
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          minWidth: 0,
          width: '100%',
        }}
      >
        <LabelWithValidity label={data.label} showIcon={showIcon} isValid={data.isValid} />
        {hasInfoOnHover && (
          <div style={{ marginLeft: 'auto' }}>
            <SelectorLabel text="" info={data.infoOnHover} />
          </div>
        )}
      </div>
    );
  }

  // Fallback (e.g., for 'input' context)
  return data.label;
};

/**
 * Dropdown component for selecting options.
 * Includes optional rich info when infoOnHover and infoBelowOnChange are provided in the values.
 * @property {Object} filter - The filter object containing values.
 * @property {Array} filter.values - An array of values for the dropdown.
 * @property {string} filter.values[].displayValue - The display value of the option.
 * @property {string} filter.values[].paramValue - The parameter value of the option.
 * @property {string} filter.values[].infoOnHover - The info shown on hovering the option.
 * @property {string} filter.values[].infoBelowOnChange- The info to show below the dropdown, based on selection.
 * @property {boolean} filter.values[].isValid - Indicates if the option is valid.
 * @property {boolean} filter.shouldBeBlankOnInit - Indicates if the filter should be blank on initialization.
 * @property {Function} onChange - The function called when a new option is selected.
 * @returns {JSX.Element} The Dropdown component.
 */
export const Dropdown = ({ filter, onChange, disabled, excludeValue }) => {
  const theme = useTheme();
  const dockedSelectOptions = useDockedSelectOptions();
  const selectStyles = useMemo(() => makeSelectStyles(theme, dockedSelectOptions), [theme, dockedSelectOptions]);

  const { state: filterState } = useFilterContext();
  const [loading, setLoading] = useState(false);
  const [isInfoCollapsed, setInfoCollapsed] = useState(false);
  const prevOptionsRef = useRef([]);
  const prevSelectedOptionsRef = useRef(null);
  const [isAllSelected, setIsAllSelected] = useState(false);
  // The animated chip wrapper fixes each chip's width, which cuts long labels off in the narrow
  // docked column, so docked selects keep react-select's plain chips (and wrap their labels).
  const animatedComponents = useMemo(() => {
    const { MultiValue, ...animated } = makeAnimated();
    return {
      ...animated,
      ...(dockedSelectOptions ? {} : { MultiValue }),
      ...selectComponents,
    };
  }, [dockedSelectOptions]);

  const baseOptions = useMemo(() => {
    return filter.values.values
      .filter((option) => !option.isHidden && (excludeValue === null || excludeValue === undefined || String(option.paramValue) !== String(excludeValue)))
      .map((option) => ({
        value: option.paramValue,
        label: option.displayValue,
        isValid: option?.isValid,
        infoOnHover: option?.infoOnHover ?? null,
        infoBelowOnChange: option?.infoBelowOnChange ?? null,
      }));
  }, [filter.values.values, excludeValue]);

  const options = useMemo(() => {
    if (filter.multiSelect) {
      return [{ value: "all", label: "All" }, ...baseOptions];
    }
    return baseOptions;
  }, [baseOptions, filter.multiSelect]);

  const selectedOptions = useMemo(() => {
    if (Array.isArray(filterState[filter.id])) {
      return options.slice(1).filter((option) => filterState[filter.id]?.includes(option.value));
    }
    return options.find((option) => option.value === filterState[filter.id]);
  }, [filterState, filter.id, options]);

  /**
   * Computes a stable signature representing the visible options for this dropdown,
   * excluding the 'All' option for multi-select. The signature includes each option's
   * value and its validity (isValid). This allows us to set the loading state only
   * when filtering/validation actually changes what is visible or the validity shown.
   *
   * Rationale:
   * - Filtering via isHidden affects the visible options list (options.length).
   * - Validation updates isValid when shouldBeValidated is true, which is included here.
   * - Selections do not alter this signature, so user choices alone won't trigger loading.
   */
  const optionsSignature = useMemo(() => {
    const visible = filter.multiSelect ? options.slice(1) : options;
    // Build a compact signature including value and validity flag
    // Note: undefined isValid (for filters with shouldBeValidated = false) will not flicker loading.
    return JSON.stringify(
      visible.map((o) => ({
        v: o.value,
        // Normalise validity to a tri-state to avoid unnecessary changes:
        val: typeof o.isValid === 'undefined' ? 'u' : o.isValid ? 't' : 'f',
      }))
    );
  }, [options, filter.multiSelect]);

  useEffect(() => {
    // If the selection is now invalid (e.g., filtered out), fall back to a suitable value.
    // For single-select: choose the first visible option (if available) instead of null.
    // Only fallback if forceRequired is not explicitly set to false
    if (
      !filter.shouldBeBlankOnInit &&
      selectedOptions === undefined &&
      filter.forceRequired !== false
    ) {
      const visible = filter.multiSelect ? options.slice(1) : options;
      const fallback = visible[0]?.value ?? null;
      onChange(filter, fallback);
    }
  }, [selectedOptions, filterState, filter, onChange, options]);

  const selectedValue = filterState[filter.id];

  // Ensure multi-select selections stay in sync with filtered options, and fallback when emptied.
  useEffect(() => {
    if (!filter.multiSelect) return;
    if (!Array.isArray(selectedValue)) return;

    const current = filterState[filter.id];
    if (!Array.isArray(current)) return;

    console.log(
      `[Dropdown ${filter.filterName}] Current selection:`,
      current,
      "persistState:",
      filter.persistState,
    );

    const visibleOptions = options.slice(1); // exclude 'All'
    const visibleValuesSet = new Set(visibleOptions.map((o) => o.value));
    const next = current.filter((v) => visibleValuesSet.has(v));

    console.log(
      `[Dropdown ${filter.filterName}] After filtering to visible:`,
      next,
      "visible count:",
      visibleOptions.length,
    );

    // If some selected values were filtered out, prune them.
    if (next.length !== current.length && next.length > 0) {
      console.log(`[Dropdown ${filter.filterName}] Pruning invalid selections`);
      onChange(filter, next);
      return;
    }

    // Only fallback to "all visible" if forceRequired is true or not explicitly set to false
    // This allows filters with forceRequired: false to have empty selections
    const shouldFallbackToAll = filter.forceRequired !== false;

    // Don't override persisted state with "select all" behavior
    // If the filter has persistState enabled and the current selection is intentionally limited,
    // we should respect that rather than auto-selecting all
    const hasPersistState = filter.persistState === true;

    // If all selected values are now filtered out, fallback to "all visible" to keep selection valid
    // but only if the filter is required and doesn't have persisted state that should be respected
    if (
      current.length > 0 &&
      next.length === 0 &&
      shouldFallbackToAll &&
      !hasPersistState
    ) {
      console.log(
        `[Dropdown ${filter.filterName}] All selections invalid, falling back to all`,
      );
      const allVisible = visibleOptions.map((o) => o.value);
      // Mark that 'All' semantic is active so existing logic keeps it updated when options change.
      setIsAllSelected(true);
      onChange(filter, allVisible);
    } else if (current.length > 0 && next.length === 0 && hasPersistState) {
      console.log(
        `[Dropdown ${filter.filterName}] All selections invalid but has persistState, not auto-selecting all`,
      );
    }
  }, [
    selectedValue,
    optionsSignature,
    filter.id,
    filter.multiSelect,
    filter.persistState,
    filter.forceRequired,
    onChange,
  ]);

  /**
   * Sets loading only when the visible options or their validity change,
   * which corresponds to actual filtering or validation updates.
   */
  useEffect(() => {
    // If signature changes, reflect a short loading state
    setLoading(true);
    const timer = setTimeout(() => {
      setLoading(false);
    }, 400);
    return () => clearTimeout(timer);
  }, [optionsSignature]);

  useEffect(() => {
    const prevOptions = prevOptionsRef.current;
    const currentOptions = options.slice(1).map((option) => option.value);

    if (Array.isArray(filterState[filter.id]) && isAllSelected) {
      if (JSON.stringify(prevOptions) !== JSON.stringify(currentOptions)) {
        onChange(filter, currentOptions);
      }
    }

    prevOptionsRef.current = currentOptions;
  }, [options, filterState, filter, onChange, isAllSelected]);

  const handleDropdownChange = (selectedOptions) => {
    if (Array.isArray(selectedOptions)) {
      if (selectedOptions.some(option => option.value === 'all')) {
        setIsAllSelected(true);
        onChange(filter, options.slice(1).map(option => option.value));
      } else {
        setIsAllSelected(false);
        onChange(filter, selectedOptions.map((o) => o.value));
      }
    } else if (selectedOptions) {
      setIsAllSelected(false);
      onChange(filter, selectedOptions.value);
    } else {
      // When cleared, set to null for single-select or empty array for multi-select
      setIsAllSelected(false);
      onChange(filter, filter.multiSelect ? [] : null);
    }
  };

  useEffect(() => {
    // Update the previous selected options ref whenever the selection changes
    prevSelectedOptionsRef.current = filterState[filter.id];
  }, [filterState, filter.id]);

  // Optional auto-select when exactly one option is available
  useEffect(() => {
    if (options.length === 1 && filterState[filter.id] !== options[0].value) {
      onChange(filter, options[0].value);
    }
  }, [options, filter, onChange, filterState]);

  const hasSelection = useMemo(() => {
    const val = filterState[filter.id];
    return Array.isArray(val) ? val.length > 0 : !!val;
  }, [filterState, filter.id]);

  const infoBelowItems = useMemo(() => {
    if (!hasSelection) return [];
    if (Array.isArray(selectedOptions)) {
      return selectedOptions
        .filter((o) => !!o.infoBelowOnChange)
        .map((o) => ({ label: o.label, text: o.infoBelowOnChange }));
    }
    if (selectedOptions?.infoBelowOnChange) {
      return [{ label: selectedOptions.label, text: selectedOptions.infoBelowOnChange }];
    }
    return [];
  }, [hasSelection, selectedOptions]);

  const infoBelowSummaryText = useMemo(() => {
    if (infoBelowItems.length === 0) return '';
    if (Array.isArray(selectedOptions)) {
      return `Details available for ${infoBelowItems.length} selection${infoBelowItems.length > 1 ? 's' : ''} — expand for details.`;
    }
    return `Details available — expand for details.`;
  }, [infoBelowItems, selectedOptions]);

  // Single-select placeholder: show "All" when includeAllOption is set and value is null
  const placeholder =
    !filter.multiSelect && filter.includeAllOption && !hasSelection ? "All" : "Select...";

  return (
    <StyledDropdown>
      <Select
        components={animatedComponents}
        options={options}
        value={selectedOptions}
        onChange={handleDropdownChange}
        formatOptionLabel={formatOptionLabel}
        styles={selectStyles}
        menuPlacement="auto"
        menuPortalTarget={document.body}
        isClearable={filter.isClearable}
        isMulti={filter.multiSelect}
        isLoading={loading}
        placeholder={placeholder}
        isDisabled={disabled}
      />
      {hasSelection && infoBelowItems.length > 0 && (
        <InfoBelowPanel>
          <CollapseButton
            onClick={() => setInfoCollapsed((c) => !c)}
            aria-label={isInfoCollapsed ? 'Expand details' : 'Collapse details'}
            title={isInfoCollapsed ? 'Expand details' : 'Collapse details'}
            aria-expanded={!isInfoCollapsed}
            $collapsed={isInfoCollapsed}
          >
            <ChevronRightIcon aria-hidden="true" />
          </CollapseButton>

          {isInfoCollapsed ? (
            <InfoBelowSummary>{infoBelowSummaryText}</InfoBelowSummary>
          ) : (
            <InfoBelowContent>
              {Array.isArray(selectedOptions) ? (
                <ul style={{ margin: 0, paddingLeft: '1.2rem' }}>
                  {infoBelowItems.map((item, i) => (
                    <li key={`${item.label}-${i}`}>
                      <strong style={{ marginRight: 4 }}>{item.label}:</strong>
                      <span>{item.text}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <div>
                  <strong style={{ marginRight: 4 }}>{infoBelowItems[0].label}:</strong>
                  <span>{infoBelowItems[0].text}</span>
                </div>
              )}
            </InfoBelowContent>
          )}
        </InfoBelowPanel>
      )}
    </StyledDropdown>
  );
};
