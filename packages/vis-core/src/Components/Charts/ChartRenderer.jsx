import React, { useState, useRef } from "react";
import { createPortal } from "react-dom";
import {
  ResponsiveContainer,
  BarChart as RBarChart,
  Bar as RBar,
  XAxis as RXAxis,
  YAxis as RYAxis,
  CartesianGrid as RCartesianGrid,
  Tooltip as RTooltip,
  PieChart as RPieChart,
  Pie as RPie,
  Cell as RCell,
  Legend as RLegend,
  LineChart as RLineChart,
  Line as RLine,
  AreaChart as RAreaChart,
  Area as RArea,
  ScatterChart as RScatterChart,
  Scatter as RScatter,
  ReferenceArea as RReferenceArea,
} from "recharts";
import styled, { css, useTheme } from "styled-components";
import { WarningBox } from "Components/MessageBox";
import { TransitionGroup, CSSTransition } from "react-transition-group";
import { FaChevronDown, FaChevronUp } from "react-icons/fa";
import { CARD_CONSTANTS, defaultBgColour, brandTokens } from "defaults";
import { formatNumber, formatValueWithUnit } from "utils";
import {
  parseTimeValue,
  parseTickInterval,
  formatTimeValue,
  buildTimeTicks,
  isClockTime,
  resolveColourToken,
  bandToneColour,
  normaliseRanges,
} from "./lineChartTime";
const { CARD_WIDTH, PADDING, TOGGLE_BUTTON_WIDTH, TOGGLE_BUTTON_HEIGHT } =
  CARD_CONSTANTS;

const getChartUiColors = (theme) => {
  const primary = theme?.primary || defaultBgColour;
  return {
    axisLabel: "var(--text-icon)",
    rankBadge: primary,
    scoreText: "var(--text-icon)",
    grid: "#eee",
    hoverCursor: `${primary}14`,
    comparator: "#767676",
    guideStroke: primary,
    tableBorder: primary,
    tableDivider: primary,
    subtleText: "var(--text-icon)",
    areaFill: `${primary}40`,
  };
};

const Section = styled.section`
  margin: 0;

  .recharts-default-legend {
    margin: 0 !important;
    padding: 0 !important;
  }

  .recharts-legend-item,
  li.recharts-legend-item {
    font-size: 10px !important;
    line-height: 1.2 !important;
    font-family: var(--font-sans) !important;
  }

  .recharts-legend-item-text {
    font-size: 10px !important;
    line-height: 1.2 !important;
    color: var(--text-icon) !important;
    font-family: var(--font-sans) !important;
  }
`;

const ChartContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 4px;
  font-family: var(--font-sans);
`;

const VisuallyHidden = styled.div`
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

const Title = styled.h3`
  margin: 2px 0 4px;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-icon);
  font-family: "Korto", var(--font-sans);
`;

const AxisLabel = styled.span`
  font-size: 11px;
  color: var(--text-icon);
  line-height: 1.2;
  font-family: var(--font-sans);
`;

// Ranking display element for the ranking table
const RankBadge = styled.span`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 32px;
  height: 24px;
  padding: 0 6px;
  background: ${props => props.$isBottom ? "#fff8e1" : "#e8eaf6"};
  color: ${props => props.$isBottom ? "#e65100" : "#3f51b5"};
  border: 1px solid ${props => props.$isBottom ? "#ffe082" : "#c5cae9"};
  border-radius: 12px;
  font-size: 11px;
  font-weight: 700;
  margin-right: 8px;
  font-family: var(--font-family-base);
  
  svg {
    margin-right: 2px;
    font-size: 10px;
  }
`;

const NameCell = styled.td`
  color: ${({ theme }) => theme?.colors?.text || "var(--text-icon)"};
  font-weight: 500;
  padding: 4px 0;
  font-family: var(--font-family-base);
`;

const ScoreCell = styled.td`
  font-weight: bold;
  color: var(--text-icon);
  text-align: right;
  padding: 4px 0;
  font-family: var(--font-family-base);
`;

const RowTr = styled.tr`
  &.row-enter {
    opacity: 0;
    transform: translateY(-10px);
  }
  &.row-enter-active {
    opacity: 1;
    transform: translateY(0);
    transition: opacity 0.3s, transform 0.3s;
  }
  &.row-exit {
    opacity: 1;
    transform: translateY(0);
  }
  &.row-exit-active {
    opacity: 0;
    transform: translateY(10px);
    transition: opacity 0.3s, transform 0.3s;
  }
  td {
    transition: background-color 0.15s ease;
  }
  ${props => props.$clickable && css`
    cursor: pointer;
    &:hover td, &:focus-visible td {
      background-color: #f0f4f8;
    }
    &:focus-visible {
      outline: 2px solid #7317de;
      outline-offset: -2px;
    }
  `}
`;

/**
 * Styled component for the toggle button.
 */
const ToggleButton = styled.button`
  z-index: 1001;
  width: ${TOGGLE_BUTTON_WIDTH}px;
  height: ${TOGGLE_BUTTON_HEIGHT}px;
  background-color: ${defaultBgColour};
  color: white;
  border: none;
  border-radius: 5px;
  padding: 0;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: right 0.3s ease-in-out;
`;

const RotatingIcon = styled(FaChevronDown)`
  transition: transform 0.3s;
  transform: ${({ $isOpen }) => ($isOpen ? "rotate(180deg)" : "rotate(0deg)")};
`;

/**
 * Centralized chart configuration defaults
 * @constant {Object}
 */
const DEFAULTS = {
  DIMENSIONS: {
    baseHeight: 220,
    pieSize: 220,
    xAngle: -45,
    tickFontSize: 10,
    yAxisWidth: 50,
    xAxisMinHeight: 30,
    avgCharWidth: 6,
  },
  GRID: { stroke: "#eee", vertical: false },
  MARGIN: { top: 4, right: 8, bottom: 2, left: 4 },
};

/**
 * Default color palette for chart series (matches nssec pie legend)
 * @constant {Array<string>}
 */
const DEFAULT_COLORS = [
  "#4e79a7",
  "#59a14f",
  "#9c755f",
  "#f28e2b",
  "#edc948",
  "#76b7b2",
  "#b07aa1",
  "#e15759",
  "#ff9da7",
  brandTokens.palette.teal,
];

/**
 * Safely extracts a numeric value from data object
 * @param {Object} data - The data object containing values
 * @param {string} key - The key to extract from the data
 * @returns {number} - A finite number or 0 if value is invalid
 */
const getValue = (data, key) => {
  const raw = data?.[key];
  const n = Number(raw ?? 0);
  return Number.isFinite(n) ? n : 0;
};

/**
 * Estimates the vertical space needed for rotated X-axis labels
 * @param {Array} labels - Array of label strings to measure
 * @param {number} angleDeg - Rotation angle in degrees (default: -45)
 * @param {number} fontSize - Font size in pixels (default: 11)
 * @param {number} avgCharWidth - Average character width in pixels (default: 7)
 * @returns {number} - Estimated height in pixels needed for rotated labels
 */
const estimateRotatedLabelBand = (
  labels = [],
  angleDeg = -45,
  fontSize = 11,
  avgCharWidth = 7
) => {
  if (!labels.length) return 30; // default axis height used elsewhere
  const rad = (Math.abs(angleDeg) * Math.PI) / 180;
  const s = Math.sin(rad);
  const c = Math.cos(rad);
  const maxWidth = Math.max(
    0,
    ...labels.map((l) => String(l ?? "").length * avgCharWidth)
  );
  const projected = s * maxWidth + c * fontSize + 2; // minimal padding to avoid extra whitespace
  return Math.max(30, Math.ceil(projected));
};

/**
 * Computes the appropriate X-axis height based on configuration and label dimensions
 * @param {Object} config - Chart configuration object
 * @param {Array} labels - Array of label strings for the X-axis
 * @returns {number} - Calculated height in pixels for the X-axis
 */
const computeXAxisHeight = (config, labels) => {
  const avgCharWidth = Number(
    config?.xLabelAvgCharWidth ?? DEFAULTS.DIMENSIONS.avgCharWidth
  );
  const explicit = Number(config?.xAxisHeight ?? 0) || 0;
  const est = estimateRotatedLabelBand(
    labels,
    DEFAULTS.DIMENSIONS.xAngle,
    DEFAULTS.DIMENSIONS.tickFontSize,
    avgCharWidth
  );
  return Math.max(DEFAULTS.DIMENSIONS.xAxisMinHeight, explicit, est);
};

/**
 * Formats an axis title and unit pair for display.
 * Returns an object with { title, unit } to support line-break rendering on axes.
 *
 * @param {string} [title] - Raw axis title
 * @param {string} [unit] - Unit string
 * @returns {{ title: string, unit: string }} Formatted title and unit
 */
const formatAxisTitleWithUnit = (title, unit) => {
  if (!title) return { title: "", unit: "" };
  if (!unit || unit === "none" || unit === "count") return { title, unit: "" };
  if (title.toLowerCase().includes(unit.toLowerCase())) return { title, unit: "" };
  const formattedUnit = unit.startsWith("/") ? unit : `/ ${unit}`;
  return { title, unit: formattedUnit };
};

/**
 * Viewport-bounded custom tooltip component for Recharts.
 * Measures its bounding rectangle via useLayoutEffect and clamps position so
 * it never renders off screen in any direction.
 */
