import React, { useEffect, useId, useState } from "react";
import styled from "styled-components";
import { brandTokens } from "defaults";
import {
  formatDateForLocale,
  getDefaultDateRangeValue,
  normaliseDateRangeValue,
  toIsoDate,
} from "utils/dateRange";

/**
 * Reads a theme colour, falling back to the vis-core token when no theme is provided.
 * @param {string} name - The `theme.colors` key.
 * @param {string} fallback - The token value used without a theme.
 * @returns {Function} A styled-components interpolation.
 */
const themeColour = (name, fallback) => ({ theme }) => theme?.colors?.[name] ?? fallback;

const Group = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
  font-family: var(--font-sans);
`;

const Field = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
`;

const FieldLabel = styled.label`
  font-size: 0.8rem;
  color: ${themeColour("text", brandTokens.palette.textIcon)};
`;

const DateInput = styled.input`
  box-sizing: border-box;
  width: 100%;
  padding: 8px 10px;
  font-family: inherit;
  font-size: 0.875rem;
  color: ${themeColour("text", brandTokens.palette.textIcon)};
  background: ${themeColour("surface", brandTokens.palette.white)};
  border: 1px solid ${themeColour("border", brandTokens.palette.grey)};
  border-radius: ${({ theme }) => theme?.borderRadius ?? brandTokens.radii.xs};

  &:focus-visible {
    outline: 2px solid ${themeColour("primary", brandTokens.palette.navy)};
    outline-offset: 1px;
  }

  &[aria-invalid="true"] {
    border-color: ${themeColour("danger", brandTokens.palette.danger)};
  }

  &:disabled {
    cursor: not-allowed;
  }
`;

const Hint = styled.p`
  margin: 0;
  font-size: 0.75rem;
  color: ${themeColour("text", brandTokens.palette.textIcon)};
`;

const ErrorText = styled.p`
  margin: 0;
  font-size: 0.8rem;
  color: ${themeColour("danger", brandTokens.palette.danger)};
`;

const ToggleLabel = styled.label`
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.875rem;
  cursor: pointer;

  input {
    width: 16px;
    height: 16px;
    margin: 0;
    accent-color: ${themeColour("primary", brandTokens.palette.navy)};
  }
`;

/**
 * Renders two labelled native date inputs for a `dateRange` filter, plus an optional checkbox
 * for the filter's `extraToggle`.
 *
 * The filter value is `[from, to]`, or `[from, to, toggle]` with an `extraToggle`. Dates are
 * ISO `YYYY-MM-DD` strings. A value is only sent once both dates are complete, within
 * `filter.min`/`filter.max` and in order. A reversed range is reported at once; an incomplete
 * or out-of-range date is reported on blur, so typing is not interrupted. Inputs are never
 * rewritten while someone types.
 *
 * @property {Object} filter - The dateRange filter configuration (with resolved `min`/`max`).
 * @property {string} [filter.locale] - BCP 47 locale used for dates in the hint and error text.
 * @property {Object} [filter.labels] - Optional `{ from, to }` input labels.
 * @property {Object} [filter.extraToggle] - Optional `{ paramName, label, defaultValue }`.
 * @property {Array} [value] - The current value from FilterContext.
 * @property {Function} onChange - Called with `(filter, value)` when a valid value is chosen.
 * @property {boolean} [disabled] - Disables every control.
 * @returns {JSX.Element} The rendered DateRangeSelector component.
 */
