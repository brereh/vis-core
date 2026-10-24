import React, { useContext, useEffect, useId, useMemo, useRef, useState } from "react";
import styled, { ThemeProvider, useTheme } from "styled-components";
import chroma from "chroma-js";
import { FilterContext } from "contexts/FilterContext";
import { MapContext } from "contexts/MapContext";
import { mergeThemeWithBrandDefaults } from "defaults";
import { formatNumber } from "utils";

/**
 * Layout defaults for the heatmap, in pixels.
 * @constant {Object}
 */
const HEATMAP_DEFAULTS = {
  cellHeight: 20,
  minCellWidth: 14,
  gap: 2,
  headerHeight: 18,
  markerWidth: 14,
  steps: 6,
  fallbackWidth: 640,
};

const Section = styled.section`
  margin: 0;
  font-family: var(--font-sans);
  color: ${({ theme }) => theme?.colors?.text || "var(--text-icon)"};
`;

const Header = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
`;

const Title = styled.h3`
  margin: 2px 0 4px;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-icon);
  font-family: "Korto", var(--font-sans);
`;

const TableToggle = styled.button`
  flex-shrink: 0;
  padding: 2px 10px;
  font-size: 11px;
  font-family: var(--font-sans);
  color: ${({ theme }) => theme.colors.primary};
  background: ${({ theme }) => theme.colors.surface};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: var(--radius-pill-sm);
  cursor: pointer;

  &[aria-pressed="true"] {
    color: ${({ theme }) => theme.colors.surface};
    background: ${({ theme }) => theme.colors.primary};
    border-color: ${({ theme }) => theme.colors.primary};
  }

  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.colors.primary};
    outline-offset: 2px;
  }
`;

const ScrollBox = styled.div`
  position: relative;
  overflow-x: auto;
  overflow-y: hidden;
`;

const Grid = styled.div`
  display: flex;
  align-items: flex-start;
`;

const LabelColumn = styled.div`
  position: sticky;
  left: 0;
  z-index: 1;
  background: ${({ theme }) => theme.colors.surface};
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  padding-right: 8px;
`;

const RowLabel = styled.span`
  box-sizing: border-box;
  display: flex;
  align-items: center;
  height: ${({ $height }) => $height}px;
  margin: 0;
  padding: 0 4px;
  font-size: 11px;
  font-family: var(--font-sans);
  white-space: nowrap;
  text-align: left;
  color: ${({ $tone, theme }) => $tone || theme.colors.text};
  text-decoration: ${({ $strike }) => ($strike ? "line-through" : "none")};
  font-weight: ${({ $selected }) => ($selected ? 700 : 400)};
  background: ${({ $selected, theme }) => ($selected ? theme.colors.muted : "transparent")};
  border: none;
  border-radius: var(--radius-xxs);
`;

const RowButton = styled(RowLabel).attrs({ as: "button", type: "button" })`
  cursor: pointer;

  &:hover {
    background: ${({ theme }) => theme.colors.muted};
  }

  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.colors.primary};
    outline-offset: -2px;
  }
`;

const CellArea = styled.div`
  flex: 1;
`;

const Tooltip = styled.div`
  position: absolute;
  z-index: 2;
  pointer-events: none;
  padding: 4px 8px;
  font-size: 11px;
  white-space: nowrap;
  color: ${({ theme }) => theme.colors.surface};
  background: ${({ theme }) => theme.colors.primary};
  border-radius: var(--radius-xxs);
  transform: translate(-50%, calc(-100% - 6px));
`;

const Legend = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
  margin-top: 8px;
  font-size: 11px;
  color: var(--text-icon);
`;

const Swatch = styled.span`
  display: inline-block;
  width: 14px;
  height: 10px;
  background: ${({ $colour }) => $colour};
  border-radius: 2px;
`;