export const ChartTooltip = ({
  active,
  payload,
  label,
  config = {},
  formatter,
  labelFormatter,
  coordinate,
}) => {
  const theme = useTheme();
  const containerRef = useRef(null);
  const anchorRef = useRef(null);

  const primaryColor =
    theme?.colors?.primary ||
    theme?.primary ||
    defaultBgColour;
  const textColor = theme?.colors?.text || "var(--text-icon)";
  const tooltipFont = '"Open Sans", var(--font-sans), "Segoe UI", Arial, sans-serif';

  React.useLayoutEffect(() => {
    const el = containerRef.current;
    if (!active || !el) return;

    const tooltipRect = el.getBoundingClientRect();
    const padding = 12;
    let targetX = 0;
    let targetY = 0;

    const chartWrapper =
      anchorRef.current?.closest(".recharts-wrapper") ||
      anchorRef.current?.parentElement?.parentElement;

    if (coordinate && chartWrapper) {
      const chartBox = chartWrapper.getBoundingClientRect();
      targetX = chartBox.left + coordinate.x + 12;
      targetY = chartBox.top + coordinate.y + 12;

      // If overflowing right, flip to left of cursor
      if (targetX + tooltipRect.width > window.innerWidth - padding) {
        targetX = chartBox.left + coordinate.x - tooltipRect.width - 12;
      }
      // If overflowing bottom, flip above cursor
      if (targetY + tooltipRect.height > window.innerHeight - padding) {
        targetY = chartBox.top + coordinate.y - tooltipRect.height - 12;
      }
    } else if (anchorRef.current) {
      const anchorRect = anchorRef.current.getBoundingClientRect();
      targetX = anchorRect.left;
      targetY = anchorRect.top;

      if (targetX + tooltipRect.width > window.innerWidth - padding) {
        targetX = window.innerWidth - padding - tooltipRect.width;
      }
      if (targetY + tooltipRect.height > window.innerHeight - padding) {
        targetY = window.innerHeight - padding - tooltipRect.height;
      }
    }

    targetX = Math.max(
      padding,
      Math.min(window.innerWidth - tooltipRect.width - padding, targetX)
    );
    targetY = Math.max(
      padding,
      Math.min(window.innerHeight - tooltipRect.height - padding, targetY)
    );

    el.style.transform = `translate(${targetX}px, ${targetY}px)`;
  });

  if (!active || !payload || !payload.length) return null;

  const unit = config.units && config.units !== "none" ? config.units : "";
  const displayLabel = labelFormatter ? labelFormatter(label) : label;

  const tooltipElement = (
    <div
      ref={containerRef}
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        pointerEvents: "none",
        backgroundColor: "rgba(255, 255, 255, 0.96)",
        border: `1px solid ${primaryColor}`,
        borderRadius: 6,
        padding: "8px 12px",
        boxShadow: "0 4px 12px rgba(0, 0, 0, 0.15)",
        fontSize: 12,
        fontFamily: tooltipFont,
        color: textColor,
        maxWidth: 280,
        zIndex: 99999,
      }}
    >
      {displayLabel && (
        <div style={{ fontWeight: 700, marginBottom: 4, color: primaryColor }}>
          {displayLabel}
        </div>
      )}
      {payload.map((item, i) => {
        const val = item.value;
        const isComparator =
          item.dataKey === (config.comparatorKey || "dmValue") ||
          (config.comparatorLabel && item.name === config.comparatorLabel) ||
          (config.comparatorLabel && item.name === `${config.comparatorLabel} (right)`) ||
          item.name === "DM" ||
          item.name === "DM (right)" ||
          item.name === "Comparator" ||
          item.name === "Comparator (right)" ||
          item.name?.includes("(right)");

        const comparatorUnit =
          config.comparatorUnits || (config.units !== "%" ? config.units : "");

        const itemUnit = isComparator ? comparatorUnit : (item.unit || unit);

        const formattedVal = formatter
          ? formatter(val, item.name, item)
          : formatValueWithUnit(val, itemUnit);

        return (
          <div
            key={`tooltip-item-${i}`}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
              color: textColor,
              marginTop: i > 0 ? 2 : 0,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  backgroundColor:
                    item.color || item.fill || item.stroke || DEFAULTS.BRAND_COLOR,
                  display: "inline-block",
                }}
              />
              <span>{item.name}</span>
            </div>
            <span style={{ fontWeight: 600, color: textColor }}>
              {formattedVal}
            </span>
          </div>
        );
      })}
    </div>
  );

  return (
    <>
      <span
        ref={anchorRef}
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: 0,
          height: 0,
          pointerEvents: "none",
          visibility: "hidden",
        }}
      />
      {typeof document !== "undefined"
        ? createPortal(tooltipElement, document.body)
        : tooltipElement}
    </>
  );
};

/**
 * Shared wrapper component for chart sections with consistent layout.
 * Axis titles are rendered as HTML elements outside the SVG so they sit
 * naturally beside their axis without eating into chart margins.
 *
 * @param {string}  ariaLabel   - Accessibility label for the chart section
 * @param {string}  title       - Optional title to display above the chart
 * @param {number}  height      - Height of the chart container
 * @param {string|object}  xAxisTitle  - Optional label rendered below the X axis
 * @param {string|object}  yAxisTitle  - Optional label rendered beside the Y axis
 * @param {string}  rightYAxisTitle  - Optional label rendered beside the right Y axis
 * @param {React.ReactNode} [description] - Optional visually hidden content describing the chart
 * @param {string} [descriptionId] - Id for the description, referenced by aria-describedby
 * @param {React.ReactNode} children - Chart components to render inside
 * @returns {JSX.Element}
 */
const ChartSection = ({
  ariaLabel,
  title,
  height,
  xAxisTitle,
  yAxisTitle,
  rightYAxisTitle,
  description,
  descriptionId,
  children,
}) => {
  const yAxisObj =
    typeof yAxisTitle === "object" && yAxisTitle !== null
      ? yAxisTitle
      : { title: yAxisTitle, unit: "" };
  const rightYAxisObj =
    typeof rightYAxisTitle === "object" && rightYAxisTitle !== null
      ? rightYAxisTitle
      : { title: rightYAxisTitle, unit: "" };
  const xAxisObj =
    typeof xAxisTitle === "object" && xAxisTitle !== null
      ? xAxisTitle
      : { title: xAxisTitle, unit: "" };

  return (
    <Section
      aria-label={ariaLabel}
      aria-describedby={description && descriptionId ? descriptionId : undefined}
    >
      {title && <Title>{title}</Title>}
      <div style={{ display: "flex", alignItems: "stretch" }}>
        {yAxisObj.title && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
              width: yAxisObj.unit ? 24 : 16,
              marginRight: 6,
            }}
          >
            <AxisLabel
              style={{
                transform: "rotate(-90deg)",
                whiteSpace: "nowrap",
                textAlign: "center",
                display: "inline-flex",
                flexDirection: "column",
                alignItems: "center",
                lineHeight: 1.15,
              }}
            >
              <span>{yAxisObj.title}</span>
              {yAxisObj.unit && (
                <span style={{ fontSize: "10px", opacity: 0.85 }}>
                  {yAxisObj.unit}
                </span>
              )}
            </AxisLabel>
          </div>
        )}
        <div style={{ flex: 1, minWidth: 0, height }}>
          <ResponsiveContainer>{children}</ResponsiveContainer>
        </div>
        {rightYAxisObj.title && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
              width: rightYAxisObj.unit ? 24 : 16,
              marginLeft: 6,
            }}
          >
            <AxisLabel
              style={{
                transform: "rotate(90deg)",
                whiteSpace: "nowrap",
                textAlign: "center",
                display: "inline-flex",
                flexDirection: "column",
                alignItems: "center",
                lineHeight: 1.15,
              }}
            >
              <span>{rightYAxisObj.title}</span>
              {rightYAxisObj.unit && (
                <span style={{ fontSize: "10px", opacity: 0.85 }}>
                  {rightYAxisObj.unit}
                </span>
              )}
            </AxisLabel>
          </div>
        )}
      </div>
      {xAxisObj.title && (
        <AxisLabel
          style={{
            display: "block",
            textAlign: "center",
            marginTop: 2,
          }}
        >
          <span>{xAxisObj.title}</span>
          {xAxisObj.unit && (
            <span style={{ display: "block", fontSize: "10px", opacity: 0.85 }}>
              {xAxisObj.unit}
            </span>
          )}
        </AxisLabel>
      )}
      {description && (
        <VisuallyHidden id={descriptionId}>{description}</VisuallyHidden>
      )}
    </Section>
  );
};

/**
 * Default formatting functions for chart values
 * @constant {Object}
 */
const defaultFormatters = {
  commify: (v) => {
    const n = Number(v ?? 0);
    return Number.isFinite(n) ? formatNumber(n, { stripTrailingZeroes: true }) : String(v ?? "");
  },
  percent: (value, data, keys) => {
    const total = (keys || Object.keys(data || {})).reduce(
      (acc, k) => acc + getValue(data, k),
      0
    );
    const num = Number(value ?? 0);
    return total > 0 ? `${((num / total) * 100).toFixed(1)}%` : "0.0%";
  },
};

