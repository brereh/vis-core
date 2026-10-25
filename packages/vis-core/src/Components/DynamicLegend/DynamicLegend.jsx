import React, { useEffect, useState, useRef, useContext } from "react";
import { createPortal } from 'react-dom';
import {
  buildCategoricalLegendKey,
  convertStringToNumber,
  getMetricDefinition,
  getVisualisationDisplayMode,
  resolveDisplayUnit,
} from "utils";
import { useMapContext } from "hooks/useMapContext";
import { useFetchVisualisationData } from "hooks/useFetchVisualisationData";
import { useIsMobile } from "hooks/useIsMobile";
import { PageContext } from "contexts/PageContext";
import { useAppContext } from "contexts/AppContext";
import { useDockedLayoutContext } from "contexts/DockedLayoutContext";
import { LegendContainer } from "./DynamicLegend.styles";
import {
  interpolateWidths,
  interpretColorExpression,
  interpretWidthExpression,
  interpretDashArrayExpression,
  isRenderableEntry,
  formatLegendLabelValue,
  formatLegendNumber,
  getEntryWidth,
  getEntryDashStatus,
} from "./DynamicLegend.utils";
import LegendLayerGroup from "./LegendLayerGroup";

/**
 * DynamicLegend is a React component that renders a map legend based on the styles of map layers.
 * It listens for changes in the map's style and updates the legend items accordingly. Each legend
 * item displays color and/or width swatches along with labels indicating the corresponding values.
*
* @component
* @property {Object} map - The map instance from Mapbox or MapLibre.
* @returns {JSX.Element|null} The rendered legend component or null if there are no legend items.
 */