const DataTableWrapper = styled.div`
  overflow-x: auto;
  margin-top: 4px;

  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.colors.primary};
  }

  table {
    border-collapse: collapse;
    font-size: 11px;
  }

  th,
  td {
    padding: 2px 6px;
    text-align: right;
    white-space: nowrap;
    border-bottom: 1px solid ${({ theme }) => theme.colors.navBorder};
  }

  th[scope="row"],
  thead th:first-child {
    text-align: left;
  }
`;

const VisuallyHidden = styled.span`
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
`;

const rowLabelKey = (config) => config.rowLabel || config.rowKey || "row";

const isBlank = (v) => v === null || v === undefined || v === "";

/**
 * Turns a data key such as "is_excluded" into a readable label ("Excluded").
 * @param {string} key
 * @returns {string}
 */
const humaniseKey = (key = "") => {
  const text = String(key).replace(/^(is|has)_/, "").replace(/_/g, " ").trim();
  return text.charAt(0).toUpperCase() + text.slice(1);
};

/**
 * Formats a column value for display.
 * `format` may be a function, or a string where `HH` is the value padded to
 * two digits and `H` is the value as is (e.g. "HH:00" turns 7 into "07:00").
 * @param {*} value - The column value
 * @param {string|Function} [format]
 * @returns {string}
 */
export const formatColumnLabel = (value, format) => {
  if (typeof format === "function") return String(format(value));
  if (typeof format === "string" && format.length) {
    return format.replace(/HH|H/g, (token) =>
      token === "HH" ? String(value).padStart(2, "0") : String(value)
    );
  }
  return String(value);
};

/**
 * Resolves the colours used for the heatmap classes.
 * Accepts an array of colours, a ColorBrewer scheme name known to chroma-js
 * (e.g. "Blues", "YlGnBu"), or anything else (including "sequential") for a
 * token-based default running from the muted surface to the primary colour.
 * @param {string|string[]} scheme
 * @param {number} steps
 * @param {Object} theme - Theme merged with brand defaults
 * @returns {string[]}
 */
export const getHeatmapColours = (scheme, steps, theme) => {
  if (Array.isArray(scheme) && scheme.length > 1) {
    return chroma.scale(scheme).mode("lab").colors(steps);
  }
  if (typeof scheme === "string") {
    const brewerKey = Object.keys(chroma.brewer).find(
      (k) => k.toLowerCase() === scheme.toLowerCase()
    );
    if (brewerKey) {
      return chroma.scale(chroma.brewer[brewerKey]).mode("lab").colors(steps);
    }
  }
  return chroma
    .scale([theme.colors.muted, theme.colors.primary])
    .mode("lab")
    .colors(steps);
};

const toneColour = (tone, theme) => {
  switch (tone) {
    case "warning":
      return theme.colors.warning;
    case "danger":
    case "error":
      return theme.colors.danger;
    case "accent":
      return theme.colors.accent;
    case "primary":
    case undefined:
      return theme.colors.primary;
    default:
      // Allow an explicit colour from app config
      return tone;
  }
};

/**
 * Groups flat data rows into heatmap rows and columns.
 * Rows can have different numbers of cells (for example 23- or 25-hour days
 * on clock-change dates); cells a row does not have are left empty.
 * @param {Object} config - Heatmap config
 * @param {Array<Object>} data - Flat data rows
 * @returns {{rows: Array, columns: Array, min: number, max: number, hasMissing: boolean}}
 */