// Function to wrap long labels into multiple lines after a certain length and a space
export const wrapLabel = (label, maxLen = 26) => {
  const str = String(label || "").trim();
  if (str.length <= maxLen) return str;
  const words = str.split(" ");
  let lines = [];
  let currentLine = "";
  words.forEach((word) => {
    if (currentLine && (currentLine + " " + word).length > maxLen) {
      lines.push(currentLine.trim());
      currentLine = word;
    } else {
      currentLine = currentLine ? currentLine + " " + word : word;
    }
  });
  if (currentLine) lines.push(currentLine.trim());
  return lines.join("\n");
};

/**
 * Shared tick component for category axes.
 * Handles both wrapped multi-line Y-axis labels and rotated X-axis labels consistently.
 */
const CategoryTick = ({ x, y, payload, angle = 0 }) => {
  if (angle !== 0) {
    // For rotated X-axis labels, don't overly truncate since they have diagonal space
    const label = String(payload.value || "");
    const displayLabel = label.length > 25 ? label.slice(0, 25) + "…" : label;
    return (
      <text
        x={x}
        y={y}
        dy={16}
        textAnchor="end"
        fontSize={DEFAULTS.DIMENSIONS.tickFontSize}
        transform={`rotate(${angle}, ${x}, ${y})`}
      >
        {displayLabel}
      </text>
    );
  }

  // For vertical Y-axis labels, wrap text into multiple lines
  const lines = wrapLabel(payload.value, 26).split("\n");
  const fontSize = DEFAULTS.DIMENSIONS.tickFontSize;
  const lineHeight = fontSize + 2;
  const startY = y - ((lines.length - 1) * lineHeight) / 2;

  return (
    <text
      x={x}
      y={startY}
      textAnchor="end"
      fontSize={fontSize}
      fill="#444"
    >
      {lines.map((line, i) => (
        <tspan x={x - 4} dy={i === 0 ? 3 : lineHeight} key={i}>
          {line}
        </tspan>
      ))}
    </text>
  );
};

/**
 * Transforms configuration columns and data into series format for Recharts
 * @param {Object} config - Chart configuration containing columns definition
 * @param {Object} data - Raw data object with values
 * @param {Object} [options]
 * @param {boolean} [options.keepNulls] - Keep null/undefined values as null instead of 0
 * @returns {Array} - Array of series objects with key, label, value, color, and title
 */
const toSeries = (config, data, { keepNulls = false } = {}) =>
  (config.columns || []).map((col, idx) => ({
    key: col.key,
    label: col.label ?? col.key,
    value:
      keepNulls && (data?.[col.key] === null || data?.[col.key] === undefined)
        ? null
        : getValue(data, col.key),
    color: col.color || DEFAULT_COLORS[idx % DEFAULT_COLORS.length],
    title: col.title,
  }));

/**
 * Transforms a time-series array (e.g. [{year, value}, ...]) into chart items.
 * Used for line charts plotting continuous data over time, as opposed to
 * toSeries which handles a fixed set of category columns.
 *
 * @param {Array<{year: number|string, value: number}>} data - Array of time-series points
 * @param {string} [xKey] - Field holding the x value (default: "year")
 * @returns {Array} - Array of series objects with label and value
 */
const toTimeSeries = (data, xKey) =>
  (data || []).map((point) => ({
    label: String(xKey ? point[xKey] ?? point.label ?? point.year : point.year),
    value: point.value,
    dmValue: point.dmValue ?? null,
  }));

/**
 * Renders a responsive bar chart using Recharts
 * @param {Object} props - Component props
 * @param {Object} props.config - Chart configuration object
 * @param {Object} props.data - Data object containing values to chart
 * @param {Object} props.formatters - Custom formatting functions for values
 * @param {Object} props.type - Value that defines whether the graph will be horizontal or vertical
 * @returns {JSX.Element} - Bar chart component with X/Y axes, grid, and tooltip
 */
const BarChart = ({
  config,
  data,
  formatters,
  type = "horizontal",
  chartUiColors,
  brandColor,
}) => {
  const items = React.useMemo(() => toSeries(config, data), [config, data]);
  const formatter = (val) => {
    const n = Number(val);
    return Number.isFinite(n) ? formatNumber(n, { stripTrailingZeroes: true }) : "";
  };

  const dynamicHeight = React.useMemo(() => {
    if (type === "vertical") {
      const maxLines = Math.max(
        1,
        ...items.map((i) => wrapLabel(i.label || "", 26).split("\n").length)
      );
      const rowHeight = maxLines > 1 ? 26 : 22;
      const computed = items.length * rowHeight + 32;
      return config.height ? Math.max(config.height, computed) : Math.max(80, computed);
    }
    return config.height ?? DEFAULTS.DIMENSIONS.baseHeight;
  }, [config.height, type, items]);

  const resolvedXAxisTitle = React.useMemo(
    () => (type === "vertical" ? formatAxisTitleWithUnit(config.x_axis_title, config.units) : config.x_axis_title),
    [type, config.x_axis_title, config.units]
  );
  const resolvedYAxisTitle = React.useMemo(
    () => (type === "vertical" ? config.y_axis_title : formatAxisTitleWithUnit(config.y_axis_title, config.units)),
    [type, config.y_axis_title, config.units]
  );

  const xAxisHeight = React.useMemo(
    () =>
      computeXAxisHeight(
        config,
        items.map((i) => i.label)
      ),
    [config, items]
  );

  const hasNegative = items.some((i) => Number(i.value) < 0);
  const hasPositive = items.some((i) => Number(i.value) > 0);
  const dataDomain = hasNegative && hasPositive ? ['auto', 'auto'] : hasNegative ? ['auto', 0] : [0, 'auto'];

  const yCategoryWidth = React.useMemo(() => {
    if (type !== "vertical") return 0;
    const maxLineLength = Math.max(1, ...items.map(i => {
      const lines = wrapLabel(i.label || "", 26).split("\n");
      return Math.max(...lines.map(l => l.length));
    }));
    return Math.max(45, Math.min(135, Math.ceil(maxLineLength * 5.2) + 6));
  }, [items, type]);

  return (
    <ChartSection
      ariaLabel={config.ariaLabel || "Bar chart"}
      title={config.title}
      height={dynamicHeight}
      xAxisTitle={resolvedXAxisTitle}
      yAxisTitle={resolvedYAxisTitle}
    >
      <RBarChart
        data={items}
        margin={type === "vertical" ? { top: 4, right: 8, bottom: 2, left: 4 } : DEFAULTS.MARGIN}
        barCategoryGap={6}
        barGap={2}
        layout={type === "horizontal" ? "horizontal" : "vertical"}
      >
        <RCartesianGrid {...DEFAULTS.GRID} />
        {type === "vertical" ? (
          <>
            <RXAxis
              type="number"
              domain={dataDomain}
              allowDecimals={false}
              tickCount={6}
              tickFormatter={formatter}
              tick={{ fontSize: DEFAULTS.DIMENSIONS.tickFontSize }}
            />
            <RYAxis
              type="category"
              dataKey="label"
              width={yCategoryWidth}
              tick={<CategoryTick />}
              tickLine={false}
              interval={0}
            />
          </>
        ) : (
          <>
            <RXAxis
              dataKey="label"
              angle={DEFAULTS.DIMENSIONS.xAngle}
              textAnchor="end"
              height={xAxisHeight}
              interval={0}
              tick={{ fontSize: DEFAULTS.DIMENSIONS.tickFontSize }}
            />
            <RYAxis
              domain={dataDomain}
              allowDecimals={false}
              tickFormatter={formatter}
              tick={{ fontSize: DEFAULTS.DIMENSIONS.tickFontSize }}
              width={DEFAULTS.DIMENSIONS.yAxisWidth}
            />
          </>
        )}
        <RTooltip
          content={<ChartTooltip config={config} formatter={formatters?.tooltipFormatter} />}
          cursor={{ fill: chartUiColors.hoverCursor }}
          wrapperStyle={{ zIndex: 9999, pointerEvents: "none" }}
        />
        <RBar dataKey="value" name="Value" barSize={type === "vertical" ? 14 : undefined}>
          {items.map((entry, idx) => (
            <RCell
              key={`cell-${idx}`}
              fill={(config.colors && config.colors[entry.label]) || brandColor}
            />
          ))}
        </RBar>
      </RBarChart>
    </ChartSection>
  );
};

/**
 * Renders a responsive multiple bar chart using Recharts
 * @param {Object} props - Component props
 * @param {Object} props.config - Chart configuration object
 * @param {Object} props.data - Data object containing values to chart
 * @param {Object} props.formatters - Custom formatting functions for values
 * @param {Object} props.type - Value that defines whether the graph will be horizontal or vertical
 * @returns {JSX.Element} - Bar chart component with X/Y axes, grid, and tooltip
 */