export const DateRangeSelector = ({ filter, value, onChange, disabled = false }) => {
  const baseId = useId();
  const fromId = `${baseId}-from`;
  const toId = `${baseId}-to`;
  const hintId = `${baseId}-hint`;
  const errorId = `${baseId}-error`;

  const { locale } = filter;
  const min = toIsoDate(filter.min);
  const max = toIsoDate(filter.max);
  const committed = normaliseDateRangeValue(filter, value) ?? getDefaultDateRangeValue(filter);
  const committedFrom = committed?.[0] ?? "";
  const committedTo = committed?.[1] ?? "";
  const toggleChecked = Boolean(committed?.[2]);

  const [draftFrom, setDraftFrom] = useState(committedFrom);
  const [draftTo, setDraftTo] = useState(committedTo);
  const [error, setError] = useState(null);

  // Follow external changes (initialisation, persistence restore, reset).
  useEffect(() => {
    setDraftFrom(committedFrom);
    setDraftTo(committedTo);
    setError(null);
  }, [committedFrom, committedTo]);

  const fromLabel = filter.labels?.from ?? "From";
  const toLabel = filter.labels?.to ?? "To";
  const format = (iso) => formatDateForLocale(iso, locale);

  /**
   * Checks a pair of draft dates. Drafts are never rewritten: while someone types, Chromium
   * reports partial years (`0002-…`) or `""`, and rewriting them would lose the typed date.
   * @returns {{ status: "ok"|"incomplete"|"outOfRange"|"reversed", message?: string }}
   */
  const checkDrafts = (rawFrom, rawTo) => {
    const from = toIsoDate(rawFrom);
    const to = toIsoDate(rawTo);
    if (!from || !to) {
      return { status: "incomplete", message: `Enter a valid "${from ? toLabel : fromLabel}" date.` };
    }
    const outside = [from, to].some((date) => (min && date < min) || (max && date > max));
    if (outside) {
      const range = min && max
        ? `between ${format(min)} and ${format(max)}`
        : min ? `on or after ${format(min)}` : `on or before ${format(max)}`;
      return { status: "outOfRange", message: `Choose a date ${range}.` };
    }
    if (from > to) {
      return {
        status: "reversed",
        message: `"${fromLabel}" date (${format(from)}) must be on or before "${toLabel}" date (${format(to)}).`,
      };
    }
    return { status: "ok", from, to };
  };

  const handleDateChange = (which, rawValue) => {
    if (disabled) return;
    const nextFrom = which === "from" ? rawValue : draftFrom;
    const nextTo = which === "to" ? rawValue : draftTo;
    if (which === "from") setDraftFrom(rawValue);
    else setDraftTo(rawValue);

    const result = checkDrafts(nextFrom, nextTo);
    if (result.status === "ok") {
      setError(null);
      const next = [result.from, result.to];
      if (filter.extraToggle) next.push(toggleChecked);
      onChange(filter, next);
    } else if (result.status === "reversed") {
      // A complete but reversed range is reported straight away.
      setError(result.message);
    } else {
      // Incomplete or out-of-range dates are often mid-typing: report them on blur instead.
      setError(null);
    }
  };

  const handleBlur = () => {
    const result = checkDrafts(draftFrom, draftTo);
    if (result.status !== "ok") setError(result.message);
  };

  const handleToggleChange = (event) => {
    if (disabled || !committed) return;
    onChange(filter, [committed[0], committed[1], event.target.checked]);
  };

  const describedBy = [min && max ? hintId : null, error ? errorId : null]
    .filter(Boolean)
    .join(" ") || undefined;

  return (
    <Group
      role="group"
      aria-label={filter.filterName}
      lang={locale}
    >
      <Field>
        <FieldLabel htmlFor={fromId}>{fromLabel}</FieldLabel>
        <DateInput
          id={fromId}
          type="date"
          value={draftFrom}
          min={min ?? undefined}
          max={max ?? undefined}
          disabled={disabled}
          aria-invalid={error ? "true" : "false"}
          aria-describedby={describedBy}
          onChange={(event) => handleDateChange("from", event.target.value)}
          onBlur={handleBlur}
        />
      </Field>
      <Field>
        <FieldLabel htmlFor={toId}>{toLabel}</FieldLabel>
        <DateInput
          id={toId}
          type="date"
          value={draftTo}
          min={min ?? undefined}
          max={max ?? undefined}
          disabled={disabled}
          aria-invalid={error ? "true" : "false"}
          aria-describedby={describedBy}
          onChange={(event) => handleDateChange("to", event.target.value)}
          onBlur={handleBlur}
        />
      </Field>
      {min && max && (
        <Hint id={hintId}>
          Available {format(min)} to {format(max)}
        </Hint>
      )}
      <ErrorText id={errorId} role="alert">
        {error}
      </ErrorText>
      {filter.extraToggle && (
        <ToggleLabel>
          <input
            type="checkbox"
            checked={toggleChecked}
            disabled={disabled}
            onChange={handleToggleChange}
          />
          {filter.extraToggle.label}
        </ToggleLabel>
      )}
    </Group>
  );
};