export const buildHeatmapModel = (config, data) => {
  const {
    rowKey,
    rowLabel,
    columnKey,
    valueKey = "value",
    missingKey,
    cellLabelKey,
    rowMarkers = [],
    columnLabels = {},
  } = config;
  const columnLabelKey = columnLabels.key;

  const rowsByKey = new Map();
  const columnLabelByKey = new Map();
  let min = Infinity;
  let max = -Infinity;
  let hasMissing = false;

  (Array.isArray(data) ? data : []).forEach((record) => {
    const rKey = record?.[rowKey];
    const cKey = record?.[columnKey];
    if (isBlank(rKey) || isBlank(cKey)) return;

    if (!rowsByKey.has(String(rKey))) {
      rowsByKey.set(String(rKey), {
        key: rKey,
        label: String(record?.[rowLabel] ?? rKey),
        cells: new Map(),
        markers: [],
      });
    }
    const row = rowsByKey.get(String(rKey));

    if (!columnLabelByKey.has(String(cKey))) {
      columnLabelByKey.set(String(cKey), {
        key: cKey,
        label: columnLabelKey && !isBlank(record?.[columnLabelKey])
          ? String(record[columnLabelKey])
          : formatColumnLabel(cKey, columnLabels.format),
      });
    }

    const raw = record?.[valueKey];
    const num = isBlank(raw) ? NaN : Number(raw);
    const missing = Boolean(missingKey && record?.[missingKey]) || !Number.isFinite(num);
    if (missing) {
      hasMissing = true;
    } else {
      min = Math.min(min, num);
      max = Math.max(max, num);
    }

    row.cells.set(String(cKey), {
      value: missing ? null : num,
      missing,
      label: cellLabelKey && !isBlank(record?.[cellLabelKey]) ? String(record[cellLabelKey]) : null,
    });

    rowMarkers.forEach((marker) => {
      if (record?.[marker.key] && !row.markers.includes(marker)) {
        row.markers.push(marker);
      }
    });
  });

  const columns = Array.isArray(config.columns)
    ? config.columns.map((c) => columnLabelByKey.get(String(c)) || {
        key: c,
        label: formatColumnLabel(c, columnLabels.format),
      })
    : [...columnLabelByKey.values()];

  if (!Array.isArray(config.columns) && columns.every((c) => Number.isFinite(Number(c.key)))) {
    columns.sort((a, b) => Number(a.key) - Number(b.key));
  }

  const rows = [...rowsByKey.values()].map((row) => ({
    ...row,
    markers: rowMarkers.filter((m) => row.markers.includes(m)),
  }));

  return {
    rows,
    columns,
    min: Number.isFinite(min) ? min : 0,
    max: Number.isFinite(max) ? max : 0,
    hasMissing,
  };
};

/**
 * Tracks the width of an element, falling back to a fixed width where
 * ResizeObserver is unavailable (for example in server rendering).
 */