const BarChartMultiple = ({
  config,
  data,
  formatters,
  type = "horizontal",
  chartUiColors,
}) => {
  const items = React.useMemo(() => data, [data]);
  const formatter = (val) => {
    const n = Number(val);
    return Number.isFinite(n) ? formatNumber(n, { stripTrailingZeroes: true }) : "";
  };

  const dynamicHeight = React.useMemo(() => {
    if (type === "vertical") {
      const numCols = config.columns?.length || 1;
      const perColHeight = numCols * 14;
      const maxLines = Math.max(
        1,
        ...items.map((i) => wrapLabel(i[config.xKey || "label"] || "", 26).split("\n").length)
      );
      const rowHeight = Math.max(26, perColHeight + 8, maxLines * 12 + 8);
      const computed = items.length * rowHeight + 35;
      return config.height ? Math.max(config.height, computed) : Math.max(80, computed);
    }
    return config.height ?? DEFAULTS.DIMENSIONS.baseHeight;
  }, [config.height, type, config.columns, items, config.xKey]);

  const resolvedXAxisTitle = React.useMemo(
    () => (type === "vertical" ? formatAxisTitleWithUnit(config.x_axis_title, config.units) : config.x_axis_title),
    [type, config.x_axis_title, config.units]
  );
  const resolvedYAxisTitle = React.useMemo(
    () => (type === "vertical" ? config.y_axis_title : formatAxisTitleWithUnit(config.y_axis_title, config.units)),
    [type, config.y_axis_title, config.units]
  );

  const yTickFormatter = (val) => {
    const n = Number(val);
    return Number.isFinite(n) ? formatNumber(n, { stripTrailingZeroes: true }) : "";
  };

  const hasNegative = items.some((i) => config.columns.some((c) => Number(i[c.key]) < 0));
  const hasPositive = items.some((i) => config.columns.some((c) => Number(i[c.key]) > 0));
  const dataDomain = hasNegative && hasPositive ? ['auto', 'auto'] : hasNegative ? ['auto', 0] : [0, 'auto'];

  const yCategoryWidth = React.useMemo(() => {
    if (type !== "vertical") return 0;
    const maxLineLength = Math.max(1, ...items.map(i => {
      const lines = wrapLabel(i[config.xKey || "label"] || "", 26).split("\n");
      return Math.max(...lines.map(l => l.length));
    }));
    return Math.max(45, Math.min(135, Math.ceil(maxLineLength * 5.2) + 6));
  }, [items, type, config]);

  return (
    <ChartSection
      ariaLabel={config.ariaLabel || "Bar chart"}
      title={config.title}
      height={dynamicHeight}
      xAxisTitle={resolvedXAxisTitle}
      yAxisTitle={resolvedYAxisTitle}
    >
      <RBarChart
        data={items}
        margin={type === "vertical" ? { top: 4, right: 8, bottom: 2, left: 4 } : DEFAULTS.MARGIN}
        barCategoryGap={6}
        barGap={2}
        layout={type === "horizontal" ? "horizontal" : "vertical"}
      >
        <RCartesianGrid {...DEFAULTS.GRID} />
        {type === "vertical" ? (
          <>
            <RXAxis
              type="number"
              domain={dataDomain}
              allowDecimals={false}
              tickFormatter={formatter}
              tick={{ fontSize: DEFAULTS.DIMENSIONS.tickFontSize }}
            />
            <RYAxis
              type="category"
              dataKey={config.xKey || "label"}
              width={yCategoryWidth}
              tick={<CategoryTick />}
              tickLine={false}
              interval={0}
            />
          </>
        ) : (
          <>
            <RXAxis
              dataKey={config.xKey || "label"}
              tick={<CategoryTick angle={-45} />}
              interval={0}
            />
            <RYAxis
              domain={dataDomain}
              allowDecimals={false}
              tickFormatter={yTickFormatter}
              width={DEFAULTS.DIMENSIONS.yAxisWidth}
            />
          </>
        )}
        <RTooltip
          content={<ChartTooltip config={config} formatter={formatters?.tooltipFormatter} />}
          cursor={{ fill: chartUiColors.hoverCursor }}
          wrapperStyle={{ zIndex: 9999, pointerEvents: "none" }}
        />
        <RLegend
          verticalAlign="top"
          align="center"
          wrapperStyle={{ fontSize: DEFAULTS.DIMENSIONS.tickFontSize, paddingBottom: 10 }}
          formatter={(value) => (
            <span
              style={{
                fontSize: DEFAULTS.DIMENSIONS.tickFontSize,
                fontFamily: "var(--font-sans)",
                color: "var(--text-icon)",
              }}
            >
              {value}
            </span>
          )}
        />
        {config.columns.map((col, idx) => (
          <RBar
            key={col.key}
            dataKey={col.key}
            name={col.label}
            fill={(config.colors && config.colors[col.key]) || DEFAULT_COLORS[idx % DEFAULT_COLORS.length]}
            barSize={type === "vertical" ? (config.columns?.length > 1 ? 10 : 14) : (DEFAULTS.BAR_SIZE || 24)}
            isAnimationActive={false}
          />
        ))}
      </RBarChart>
    </ChartSection>
  );
};

/**
 * Candidate tick intervals used when a time axis has no `tickInterval`.
 * @constant {Array<number>}
 */
const AUTO_TIME_INTERVALS = [
  15, 30, 60, 120, 180, 360, 720, 1440, 2880, 10080,
].map((minutes) => minutes * 60 * 1000);

/**
 * Returns true when a line chart config uses any of the time axis, gap or
 * band options. Charts without them render exactly as before.
 * @param {Object} config
 * @returns {boolean}
 */
const hasLineEnhancements = (config) =>
  config?.xAxis?.type === "time" ||
  (Array.isArray(config?.bands) && config.bands.length > 0) ||
  (Array.isArray(config?.gaps) && config.gaps.length > 0);

/**
 * Shared preparation for the optional `xAxis: { type: "time" }`, `bands`
 * and `gaps` config on `line` and `multiple_line` charts.
 *
 * @param {Object} config - Chart configuration
 * @param {Array} items - Rows to plot
 * @param {string} xKey - Field holding the x value in each row
 * @param {Object} theme - styled-components theme
 * @param {string|number} [yAxisId] - Y axis the bands and gaps are drawn against
 * @returns {Object} Data, axis props and overlay elements for the chart
 */
const useLineChartEnhancements = (config, items, xKey, theme, yAxisId) => {
  const reactId = React.useId();
  const idBase = `vc-line-${reactId.replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const xAxisConfig = config.xAxis || {};
  const isTime = xAxisConfig.type === "time";

  const timeData = React.useMemo(() => {
    if (!isTime) return null;
    const rows = (items || [])
      .map((row) => ({ ...row, __x: parseTimeValue(row[xKey]) }))
      .filter((row) => row.__x !== null)
      .sort((a, b) => a.__x - b.__x);
    const firstRaw = (items || []).find(
      (row) => row[xKey] !== null && row[xKey] !== undefined
    )?.[xKey];
    const clock = isClockTime(firstRaw);
    const utc = clock || xAxisConfig.utc === true;
    const xs = rows.map((r) => r.__x);
    const [domainFrom, domainTo] = Array.isArray(xAxisConfig.domain)
      ? xAxisConfig.domain.map(parseTimeValue)
      : [null, null];
    const min = domainFrom ?? (xs.length ? Math.min(...xs) : 0);
    const max = domainTo ?? (xs.length ? Math.max(...xs) : 0);
    const span = max - min;
    const format =
      xAxisConfig.format || (clock || span <= 24 * 60 * 60 * 1000 ? "HH:mm" : "DD/MM HH:mm");
    const tooltipFormat =
      xAxisConfig.tooltipFormat || (clock ? "HH:mm" : "DD/MM/YYYY HH:mm");
    const interval =
      parseTickInterval(xAxisConfig.tickInterval) ||
      AUTO_TIME_INTERVALS.find((ms) => span / ms <= 8) ||
      AUTO_TIME_INTERVALS[AUTO_TIME_INTERVALS.length - 1];
    const ticks = buildTimeTicks(min, max, interval, { utc });
    const formatOptions = { clock, utc };
    return {
      rows,
      min,
      max,
      ticks,
      formatTick: (v) => formatTimeValue(Number(v), format, formatOptions),
      formatLabel: (v) =>
        v === null || v === undefined || v === ""
          ? ""
          : formatTimeValue(Number(v), tooltipFormat, formatOptions),
    };
  }, [isTime, items, xKey, xAxisConfig]);

  const bands = React.useMemo(
    () => normaliseRanges(config.bands, isTime),
    [config.bands, isTime]
  );
  const gaps = React.useMemo(
    () => normaliseRanges(config.gaps, isTime),
    [config.gaps, isTime]
  );

  const textColour = theme?.colors?.text || "var(--text-icon)";
  const warningColour = resolveColourToken("warning", theme);
  const hatchId = `${idBase}-hatch`;
  const labelStyle = { fontSize: DEFAULTS.DIMENSIONS.tickFontSize };
  const formatRangeValue = (v) => (isTime ? timeData.formatLabel(v) : String(v));

  const overlays = [];
  if (gaps.length) {
    overlays.push(
      <defs key="vc-gap-defs">
        <pattern
          id={hatchId}
          width="6"
          height="6"
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(45)"
        >
          <line
            x1="0"
            y1="0"
            x2="0"
            y2="6"
            stroke={warningColour}
            strokeWidth="1.5"
            strokeOpacity="0.45"
          />
        </pattern>
      </defs>
    );
  }
  bands.forEach((band, i) => {
    const tone = ["accent", "muted", "warning"].includes(band.tone)
      ? band.tone
      : "accent";
    overlays.push(
      <RReferenceArea
        key={`vc-band-${i}`}
        className="vc-line-band"
        yAxisId={yAxisId}
        x1={band.x1}
        x2={band.x2}
        fill={bandToneColour(tone, theme)}
        fillOpacity={tone === "muted" ? 0.6 : 0.15}
        strokeOpacity={0}
        ifOverflow="hidden"
        label={
          band.label
            ? { value: band.label, position: "top", fill: textColour, ...labelStyle }
            : undefined
        }
      />
    );
  });
  gaps.forEach((gap, i) => {
    overlays.push(
      <RReferenceArea
        key={`vc-gap-${i}`}
        className="vc-line-gap"
        yAxisId={yAxisId}
        x1={gap.x1}
        x2={gap.x2}
        fill={`url(#${hatchId})`}
        fillOpacity={1}
        stroke={warningColour}
        strokeOpacity={0.6}
        strokeDasharray="3 3"
        ifOverflow="hidden"
        label={
          gap.label
            ? { value: gap.label, position: "top", fill: warningColour, ...labelStyle }
            : undefined
        }
      />
    );
  });

  const descriptionId = `${idBase}-ranges`;
  const description =
    bands.length || gaps.length ? (
      <ul aria-label="Highlighted ranges">
        {bands.map((band, i) => (
          <li key={`band-${i}`}>
            {`Shaded band: ${band.label || "Highlighted range"}, ${formatRangeValue(
              band.x1
            )} to ${formatRangeValue(band.x2)}`}
          </li>
        ))}
        {gaps.map((gap, i) => (
          <li key={`gap-${i}`}>
            {`Missing data: ${gap.label || "No data"}, ${formatRangeValue(
              gap.x1
            )} to ${formatRangeValue(gap.x2)}`}
          </li>
        ))}
      </ul>
    ) : null;

  const xAxisProps = isTime
    ? {
        dataKey: "__x",
        type: "number",
        scale: "linear",
        domain: [timeData.min, timeData.max],
        ticks: timeData.ticks,
        tickFormatter: timeData.formatTick,
        interval: 0,
        angle: 0,
        textAnchor: "middle",
        height: DEFAULTS.DIMENSIONS.xAxisMinHeight,
        allowDataOverflow: true,
      }
    : null;

  const hasRangeLabels = [...bands, ...gaps].some((r) => r.label);

  return {
    enabled: hasLineEnhancements(config),
    data: isTime ? timeData.rows : items,
    xAxisProps,
    overlays,
    description,
    descriptionId,
    topMargin: hasRangeLabels ? 16 : null,
    // Leave room for the last time tick label, which sits on the plot edge.
    rightMargin: isTime ? 16 : null,
    // Range labels sit above the plot, so the legend moves below it.
    legendAlign: hasRangeLabels ? "bottom" : "top",
    labelFormatter: isTime ? timeData.formatLabel : undefined,
  };
};