export const DynamicLegend = ({ map }) => {
  const isMobile = useIsMobile();
  const isDocked = useDockedLayoutContext() != null;
  const [legendItems, setLegendItems] = useState([]);
  const { state } = useMapContext();
  const { defaultBands, defaultLegendDisplayMode = 'continuous' } = useAppContext();
  // Initialise from localStorage so the user's display/scale preferences survive
  // page refreshes and navigation. Falls back to an empty object if storage is
  // unavailable (private browsing, quota exceeded, etc.).
  const [layerPrefs, setLayerPrefs] = useState(() => {
    try {
      const stored = localStorage.getItem('dynamicLegend_layerPrefs');
      return stored ? JSON.parse(stored) : {};
    } catch {
      return {};
    }
  });
  const [openPopoverId, setOpenPopoverId] = useState(null);
  const popoverRef = useRef(null);
  const legendRef = useRef(null);
  const currentPage = useContext(PageContext);

  // Build a lookup of already-fetched data by layerId from state.visualisations
  const visualisationDataByLayer = {};
  Object.entries(state.visualisations).forEach(([key, vis]) => {
    if (vis && vis.joinLayer && vis.data) {
      visualisationDataByLayer[vis.joinLayer] = vis.data;
    }
  });

  useEffect(() => {
    const handleOutsideClick = (e) => {
      // Close if clicking outside the CogMenuContainer
      if (popoverRef.current && !popoverRef.current.contains(e.target)) {
        setOpenPopoverId(null);
      }
    };

    if (openPopoverId !== null) {
      document.addEventListener("mousedown", handleOutsideClick);
    }
    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
    };
  }, [openPopoverId]);

  const togglePopover = (layerId) => {
    setOpenPopoverId(prev => prev === layerId ? null : layerId);
  };

  const updateLayerPref = (layerId, key, value, defaultDisplayMode = 'continuous') => {
    setLayerPrefs(prev => {
      const currentPref = prev[layerId] || { displayMode: defaultDisplayMode, scaleMode: 'value' };
      const next = { ...prev, [layerId]: { ...currentPref, [key]: value } };
      // Persist to localStorage so preferences survive page refreshes.
      try {
        localStorage.setItem('dynamicLegend_layerPrefs', JSON.stringify(next));
      } catch {
        // Silently ignore if localStorage is unavailable.
      }
      return next;
    });
    // Close the options popover as soon as the user selects a preference.
    setOpenPopoverId(null);
  };

  useEffect(() => {
    if (!map) return;

    const updateLegend = () => {
      const layers = map.getStyle().layers;

      const items = layers
        .filter((layer) => {
          const shouldShowInLegend =
            layer.metadata &&
            (layer.metadata.shouldShowInLegend ?? layer.metadata.isStylable);
          const isWithinZoomRange = (layer.minzoom === undefined || state.currentZoom >= layer.minzoom) &&
            (layer.maxzoom === undefined || state.currentZoom <= layer.maxzoom);
          return shouldShowInLegend && isWithinZoomRange;
        })
        .map((layer, index) => {
          // --- Resolve display text ---
          // Find the visualisation record for this layer and derive the title and
          // optional subtitle shown at the top of the legend group. Stylable layers
          // pull their text from the active filter's legendText; non-stylable layers
          // fall back to the raw layer ID.
          const visualisationKey = Object.keys(state.visualisations).find(key => {
            return state.visualisations[key].joinLayer === layer.id;
          });
          const visualisation = state.visualisations[visualisationKey];
          const legendText = visualisation?.legendText || [];

          const title = layer.id;
          let displayValue = title;
          let legendSubtitleText = "";

          if (layer.metadata.isStylable) {
            const legendFilter = state?.filters?.find(
              (filter) => filter.containsLegendInfo === true
            );

            if (legendFilter) {
              const filterParamName = legendFilter.paramName;
              const filterObj = state.filters.find(
                (filter) => filter.paramName === filterParamName
              );
              const filterValues = filterObj?.values?.values || [];
              const defaultDisplayValue = filterValues[0]?.displayValue || title;
              const defaultLegendSubtitleText =
                filterValues[0]?.legendSubtitleText || "";

              displayValue =
                legendText[0]?.displayValue || defaultDisplayValue;
              legendSubtitleText =
                legendText[0]?.legendSubtitleText ||
                defaultLegendSubtitleText;
            } else {
              displayValue = legendText[0]?.displayValue || title;
              legendSubtitleText =
                legendText[0]?.legendSubtitleText || "";
            }
          }
          
          // Resolve bands the same way the map does, so a mode-specific band entry drives
          // the legend's labels. The mode comes from visualisation state rather than being
          // re-derived from filter config, so legend and map band the same numbers.
          const displayMode = getVisualisationDisplayMode(visualisation);
          const metricDefinition = visualisation?.queryParams
            ? getMetricDefinition(defaultBands, currentPage, visualisation.queryParams, {
                displayMode,
              })
            : null;

          let customLabels = metricDefinition?.labels?.length
            ? metricDefinition.labels
            : null;

          // The unit follows the display mode, not the band configuration: in a percentage
          // view the legend stops describing the metric's own units (e.g. "Passengers").
          // The hovertip resolves its unit through this same helper, so the two agree
          // without either needing a bands.js entry to exist.
          legendSubtitleText = resolveDisplayUnit(displayMode, legendSubtitleText);
          
          // --- Interpret paint expressions ---
          const invertColorScheme = state.layers[layer.id]?.invertedColorScheme === true;

          // legendAnnotations: optional { start, end } strings rendered in the
          // AnnotationRow below the continuous gradient bar. "start" appears on
          // the left (low end of the bar), "end" on the right (high end).
          // These are display-position terms, not array-index terms, so they
          // remain unambiguous regardless of whether the colour scheme is inverted.
          const legendAnnotations = state.layers[layer.id]?.legendAnnotations;

          // legendNumberFormat: optional LegendNumberFormat controlling decimal
          // precision, prefix, and suffix on continuous-bar axis ticks AND on
          // discrete swatch labels. Both views show consistent values.
          // Defaults to auto-detecting the precision of the stop values.
          const legendNumberFormat = state.layers[layer.id]?.legendNumberFormat;

          // Formats a stop value for the discrete legend swatch label.
          // Delegates entirely to formatLegendNumber — the single extension point
          // for all label formatting options (decimals, prefix, suffix, …).
          // No format logic lives here; add options to formatLegendNumber instead.
          const formatEntryLabel = (value) => formatLegendNumber(value, legendNumberFormat ?? {});
          const paintProps = layer.paint;
          
          // Determine the opacity based on the layer type
          const layerOpacity = 
            paintProps["fill-opacity"] ?? 
            paintProps["line-opacity"] ?? 
            paintProps["circle-opacity"];

          // If the layer is explicitly hidden (opacity is exactly 0), skip the legend
          if (layerOpacity === 0 || layerOpacity === 0.0) {
            return null;
          }

          let colorStops = interpretColorExpression(
            paintProps["line-color"] ||
            paintProps["circle-color"] ||
            paintProps["fill-color"]
          );
          let widthStops = interpretWidthExpression(
            paintProps["line-width"] || paintProps["circle-radius"]
          );
          let dashStops = interpretDashArrayExpression(
            paintProps["line-dasharray"]
          );

          // --- Normalise stops ---
          // Detect categorical styling, apply colour inversion if toggled, and
          // reconcile any mismatch between the number of colour stops and width stops.
          const colorStyle = layer.metadata?.colorStyle;
          const isCategorical =
            colorStyle === "categorical" ||
            (colorStops && colorStops.some((s) => isNaN(convertStringToNumber(s.value))));

          // Note: when invertColorScheme is true, the map paint expression was already
          // built with the colours reversed (via calculateColours in MapVisualisation).
          // interpretColorExpression reads those stops back in ascending value order with
          // the already-inverted colours, so no further reversal is needed here. Reversing
          // again would flip the labels to show highest→lowest instead of lowest→highest.

          // For categorical circle styles, keep a uniform diameter (do not scale by bins)
          if (layer.type === "circle" && isCategorical) {
            widthStops = null; // allow default diameter to apply uniformly
          } 
          if (
            layer.type === "circle" &&
            colorStops &&
            widthStops?.length > 0 &&
            colorStops.length !== widthStops.length
          ) {
            widthStops = interpolateWidths(colorStops, widthStops, layer.type);
          }

          if (layer.type === "line" && layer.metadata.colorStyle === "diverging" && colorStops.length === 3) {
            const negativeColor = colorStops.find(stop => stop.value === -1)?.color;
            const positiveColor = colorStops.find(stop => stop.value === 1)?.color;

            const negativeWidthStops = widthStops
              .filter(stop => convertStringToNumber(stop.value) > 0)
              .map(stop => ({
                ...stop,
                value: `-${stop.value}` // Add a '-' to the start of the value
              }))
              .reverse();

            widthStops = [...negativeWidthStops, ...widthStops];
            // Ensure there is a 0 value in widthStops
            if (!widthStops.some(stop => convertStringToNumber(stop.value) === 0)) {
              widthStops.push({ value: 0, width: 0 });
              widthStops = widthStops.sort((a, b) => convertStringToNumber(a.value) - convertStringToNumber(b.value));
            }

            // Assign colors based on the value sign
            colorStops = widthStops.map(stop => ({
              ...stop,
              color: convertStringToNumber(stop.value) < 0 ? negativeColor : positiveColor
            }));
          }

          // Process legend entries
          let legendEntries = [];
          let hasCustomLabels = false;
          if (colorStops && colorStops.length > 0) {
            if (widthStops && widthStops.length == 1) {
              // If there's only one width stop, apply it to all color stops. This should only occur with custom paint definiton (not data-driven).
              widthStops = Array(colorStops.length).fill(widthStops[0]);
            }
            // All colour stops are included as entries. Each stop represents a
            // point value on the scale, not a range between stops. The continuous
            // bar then places tick marks at those point values and the collision-
            // detection system selects which labels to show.
            const length = colorStops.length;
            for (let idx = 0; idx < length; idx++) {
              const stop = colorStops[idx];
              const widthStop = widthStops ? widthStops[idx] : null;
              const dashStop = dashStops ? dashStops.find(ds => ds.value === stop.value) : null;
              let label;
              let rawLabel;
              let numericValue;
              if (customLabels && customLabels.length === length) {
                rawLabel = customLabels[idx];
                label = rawLabel;
                // The underlying stop value is still numeric (e.g. 0, 20, 40, 60, 80)
                // and drives continuous bar positioning. hasCustomLabels is set so
                // ContinuousGradientBar can decorate the extreme ticks with ≤ / +
                // to communicate the open-ended nature of the boundary bins.
                numericValue = convertStringToNumber(stop.value);
                hasCustomLabels = true;
              } else {
                rawLabel = stop.value;
                numericValue = convertStringToNumber(stop.value);
                // Apply legendNumberFormat so the discrete swatch label matches the
                // continuous bar axis (e.g. "100" not "100.00" for decimals: 0).
                label = formatEntryLabel(stop.value);
              }

              const cachedLegendColour =
                isCategorical && layer.metadata?.legendCacheField
                  ? state.categoricalLegendCache?.[
                      buildCategoricalLegendKey({
                        fieldName: layer.metadata.legendCacheField,
                        value: stop.value,
                      })
                    ]?.colour
                  : null;
              
              legendEntries.push({
                color: cachedLegendColour || stop.color,
                width: getEntryWidth(widthStop, isMobile, layer, paintProps, rawLabel),
                label,
                rawLabel,
                numericValue,
                type: layer.type,
                isDashed: getEntryDashStatus(dashStop, paintProps, rawLabel),
              });
            }
          }

          // --- No-style fallback ---
          // A layer with no data-driven stops produces a single swatch using the
          // layer's base paint colour, labelled with the layer ID.
          let noStyle = false;
          if (legendEntries.length === 0) {
            noStyle = true;
            const defaultColor =
                paintProps["line-color"] ||
                paintProps["circle-color"] ||
                paintProps["fill-color"] ||
                "#000";
              let defaultWidth;
              if (layer.type === "circle") {
                defaultWidth = paintProps["circle-radius"]
                  ? paintProps["circle-radius"] * 2
                  : 10;
              } else if (layer.type === "line") {
                defaultWidth = paintProps["line-width"] || 2;
              } else {
                defaultWidth = 10;
              }
              legendEntries.push({
                color: defaultColor,
                width: defaultWidth,
                label: title,
                type: layer.type,
                isDashed: getEntryDashStatus(null, paintProps, title),
              });
          }

          const filteredEntries = (legendEntries || []).filter(isRenderableEntry);

          // If nothing would render, skip this group entirely
          if (filteredEntries.length === 0) {
            return null;
          }

          const legendNumericEntries = filteredEntries.map(e => e.numericValue);
          const layerDefaultDisplayMode = layer.metadata?.defaultLegendDisplayMode || defaultLegendDisplayMode;
          
          return {
            layerId: layer.id,
            title: displayValue,
            subtitle: legendSubtitleText,
            legendEntries: filteredEntries,
            legendEntriesNumeric: legendNumericEntries,
            defaultDisplayMode: layerDefaultDisplayMode,
            // legendAnnotations: { start, end } — positional (left/right) annotation
            // strings for the continuous gradient bar. Present only when the layer
            // config declares them; undefined otherwise.
            legendAnnotations,
            // legendNumberFormat: { decimals } — tick label precision override.
            legendNumberFormat,
            type: layer.type,
            style: layer.metadata.colorStyle,
            noStyle,
            hasCustomLabels, // True when bands.js-style range labels (e.g. "0-20 (Very low)") are applied.
            hideOutOfBandWarning: layer.metadata?.hideOutOfBandWarning !== false,
          };
        })
        // Layers that produced no renderable entries return null from the map above.
        .filter(Boolean);
      setLegendItems(items);
    };
  
    map.on("styledata", updateLegend);
  
    updateLegend();
  
    return () => {
      map.off("styledata", updateLegend);
    };
  }, [state.filters, state.categoricalLegendCache, map, state.visualisations, state.currentZoom, currentPage]);
  
  // This effect forces the container's width to update after legendItems change,
  // working around Firefox's flex-wrap column bug.
  useEffect(() => {
    if (!legendRef.current) return;

    // Mobile/tablet: let CSS make it full width; do nothing else
    if (isMobile) {
      legendRef.current.style.removeProperty('width');
      return;
    }
    // Reset width so container can shrink-wrap its content naturally.
    legendRef.current.style.width = "auto";
      
    // Calculate the scrollbar width:
    // offsetWidth includes scrollbar, clientWidth does not.
    const scrollbarWidth = legendRef.current.offsetWidth - legendRef.current.clientWidth;
      
    // Get the container's natural content width plus the scrollbar width.
    const newWidth = legendRef.current.scrollWidth + scrollbarWidth;
    legendRef.current.style.width = `${newWidth}px`;
  }, [legendItems, isMobile]);
  
  if (legendItems.length === 0) {
    return null;
  }

  const content = (
    <LegendContainer ref={legendRef} $outside={isMobile} $docked={isDocked}>
      {legendItems.map((item, index) => (
        <LegendLayerGroup
          key={item.layerId}
          item={item}
          index={index}
          isLast={index === legendItems.length - 1}
          isMobile={isMobile}
          openPopoverId={openPopoverId}
          togglePopover={togglePopover}
          layerPrefs={layerPrefs}
          updateLayerPref={updateLayerPref}
          visualisationDataByLayer={visualisationDataByLayer}
          classMethod={state.layers?.[item.layerId]?.class_method}
          popoverRef={popoverRef}
        />
      ))}
    </LegendContainer>
  );

  if (isMobile) {
    const slot = typeof document !== 'undefined' && document.getElementById('mobile-legend-slot');
    if (slot) return createPortal(content, slot);
  }

  return content;
};