const useElementWidth = (ref, fallback) => {
  const [width, setWidth] = useState(fallback);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver((entries) => {
      const next = entries[0]?.contentRect?.width;
      if (next) setWidth(next);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);
  return width;
};

/**
 * Row-by-column heatmap rendered as SVG, with selectable rows, hatched
 * missing cells, row markers and a data table alternative.
 *
 * @param {Object} props
 * @param {Object} props.config - Chart config (see docs/Heatmap Chart.md)
 * @param {Array<Object>} props.data - Flat data rows
 * @param {Object} props.formatters - Formatting functions from ChartRenderer
 * @returns {JSX.Element}
 */
export const HeatmapChart = ({ config, data, formatters = {} }) => {
  const appTheme = useTheme();
  const theme = useMemo(() => mergeThemeWithBrandDefaults(appTheme), [appTheme]);
  const filterContext = useContext(FilterContext);
  const mapContext = useContext(MapContext);
  const patternId = `heatmap-missing-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;

  const cellHeight = config.cellHeight ?? HEATMAP_DEFAULTS.cellHeight;
  const minCellWidth = config.minCellWidth ?? HEATMAP_DEFAULTS.minCellWidth;
  const { gap, headerHeight, markerWidth } = HEATMAP_DEFAULTS;
  const rowHeight = cellHeight + gap;
  const steps = config.legend?.steps ?? HEATMAP_DEFAULTS.steps;
  const every = Math.max(1, Number(config.columnLabels?.every) || 1);

  const model = useMemo(() => buildHeatmapModel(config, data), [config, data]);
  const { rows, columns, min, max, hasMissing } = model;
  const colours = useMemo(
    () => getHeatmapColours(config.colourScheme ?? config.colorScheme, steps, theme),
    [config.colourScheme, config.colorScheme, steps, theme]
  );

  const formatValue = (value) => {
    const named = config.valueFormatter && formatters[config.valueFormatter];
    const text = named ? named(value) : formatNumber(value, { stripTrailingZeroes: true });
    return config.units ? `${text} ${config.units}` : String(text);
  };

  const colourFor = (value) => {
    if (max === min) return colours[colours.length - 1];
    const idx = Math.floor(((value - min) / (max - min)) * steps);
    return colours[Math.min(steps - 1, Math.max(0, idx))];
  };

  // Selection: follow the named filter's value when the filter context has
  // it, otherwise keep the selection locally.
  const { onRowSelect } = config;
  const filterId = typeof onRowSelect === "string" ? onRowSelect : null;
  const filterState = filterContext?.state;
  const followsFilter = Boolean(filterId && filterState && filterId in filterState);
  const [localSelected, setLocalSelected] = useState(null);
  const selectedValue = followsFilter ? filterState[filterId] : localSelected;
  const selectable = Boolean(onRowSelect);
  const isSelected = (row) =>
    !isBlank(selectedValue) && String(row.key) === String(selectedValue);

  const selectRow = (row) => {
    if (!selectable) return;
    setLocalSelected(row.key);
    if (typeof onRowSelect === "function") {
      onRowSelect(row.key, row);
      return;
    }
    // Mirror how Map sets filters: update the filter value, then run the
    // filter's configured actions.
    const filter = mapContext?.state?.filters?.find((f) => f.id === filterId);
    filterContext?.dispatch?.({
      type: "SET_FILTER_VALUE",
      payload: { filterId, value: row.key, filter },
    });
    (filter?.actions || []).forEach((action) => {
      mapContext?.dispatch?.({
        type: action.action,
        payload: { filter, value: row.key, ...action.payload },
      });
    });
  };

  // Roving focus across the row buttons
  const buttonRefs = useRef([]);
  const selectedIndex = rows.findIndex(isSelected);
  const [focusIndex, setFocusIndex] = useState(null);
  const tabbableIndex = focusIndex ?? (selectedIndex >= 0 ? selectedIndex : 0);

  const handleRowKeyDown = (event, index) => {
    const last = rows.length - 1;
    const targets = { ArrowDown: index + 1, ArrowUp: index - 1, Home: 0, End: last };
    if (!(event.key in targets)) return;
    event.preventDefault();
    const next = Math.min(last, Math.max(0, targets[event.key]));
    setFocusIndex(next);
    buttonRefs.current[next]?.focus();
  };

  const [showTable, setShowTable] = useState(false);
  const [tooltip, setTooltip] = useState(null);

  const cellAreaRef = useRef(null);
  const measuredWidth = useElementWidth(cellAreaRef, HEATMAP_DEFAULTS.fallbackWidth);
  const maxMarkers = Math.max(0, ...rows.map((r) => r.markers.length));
  const markerSpace = maxMarkers ? maxMarkers * markerWidth + 6 : 0;
  const minSvgWidth = columns.length * (minCellWidth + gap) + markerSpace;
  const svgWidth = Math.max(measuredWidth, minSvgWidth);
  const cellWidth = columns.length
    ? (svgWidth - markerSpace) / columns.length - gap
    : minCellWidth;
  const gridWidth = columns.length * (cellWidth + gap) - gap;
  const svgHeight = headerHeight + rows.length * rowHeight;

  const title = config.title;
  const legend = config.legend || {};

  const markerSummary = (row) => row.markers.map((m) => m.label || humaniseKey(m.key)).join(", ");

  const renderTable = () => (
    <DataTableWrapper
      tabIndex={0}
      role="region"
      aria-label={`${title || "Heatmap"} data table`}
    >
      <table>
        <VisuallyHidden as="caption">{title || "Heatmap data"}</VisuallyHidden>
        <thead>
          <tr>
            <th scope="col">{config.rowHeader || humaniseKey(rowLabelKey(config))}</th>
            {columns.map((c) => (
              <th key={String(c.key)} scope="col">{c.label}</th>
            ))}
            {maxMarkers > 0 && <th scope="col">Notes</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={String(row.key)}>
              <th scope="row">{row.label}</th>
              {columns.map((c) => {
                const cell = row.cells.get(String(c.key));
                let text = "";
                if (cell) text = cell.missing ? "No data" : formatValue(cell.value);
                return <td key={String(c.key)}>{text}</td>;
              })}
              {maxMarkers > 0 && <td>{markerSummary(row)}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </DataTableWrapper>
  );

  const renderChart = () => (
    <ScrollBox onMouseLeave={() => setTooltip(null)}>
      <Grid style={{ minWidth: "min-content" }}>
        <LabelColumn
          role={selectable ? "group" : undefined}
          aria-label={selectable ? `Select a row in ${title || "the heatmap"}` : undefined}
        >
          <div style={{ height: headerHeight }} aria-hidden="true" />
          {rows.map((row, index) => {
            const strikeMarker = row.markers.find((m) => m.strike);
            const tone = strikeMarker ? toneColour(strikeMarker.tone, theme) : undefined;
            const summary = markerSummary(row);
            const common = {
              $height: rowHeight,
              $tone: tone,
              $strike: Boolean(strikeMarker),
              $selected: isSelected(row),
            };
            const content = (
              <>
                {row.label}
                {summary && <VisuallyHidden>{` (${summary})`}</VisuallyHidden>}
              </>
            );
            if (!selectable) {
              return <RowLabel key={String(row.key)} {...common}>{content}</RowLabel>;
            }
            return (
              <RowButton
                key={String(row.key)}
                {...common}
                ref={(el) => {
                  buttonRefs.current[index] = el;
                }}
                aria-pressed={isSelected(row)}
                tabIndex={index === tabbableIndex ? 0 : -1}
                onClick={() => selectRow(row)}
                onFocus={() => setFocusIndex(index)}
                onKeyDown={(e) => handleRowKeyDown(e, index)}
              >
                {content}
              </RowButton>
            );
          })}
        </LabelColumn>
        <CellArea ref={cellAreaRef} style={{ minWidth: minSvgWidth }}>
          <svg
            width={svgWidth}
            height={svgHeight}
            role="img"
            aria-label={`${title || "Heatmap"}: ${rows.length} rows by ${columns.length} columns. Use "Show as table" to read the values.`}
            style={{ display: "block", overflow: "visible" }}
          >
            <g aria-hidden="true">
              {columns.map((c, ci) =>
                ci % every === 0 ? (
                  <text
                    key={String(c.key)}
                    x={ci * (cellWidth + gap)}
                    y={headerHeight - 6}
                    fontSize="11"
                    fill={theme.colors.text}
                    data-testid="heatmap-column-label"
                  >
                    {c.label}
                  </text>
                ) : null
              )}
              {rows.map((row, ri) => {
                const y = headerHeight + ri * rowHeight;
                const selected = isSelected(row);
                const outlineMarker = row.markers[0];
                return (
                  <g key={String(row.key)} data-row={String(row.key)}>
                    {columns.map((c, ci) => {
                      const cell = row.cells.get(String(c.key));
                      if (!cell) return null;
                      const x = ci * (cellWidth + gap);
                      const label = cell.label || c.label;
                      const text = cell.missing
                        ? `${row.label} ${label}: no data`
                        : `${row.label} ${label}: ${formatValue(cell.value)}`;
                      return (
                        <rect
                          key={String(c.key)}
                          data-testid="heatmap-cell"
                          data-missing={cell.missing ? "true" : undefined}
                          x={x}
                          y={y}
                          width={Math.max(0, cellWidth)}
                          height={cellHeight}
                          rx="2"
                          fill={cell.missing ? `url(#${patternId})` : colourFor(cell.value)}
                          stroke={cell.missing ? theme.colors.border : "none"}
                          style={{ cursor: selectable ? "pointer" : "default" }}
                          onClick={() => selectRow(row)}
                          onMouseEnter={() =>
                            setTooltip({
                              text,
                              x: x + cellWidth / 2,
                              y,
                            })
                          }
                        />
                      );
                    })}
                    {outlineMarker && !selected && (
                      <rect
                        data-testid="heatmap-row-outline"
                        x={-1.5}
                        y={y - 1.5}
                        width={gridWidth + 3}
                        height={cellHeight + 3}
                        rx="3"
                        fill="none"
                        stroke={toneColour(outlineMarker.tone, theme)}
                        strokeWidth="1.5"
                        pointerEvents="none"
                      />
                    )}
                    {selected && (
                      <rect
                        data-testid="heatmap-selected-row"
                        x={-2}
                        y={y - 2}
                        width={gridWidth + 4}
                        height={cellHeight + 4}
                        rx="3"
                        fill="none"
                        stroke={theme.colors.primary}
                        strokeWidth="2.5"
                        pointerEvents="none"
                      />
                    )}
                    {row.markers.map((m, mi) => (
                      <text
                        key={m.key}
                        data-testid="heatmap-marker"
                        x={gridWidth + 8 + mi * markerWidth}
                        y={y + cellHeight / 2}
                        dominantBaseline="central"
                        fontSize="12"
                        fontWeight="700"
                        fill={toneColour(m.tone, theme)}
                      >
                        {m.symbol || "•"}
                      </text>
                    ))}
                  </g>
                );
              })}
            </g>
          </svg>
        </CellArea>
      </Grid>
      {tooltip && (
        <Tooltip
          role="tooltip"
          style={{
            left: (cellAreaRef.current?.offsetLeft ?? 0) + tooltip.x,
            top: tooltip.y,
          }}
        >
          {tooltip.text}
        </Tooltip>
      )}
    </ScrollBox>
  );

  return (
    <ThemeProvider theme={theme}>
      <Section aria-label={config.ariaLabel || title || "Heatmap"}>
        <svg width="0" height="0" aria-hidden="true" focusable="false" style={{ position: "absolute" }}>
          <defs>
            <pattern
              id={patternId}
              width="6"
              height="6"
              patternUnits="userSpaceOnUse"
              patternTransform="rotate(45)"
            >
              <rect width="6" height="6" fill={theme.colors.surface} />
              <line x1="0" y1="0" x2="0" y2="6" stroke={theme.colors.danger} strokeWidth="1.5" strokeOpacity="0.5" />
            </pattern>
          </defs>
        </svg>
        <Header>
          {title ? <Title>{title}</Title> : <span />}
          <TableToggle aria-pressed={showTable} onClick={() => setShowTable((v) => !v)}>
            Show as table
          </TableToggle>
        </Header>
        {showTable ? renderTable() : renderChart()}
        <Legend>
          <span>{legend.minLabel ?? formatValue(min)}</span>
          {colours.map((c) => (
            <Swatch key={c} $colour={c} aria-hidden="true" />
          ))}
          <span>{legend.maxLabel ?? formatValue(max)}</span>
          {hasMissing && (
            <>
              <svg width="14" height="10" aria-hidden="true" style={{ marginLeft: 8 }}>
                <rect width="14" height="10" rx="2" fill={`url(#${patternId})`} stroke={theme.colors.border} />
              </svg>
              <span>{legend.missingLabel ?? "No data"}</span>
            </>
          )}
          {(config.rowMarkers || []).map((m) => (
            <span key={m.key} style={{ marginLeft: 8 }}>
              <span aria-hidden="true" style={{ color: toneColour(m.tone, theme), fontWeight: 700 }}>
                {m.symbol || "•"}
              </span>{" "}
              {m.label || humaniseKey(m.key)}
            </span>
          ))}
        </Legend>
      </Section>
    </ThemeProvider>
  );
};

export default HeatmapChart;