/**
 * Renders a responsive line chart using Recharts
 * @param {Object} props - Component props
 * @param {Object} props.config - Chart configuration object
 * @param {string} [props.config.x_axis_title] - Optional X axis label
 * @param {string} [props.config.y_axis_title] - Optional Y axis label
 * @param {string} [props.config.primaryLabel] - Label for the primary line (default: "Value")
 * @param {string} [props.config.comparatorKey] - Data key for the comparator line (default: "dmValue")
 * @param {string} [props.config.comparatorLabel] - Label for the comparator line (default: "Comparator")
 * @param {string} [props.config.comparatorColor] - Stroke colour for the comparator line (default: brand grey)
 * @param {string} [props.config.lineColor] - Stroke colour for the primary line (hex or theme token name)
 * @param {string} [props.config.xKey] - Field holding the x value on a time axis (default: "time", then "label", then "year")
 * @param {Object} [props.config.xAxis] - Optional `{ type: "time", format, tickInterval, domain, tooltipFormat, utc }`
 * @param {boolean} [props.config.connectNulls] - Draw lines across null values (default: false)
 * @param {Array} [props.config.bands] - Optional shaded ranges `{ from, to, label, tone }`
 * @param {Array} [props.config.gaps] - Optional missing-data ranges `{ from, to, label }`
 * @param {Array} [props.config.series] - Optional `[{ colour }]` for the primary and comparator lines
 * @param {Object} props.data - Data object containing values to chart
 * @param {Object} props.formatters - Custom formatting functions for values
 * @returns {JSX.Element} - Line chart component with X/Y axes, grid, and tooltip
 */
const LineSeriesChart = ({ config, data, formatters, chartUiColors, brandColor }) => {
  const theme = useTheme();
  const isTimeAxis = config.xAxis?.type === "time";
  const items = React.useMemo(
    () =>
      Array.isArray(data)
        ? toTimeSeries(data, isTimeAxis ? config.xKey || "time" : undefined)
        : toSeries(config, data, { keepNulls: config.connectNulls === false }),
    [config, data, isTimeAxis]
  );
  const enhanced = useLineChartEnhancements(config, items, "label", theme, "left");
  const height = config.height ?? DEFAULTS.DIMENSIONS.baseHeight;
  const stroke =
    resolveColourToken(
      config.lineColor || config.series?.[0]?.colour || config.series?.[0]?.color,
      theme
    ) || brandColor;

  const comparatorKey = config.comparatorKey || "dmValue";
  const comparatorLabel = config.comparatorLabel || "Comparator";
  const primaryLabel = config.primaryLabel || "Value";
  const comparatorStroke =
    resolveColourToken(
      config.comparatorColor || config.series?.[1]?.colour || config.series?.[1]?.color,
      theme
    ) || chartUiColors?.comparator || "#767676";

  const [hiddenSeries, setHiddenSeries] = React.useState({});
  const toggleSeries = (e) => {
    if (!e.dataKey) return;
    setHiddenSeries((prev) => ({
      ...prev,
      [e.dataKey]: !prev[e.dataKey],
    }));
  };

  const formatter = (val) => {
    const n = Number(val);
    return Number.isFinite(n) ? formatNumber(n, { stripTrailingZeroes: true }) : "";
  };

  const primaryFormatter = (val) => {
    const str = formatter(val);
    const unit = config.units && config.units !== "none" ? config.units : "";
    if (str && unit) {
      return str + unit;
    }
    return str;
  };

  const xAxisHeight = React.useMemo(
    () =>
      computeXAxisHeight(
        config,
        items.map((i) => i.label)
      ),
    [config, items]
  );

  const hasComparator = items.some(
    (i) => i[comparatorKey] !== null && i[comparatorKey] !== undefined
  );

  const finalPrimaryLabel = hasComparator ? primaryLabel : (config.title || "Value");
  const legendPrimaryLabel = hasComparator ? `${finalPrimaryLabel} (left)` : finalPrimaryLabel;
  const legendComparatorLabel = `${comparatorLabel} (right)`;

  const resolvedYAxisTitle = React.useMemo(
    () => formatAxisTitleWithUnit(config.y_axis_title, config.units),
    [config.y_axis_title, config.units]
  );

  const comparatorUnit =
    config.comparatorUnits || (config.units !== "%" ? config.units : "");

  const resolvedRightYAxisTitle = React.useMemo(
    () =>
      hasComparator
        ? formatAxisTitleWithUnit(comparatorLabel, comparatorUnit)
        : null,
    [hasComparator, comparatorLabel, comparatorUnit]
  );

  const maxLeftTickLen = React.useMemo(() => {
    const vals = items.map((i) => i.value).filter((v) => v !== null && v !== undefined && !isNaN(Number(v)));
    if (!vals.length) return 3;
    const maxVal = Math.max(...vals.map((v) => Math.abs(Number(v))));
    const formatted = formatter(maxVal);
    return Math.max(3, formatted.length);
  }, [items]);

  const leftYAxisWidth = Math.max(26, Math.min(52, maxLeftTickLen * 6.2 + 6));

  const maxRightTickLen = React.useMemo(() => {
    if (!hasComparator) return 0;
    const vals = items.map((i) => i[comparatorKey]).filter((v) => v !== null && v !== undefined && !isNaN(Number(v)));
    if (!vals.length) return 3;
    const maxVal = Math.max(...vals.map((v) => Math.abs(Number(v))));
    const formatted = formatter(maxVal);
    return Math.max(3, formatted.length);
  }, [items, hasComparator, comparatorKey]);

  const rightYAxisWidth = hasComparator
    ? Math.max(26, Math.min(52, maxRightTickLen * 6.2 + 6))
    : 0;

  const chartMargin = React.useMemo(
    () => ({
      top: enhanced.topMargin ?? 6,
      right: enhanced.rightMargin ?? (hasComparator ? 6 : 8),
      bottom: 2,
      left: 4,
    }),
    [hasComparator, enhanced.topMargin, enhanced.rightMargin]
  );

  return (
    <ChartSection
      ariaLabel={
        config.ariaLabel || (enhanced.enabled && config.title) || "Line chart"
      }
      title={config.title}
      height={height}
      xAxisTitle={config.x_axis_title}
      yAxisTitle={resolvedYAxisTitle}
      rightYAxisTitle={resolvedRightYAxisTitle}
      description={enhanced.description}
      descriptionId={enhanced.descriptionId}
    >
      <RLineChart data={enhanced.data} margin={chartMargin}>
        <RCartesianGrid {...DEFAULTS.GRID} />
        {enhanced.overlays}
        <RXAxis
          dataKey="label"
          angle={DEFAULTS.DIMENSIONS.xAngle}
          textAnchor="end"
          height={xAxisHeight}
          interval={Array.isArray(data) ? Math.max(0, Math.ceil(items.length / 8) - 1) : 0}
          tick={{ fontSize: DEFAULTS.DIMENSIONS.tickFontSize }}
          {...enhanced.xAxisProps}
        />
        <RYAxis
          yAxisId="left"
          allowDecimals={true}
          tickFormatter={formatter}
          tick={{ fontSize: DEFAULTS.DIMENSIONS.tickFontSize }}
          width={leftYAxisWidth}
          tickMargin={4}
        />
        {hasComparator && (
          <RYAxis
            yAxisId="right"
            orientation="right"
            allowDecimals={true}
            tickFormatter={formatter}
            tick={{ fontSize: DEFAULTS.DIMENSIONS.tickFontSize }}
            width={rightYAxisWidth}
            tickMargin={4}
          />
        )}
        <RTooltip
          content={<ChartTooltip config={config} labelFormatter={enhanced.labelFormatter} />}
          cursor={{ stroke: chartUiColors.guideStroke, strokeDasharray: "3 3" }}
          wrapperStyle={{ zIndex: 9999, pointerEvents: "none" }}
        />
        {hasComparator && (
          <RLegend
            verticalAlign={enhanced.legendAlign}
            align="center"
            wrapperStyle={{
              fontSize: DEFAULTS.DIMENSIONS.tickFontSize,
              cursor: "pointer",
              ...(enhanced.legendAlign === "bottom" ? { paddingTop: 6 } : { paddingBottom: 10 }),
            }}
            formatter={(value) => (
              <span
                style={{
                  fontSize: DEFAULTS.DIMENSIONS.tickFontSize,
                  fontFamily: "var(--font-sans)",
                  color: "var(--text-icon)",
                }}
              >
                {value}
              </span>
            )}
            onClick={toggleSeries}
          />
        )}
        <RLine
          yAxisId="left"
          type="monotone"
          dataKey="value"
          name={legendPrimaryLabel}
          stroke={stroke}
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 4 }}
          legendType="line"
          connectNulls={config.connectNulls ?? false}
          hide={hiddenSeries["value"]}
          strokeOpacity={hiddenSeries["value"] ? 0.3 : 1}
        />
        {hasComparator && (
          <RLine
            yAxisId="right"
            type="monotone"
            dataKey={comparatorKey}
            name={legendComparatorLabel}
            stroke={comparatorStroke}
            strokeWidth={2}
            strokeDasharray="5 5"
            dot={false}
            activeDot={{ r: 4 }}
            legendType="line"
            connectNulls={config.connectNulls ?? false}
            hide={hiddenSeries[comparatorKey]}
            strokeOpacity={hiddenSeries[comparatorKey] ? 0.3 : 1}
          />
        )}
      </RLineChart>
    </ChartSection>
  );
};

/**
 * Renders a responsive multiple line chart using Recharts
 * @param {Object} props - Component props
 * @param {Object} props.config - Chart configuration object
 * @param {Object} props.data - Data object containing values to chart
 * @param {Object} props.formatters - Custom formatting functions for values
 * @param {Array} [props.config.columns] - Series `{ key, label, color|colour }`; `series` is accepted as an alias
 * @param {Object} [props.config.xAxis] - Optional `{ type: "time", format, tickInterval, domain, tooltipFormat, utc }`
 * @param {boolean} [props.config.connectNulls] - Draw lines across null values (default: true)
 * @param {Array} [props.config.bands] - Optional shaded ranges `{ from, to, label, tone }`
 * @param {Array} [props.config.gaps] - Optional missing-data ranges `{ from, to, label }`
 * @returns {JSX.Element} - Multiple Line chart component with X/Y axes, grid, and tooltip
 */
const MultipleLineChart = ({ config, data, formatters }) => {
  const theme = useTheme();
  const items = React.useMemo(() => data, [data]);
  const columns = config.columns || config.series || [];
  const enhanced = useLineChartEnhancements(config, items, config.xKey || "label", theme);
  const height = config.height ?? DEFAULTS.DIMENSIONS.baseHeight;
  const [hiddenSeries, setHiddenSeries] = React.useState({});

  const toggleSeries = (e) => {
    if (!e.dataKey) return;
    setHiddenSeries((prev) => ({
      ...prev,
      [e.dataKey]: !prev[e.dataKey],
    }));
  };

  const formatter = (val) => {
    const n = Number(val);
    return Number.isFinite(n) ? formatNumber(n, { stripTrailingZeroes: true }) : "";
  };
  const xAxisHeight = React.useMemo(
    () =>
      computeXAxisHeight(
        config,
        items.map((i) => i[config.xKey || "label"])
      ),
    [config, items]
  );

  const visibleColumns = columns.filter((c) => !hiddenSeries[c.key]);
  const hasNegative = items.some((i) => visibleColumns.some((c) => Number(i[c.key]) < 0));
  const hasPositive = items.some((i) => visibleColumns.some((c) => Number(i[c.key]) > 0));
  const hasOnlyZero = !hasNegative && !hasPositive && items.some((i) => visibleColumns.some((c) => Number(i[c.key]) === 0));
  
  let dataDomain = ['auto', 'auto'];
  if (hasOnlyZero) {
    dataDomain = [-1, 1]; // Fixes Recharts breaking when all values are exactly 0
  } else if (!hasNegative && hasPositive) {
    dataDomain = ['auto', 'auto'];
  } else if (hasNegative && !hasPositive) {
    dataDomain = ['auto', 0];
  }


  const maxTickLen = React.useMemo(() => {
    let max = 3;
    items.forEach((item) => {
      columns.forEach((col) => {
        const val = item[col.key];
        if (val !== null && val !== undefined && !isNaN(Number(val))) {
          const len = formatter(Math.abs(Number(val))).length;
          if (len > max) max = len;
        }
      });
    });
    return max;
  }, [items, columns]);

  const yAxisWidth = Math.max(26, Math.min(52, maxTickLen * 6.2 + 6));

  return (
    <ChartSection
      ariaLabel={
        config.ariaLabel || (enhanced.enabled && config.title) || "Multiple Line chart"
      }
      title={config.title}
      height={height}
      xAxisTitle={config.x_axis_title}
      yAxisTitle={formatAxisTitleWithUnit(config.y_axis_title, config.units)}
      description={enhanced.description}
      descriptionId={enhanced.descriptionId}
    >
      <RLineChart
        data={enhanced.data}
        margin={{
          top: enhanced.topMargin ?? 6,
          right: enhanced.rightMargin ?? 8,
          bottom: 2,
          left: 4,
        }}
      >
        <RCartesianGrid {...DEFAULTS.GRID} />
        {enhanced.overlays}
        <RXAxis
          dataKey={config.xKey || "label"}
          angle={DEFAULTS.DIMENSIONS.xAngle}
          textAnchor="end"
          height={xAxisHeight}
          interval={Math.max(0, Math.ceil(items.length / 8) - 1)}
          tick={{ fontSize: DEFAULTS.DIMENSIONS.tickFontSize }}
          {...enhanced.xAxisProps}
        />
        <RYAxis
          allowDecimals={true}
          domain={dataDomain}
          tickFormatter={formatter}
          tick={{ fontSize: DEFAULTS.DIMENSIONS.tickFontSize }}
          width={yAxisWidth}
          tickMargin={4}
        />
        <RTooltip
          content={<ChartTooltip config={config} labelFormatter={enhanced.labelFormatter} />}
          cursor={{ stroke: "#ccc", strokeDasharray: "3 3" }}
          wrapperStyle={{ zIndex: 9999, pointerEvents: "none" }}
        />
        <RLegend
          verticalAlign={enhanced.legendAlign}
          align="center"
          wrapperStyle={{
            fontSize: DEFAULTS.DIMENSIONS.tickFontSize,
            cursor: "pointer",
            ...(enhanced.legendAlign === "bottom" ? { paddingTop: 6 } : { paddingBottom: 10 }),
          }}
          formatter={(value) => (
            <span
              style={{
                fontSize: DEFAULTS.DIMENSIONS.tickFontSize,
                fontFamily: "var(--font-sans)",
                color: "var(--text-icon)",
              }}
            >
              {value}
            </span>
          )}
          onClick={toggleSeries}
        />
        {columns.map((col, idx) => (
          <RLine
            key={col.key}
            type="monotone"
            dataKey={col.key}
            name={col.label}
            stroke={
              resolveColourToken(
                (config.colors && config.colors[col.key]) || col.colour || col.color,
                theme
              ) || DEFAULT_COLORS[idx % DEFAULT_COLORS.length]
            }
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4 }}
            connectNulls={config.connectNulls ?? true}
            hide={hiddenSeries[col.key]}
            strokeOpacity={hiddenSeries[col.key] ? 0.3 : 1}
          />
        ))}
      </RLineChart>
    </ChartSection>
  );
};

/**
 * Renders a responsive area chart using Recharts
 * @param {Object} props - Component props
 * @param {Object} props.config - Chart configuration object
 * @param {Object} props.data - Data object containing values to chart
 * @param {Object} props.formatters - Custom formatting functions for values
 * @returns {JSX.Element} - Area chart component with X/Y axes, grid, and tooltip
 */
const AreaSeriesChart = ({ config, data, formatters, chartUiColors, brandColor }) => {
  const items = React.useMemo(() => toSeries(config, data), [config, data]);
  const height = config.height ?? DEFAULTS.DIMENSIONS.baseHeight;
  const stroke =
    config.areaStrokeColor || config.lineColor || brandColor;
  const fill = config.areaFillColor || chartUiColors.areaFill;
  const formatter = (val) => {
    const n = Number(val);
    return Number.isFinite(n) ? formatNumber(n, { stripTrailingZeroes: true }) : "";
  };
  const xAxisHeight = React.useMemo(
    () =>
      computeXAxisHeight(
        config,
        items.map((i) => i.label)
      ),
    [config, items]
  );

  return (
    <ChartSection
      ariaLabel={config.ariaLabel || "Area chart"}
      title={config.title}
      height={height}
      xAxisTitle={config.x_axis_title}
      yAxisTitle={formatAxisTitleWithUnit(config.y_axis_title, config.units)}
    >
      <RAreaChart data={items} margin={DEFAULTS.MARGIN}>
        <RCartesianGrid {...DEFAULTS.GRID} />
        <RXAxis
          dataKey="label"
          angle={DEFAULTS.DIMENSIONS.xAngle}
          textAnchor="end"
          height={xAxisHeight}
          interval={0}
          tick={{ fontSize: DEFAULTS.DIMENSIONS.tickFontSize }}
        />
        <RYAxis
          allowDecimals={false}
          tickFormatter={formatter}
          tick={{ fontSize: DEFAULTS.DIMENSIONS.tickFontSize }}
          width={DEFAULTS.DIMENSIONS.yAxisWidth}
        />
        <RTooltip
          content={<ChartTooltip config={config} />}
          cursor={{ stroke: chartUiColors.guideStroke, strokeDasharray: "3 3" }}
          wrapperStyle={{ zIndex: 9999, pointerEvents: "none" }}
        />
        <RArea
          type="monotone"
          dataKey="value"
          stroke={stroke}
          fill={fill}
          strokeWidth={2}
        />
      </RAreaChart>
    </ChartSection>
  );
};

/**
 * Renders a responsive scatter chart using Recharts
 * @param {Object} props - Component props
 * @param {Object} props.config - Chart configuration object
 * @param {Object} props.data - Data object containing values to chart
 * @param {Object} props.formatters - Custom formatting functions for values
 * @returns {JSX.Element} - Scatter chart component with X/Y axes, grid, and tooltip
 */
const ScatterSeriesChart = ({ config, data, formatters, chartUiColors, brandColor }) => {
  const items = React.useMemo(() => toSeries(config, data), [config, data]);
  const height = config.height ?? DEFAULTS.DIMENSIONS.baseHeight;
  const fill = config.scatterColor || brandColor;
  const formatter = (val) => {
    const n = Number(val);
    return Number.isFinite(n) ? formatNumber(n, { stripTrailingZeroes: true }) : "";
  };
  const xAxisHeight = React.useMemo(
    () =>
      computeXAxisHeight(
        config,
        items.map((i) => i.label)
      ),
    [config, items]
  );

  return (
    <ChartSection
      ariaLabel={config.ariaLabel || "Scatter chart"}
      title={config.title}
      height={height}
      xAxisTitle={config.x_axis_title}
      yAxisTitle={formatAxisTitleWithUnit(config.y_axis_title, config.units)}
    >
      <RScatterChart margin={DEFAULTS.MARGIN}>
        <RCartesianGrid {...DEFAULTS.GRID} />
        <RXAxis
          dataKey="label"
          type="category"
          angle={DEFAULTS.DIMENSIONS.xAngle}
          textAnchor="end"
          height={xAxisHeight}
          interval={0}
          tick={{ fontSize: DEFAULTS.DIMENSIONS.tickFontSize }}
        />
        <RYAxis
          dataKey="value"
          type="number"
          allowDecimals={false}
          tickFormatter={formatter}
          tick={{ fontSize: DEFAULTS.DIMENSIONS.tickFontSize }}
          width={DEFAULTS.DIMENSIONS.yAxisWidth}
        />
        <RTooltip
          content={<ChartTooltip config={config} />}
          cursor={{ stroke: chartUiColors.guideStroke, strokeDasharray: "3 3" }}
          wrapperStyle={{ zIndex: 9999, pointerEvents: "none" }}
        />
        <RScatter data={items} fill={fill} />
      </RScatterChart>
    </ChartSection>
  );
};

/**
 * Renders a responsive donut/pie chart using Recharts
 * @param {Object} props - Component props
 * @param {Object} props.config - Chart configuration object
 * @param {Object} props.data - Data object containing values to chart
 * @param {Object} props.formatters - Custom formatting functions for values
 * @returns {JSX.Element} - Donut pie chart component with legend and tooltip
 */
const DonutPieChart = ({ config, data, formatters }) => {
  const items = toSeries(config, data);
  const size = config.size ?? DEFAULTS.DIMENSIONS.pieSize; // controls height only; radii are percentages to auto-fit width
  const total = Math.max(
    0.00001,
    items.reduce((a, b) => a + b.value, 0)
  );
  const pctFmt = (v) =>
    total > 0 ? `${((v / total) * 100).toFixed(1)}%` : "0.0%";

  return (
    <ChartSection
      ariaLabel={config.ariaLabel || "Donut chart"}
      title={config.title}
      height={size}
    >
      <RPieChart>
        <RTooltip
          content={
            <ChartTooltip
              config={config}
              formatter={(value, name, item) => {
                const formatted = formatValueWithUnit(value, config.units);
                return `${formatted} (${pctFmt(value)})`;
              }}
            />
          }
          wrapperStyle={{ zIndex: 9999, pointerEvents: "none" }}
        />
        <RLegend
          verticalAlign="bottom"
          align="center"
          layout="horizontal"
          wrapperStyle={{ fontSize: DEFAULTS.DIMENSIONS.tickFontSize }}
          formatter={(val) => (
            <span
              style={{
                fontSize: DEFAULTS.DIMENSIONS.tickFontSize,
                fontFamily: "var(--font-sans)",
                color: "var(--text-icon)",
              }}
            >
              {val}
            </span>
          )}
        />
        <RPie
          data={items}
          dataKey="value"
          nameKey="label"
          cx="50%"
          cy="45%"
          innerRadius="45%"
          outerRadius="70%"
          paddingAngle={1}
          isAnimationActive
        >
          {items.map((it) => (
            <RCell key={it.key} fill={it.color} />
          ))}
        </RPie>
      </RPieChart>
    </ChartSection>
  );
};

/**
 * Renders data as an HTML table with metric names, counts, and percentages
 * @param {Object} props - Component props
 * @param {Object} props.config - Chart configuration object
 * @param {Object} props.data - Data object containing values to display
 * @param {Object} props.formatters - Custom formatting functions for values
 * @returns {JSX.Element} - Styled table component with headers and data rows
 */
const TableChart = ({ config, data, formatters, chartUiColors, brandColor }) => {
  const cols = config.columns || [];
  const keys = React.useMemo(() => cols.map((c) => c.key), [cols]);
  const rows = React.useMemo(
    () => cols.map((c) => ({ label: c.label ?? c.key, key: c.key })),
    [cols]
  );
  const total = React.useMemo(
    () => keys.reduce((acc, k) => acc + getValue(data, k), 0),
    [keys, data]
  );
  const fmt = {
    commify: ((v) => formatNumber(Number(v ?? 0))),
    percent: (v) => (total > 0 ? `${((v / total) * 100).toFixed(1)}%` : "0.0%"),
  };
  const firstColHeader = config.tableMetricName || "Metric";

  return (
    <Section aria-label={config.ariaLabel || "Table"}>
      {config.title && <Title>{config.title}</Title>}
      <div style={{ overflowX: "auto", margin: "10px 0" }}>
        <table
          style={{
            width: "100%",
            borderCollapse: "collapse",
            fontSize: 12,
            background: "white",
            border: `1px solid ${chartUiColors.tableBorder}`,
            borderRadius: 6,
            overflow: "hidden",
          }}
        >
          <thead>
            <tr style={{ background: brandColor, color: "white" }}>
              <th style={{ padding: 8, textAlign: "left", fontWeight: 600 }}>
                {firstColHeader}
              </th>
              <th style={{ padding: 8, textAlign: "right", fontWeight: 600 }}>
                Count
              </th>
              <th style={{ padding: 8, textAlign: "right", fontWeight: 600 }}>
                %
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, idx) => {
              const val = getValue(data, r.key);
              return (
                <tr
                  key={r.key}
                  style={{
                    borderBottom:
                      idx === rows.length - 1 ? "none" : `1px solid ${chartUiColors.tableDivider}`,
                  }}
                >
                  <td style={{ padding: 8, borderRight: `1px solid ${chartUiColors.tableDivider}` }}>
                    {r.label}
                  </td>
                  <td
                    style={{
                      padding: 8,
                      textAlign: "right",
                      borderRight: `1px solid ${chartUiColors.tableDivider}`,
                    }}
                  >
                    {fmt.commify(val)}
                  </td>
                  <td style={{ padding: 8, textAlign: "right" }}>
                    {fmt.percent(val)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Section>
  );
};

const RankingChart = ({ config, data, formatters, chartUiColors, onRowClick }) => {
  const [isOpen, setIsOpen] = useState(false);
  const cols = config.columns || [];
  const rows = React.useMemo(
    () => cols.map((c) => ({ label: c.label ?? c.key, key: c.key })),
    [cols]
  );
  const ranks = config?.ranks;
  const nodeRefs = useRef(new Map());

  const getNodeRef = (key) => {
    if (!nodeRefs.current.has(key)) {
      nodeRefs.current.set(key, React.createRef());
    }
    return nodeRefs.current.get(key);
  };

  const sortedRows = React.useMemo(() => {
    if (ranks) {
      return [...rows].sort((a, b) => {
        const rankA = ranks[a.key] ?? Infinity;
        const rankB = ranks[b.key] ?? Infinity;
        return rankA - rankB;
      });
    }
    return rows;
  }, [rows, ranks]);

  // Display everything if isOpen, otherwise only the first 5
  const visibleRows = isOpen ? sortedRows : sortedRows.slice(0, 5);
  const fmt = {
    commify: ((v) => formatNumber(Number(v ?? 0))),
  };
  return (
    <div style={{ overflowX: "auto", margin: "0" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <Title>{config.title}</Title>
        {rows.length > 5 ? (
          <ToggleButton 
            onClick={() => setIsOpen(!isOpen)}
            aria-label={isOpen ? "Show less" : "Show all"}
            title={isOpen ? "Show less" : "Show all"}
            aria-expanded={isOpen}
          >
            <RotatingIcon $isOpen={isOpen} aria-hidden="true" />
          </ToggleButton>
        ) : null}
      </div>
      <table
        style={{
          width: "100%",
          borderCollapse: "collapse",
          fontSize: 14,
          background: "transparent",
          border: "none",
        }}
      >
        <thead>
          <tr>
            <th style={{ width: 28, paddingBottom: 2 }}></th>
            <th style={{ textAlign: "left", fontWeight: 600, fontSize: 13, paddingBottom: 2 }}>Name</th>
            <th style={{ textAlign: "right", fontWeight: 600, fontSize: 13, paddingBottom: 2 }}>
              Value {config.units ? `(${config.units})` : ""}
            </th>
          </tr>
        </thead>
        <TransitionGroup component="tbody">
          {visibleRows.map((r, idx) => {
            const val = data[r.key];
            const nodeRef = getNodeRef(r.key);
            const isBottom = config.chartKey === "bottom5Losers";
            const actualRank = ranks && ranks[r.key] !== undefined ? ranks[r.key] : idx + 1;
            const isClickable = !!onRowClick && config.ids?.[r.key] !== undefined && config.ids?.[r.key] !== 0;
            return (
              <CSSTransition key={r.key} timeout={300} classNames="row" nodeRef={nodeRef}>
                <RowTr 
                  ref={nodeRef} 
                  $clickable={isClickable}
                  role={isClickable ? "button" : undefined}
                  tabIndex={isClickable ? 0 : undefined}
                  aria-label={isClickable ? `Zoom to ${r.label}` : undefined}
                  title={isClickable ? `Click to zoom to ${r.label}` : undefined}
                  onClick={() => {
                    if (isClickable) {
                      const id = config.ids[r.key];
                      onRowClick(id, r.key);
                    }
                  }}
                  onKeyDown={(e) => {
                    if (isClickable && (e.key === "Enter" || e.key === " ")) {
                      e.preventDefault();
                      const id = config.ids[r.key];
                      onRowClick(id, r.key);
                    }
                  }}
                >
                  <td>
                    <RankBadge $isBottom={isBottom} aria-label={`Rank ${actualRank}`}>
                      {isBottom ? <FaChevronDown aria-hidden="true" /> : <FaChevronUp aria-hidden="true" />}
                      <span aria-hidden="true">{actualRank}</span>
                    </RankBadge>
                  </td>
                  <NameCell>{r.label}</NameCell>
                  <ScoreCell>{fmt.commify(val)}</ScoreCell>
                </RowTr>
              </CSSTransition>
            );
          })}
        </TransitionGroup>
        {/* Display "..." only if the list is collapsed */}
        {!isOpen && rows.length > 5 && (
          <RowTr>
            <td colSpan={3} style={{ color: chartUiColors.subtleText, paddingLeft: 32 }}>
              ...
            </td>
          </RowTr>
        )}
      </table>
    </div>
  );
};

/**
 * Main chart rendering component that supports multiple chart types
 * Renders different types of charts based on configuration including:
 * - Bar charts
 * - Line charts
 * - Area charts
 * - Scatter charts
 * - Pie/Donut charts
 * - Table charts
 * - Histogram (placeholder - not implemented)
 *
 * @param {Object} props - Component props
 * @param {Array} props.charts - Array of chart configuration objects
 * @param {Object} props.data - Data object containing values to chart
 * @param {Object} props.formatters - Custom formatting functions for values
 * @param {number} props.barHeight - Optional height override for bar charts
 * @returns {JSX.Element|null} - Rendered charts or null if no charts provided
 */
export const ChartRenderer = ({
  charts = [],
  data,
  formatters = {},
  barHeight,
  onRowClick,
}) => {
  const theme = useTheme();
  const brandColor = theme?.primary || defaultBgColour;
  const chartUiColors = React.useMemo(() => getChartUiColors(theme), [theme]);

  if (!charts.length) return null;
  const f = { ...defaultFormatters, ...formatters };

  // Determine if data has values
  const isMultipleLine = charts.some(
    (c) => (c.type || "").toLowerCase() === "multiple_line"
  );
  const hasAny = Array.isArray(data)
    ? data.length > 0 &&
      (isMultipleLine
        ? data.some((row) =>
            Object.entries(row)
              .filter(([k]) => k !== (charts[0]?.xKey || "label"))
              .some(([, v]) => v !== null && v !== undefined && !isNaN(Number(v)))
          )
        : data.some((row) =>
            Object.entries(row)
              .filter(([k]) => k !== (charts[0]?.xKey || "label"))
              .some(([, v]) => Number(v) !== 0)
          ))
    : data && Object.values(data).some((v) => Number(v) !== 0);

  if (!hasAny) return null;

  return (
    <ChartContainer>
      {charts.map((cfg, idx) => {
        const type = (cfg.type || "").toLowerCase();
        const resolvedBarChartHeight = cfg?.height ?? cfg?.barHeight ?? barHeight;
        const cfgWithResolvedHeight =
          resolvedBarChartHeight === undefined
            ? cfg
            : { ...cfg, height: resolvedBarChartHeight };
        switch (type) {
          case "bar":
            return (
              <BarChart
                key={idx}
                config={cfgWithResolvedHeight}
                data={data}
                formatters={f}
                chartUiColors={chartUiColors}
                brandColor={brandColor}
              />
            );
          case "bar_vertical":
            return (
              <BarChart
                key={idx}
                config={cfgWithResolvedHeight}
                data={data}
                formatters={f}
                type="vertical"
                chartUiColors={chartUiColors}
                brandColor={brandColor}
              />
            );
          case "multiple_bar":
            return (
              <BarChartMultiple
                key={idx}
                config={cfgWithResolvedHeight}
                data={data}
                formatters={f}
                chartUiColors={chartUiColors}
              />
            );
          case "multiple_bar_vertical":
            return (
              <BarChartMultiple
                key={idx}
                config={cfgWithResolvedHeight}
                data={data}
                formatters={f}
                type="vertical"
                chartUiColors={chartUiColors}
              />
            );
          case "line":
            return (
              <LineSeriesChart
                key={idx}
                config={cfg}
                data={data}
                formatters={f}
                chartUiColors={chartUiColors}
                brandColor={brandColor}
              />
            );
          case "multiple_line":
            return (
              <MultipleLineChart
                key={idx}
                config={cfg}
                data={data}
                formatters={f}
              />
            );
          case "area":
            return (
              <AreaSeriesChart
                key={idx}
                config={cfg}
                data={data}
                formatters={f}
                chartUiColors={chartUiColors}
                brandColor={brandColor}
              />
            );
          case "scatter":
            return (
              <ScatterSeriesChart
                key={idx}
                config={cfg}
                data={data}
                formatters={f}
                chartUiColors={chartUiColors}
                brandColor={brandColor}
              />
            );
          case "pie":
          case "donut":
            return (
              <DonutPieChart
                key={idx}
                config={cfg}
                data={data}
                formatters={f}
              />
            );
          case "table":
            return (
              <TableChart
                key={idx}
                config={cfg}
                data={data}
                formatters={f}
                chartUiColors={chartUiColors}
                brandColor={brandColor}
              />
            );
          case "ranking":
            return (
              <RankingChart
                key={idx}
                config={cfg}
                data={data}
                formatters={f}
                chartUiColors={chartUiColors}
                onRowClick={onRowClick}
              />
            );
          case "histogram":
            return (
              <Section key={idx}>
                <Title>{cfg.title || `${type} chart`}</Title>
                <WarningBox
                  text={`${type} not implemented yet in chart engine.`}
                />
              </Section>
            );
          default:
            return (
              <Section key={idx}>
                <WarningBox text={`Unsupported chart type: ${cfg.type}`} />
              </Section>
            );
        }
      })}
    </ChartContainer>
  );
};

export default ChartRenderer;
