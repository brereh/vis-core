import React, { useState, useEffect } from "react";
import ContinuousGradientBar from "./ContinuousGradientBar";
import { extractDataValues, getOutOfBandFlags, decorateLegendLabel } from "./DynamicLegend.utils";
import { InfoBox } from "Components/MessageBox/MessageBox";
import {
  LegendGroup,
  LegendItemContainer,
  LegendHeader,
  LegendTitle,
  LegendSubtitle,
  LegendItem,
  CircleSwatch,
  LineSwatch,
  PolygonSwatch,
  LegendLabel,
  LegendDivider,
  OutOfBandWrapper,
  DiscreteSwatchesContainer,
  SwatchAnnotation,
  CogMenuContainer,
  CogButton,
  OptionsPopover,
} from "./LegendLayerGroup.styles";

/**
 * LegendLayerGroup
 *
 * Renders a single layer's legend group, including its title, subtitle, colour
 * swatches (discrete or continuous gradient), optional cog-menu for display
 * preferences, and an out-of-band warning when data values fall outside the
 * manually configured band range. The warning is hidden by default; show it with
 * `hideOutOfBandWarning: false`. Out-of-band label decorations (≤ / ≥) are unaffected.
 *
 * This component is the per-item child rendered by `DynamicLegend` and receives
 * all state callbacks from the parent orchestrator.
 *
 * @param {Object}   props
 * @param {Object}   props.item                    - Legend item data produced by the
 *                                                   `updateLegend` effect in the parent.
 * @param {number}   props.index                   - Zero-based index of this item within
 *                                                   the `legendItems` array (reserved for
 *                                                   future use / keying).
 * @param {boolean}  props.isLast                  - When `false`, a `LegendDivider` is
 *                                                   rendered below the group.
 * @param {boolean}  props.isMobile                - When `true`, the `LegendDivider` is omitted.
 * @param {string|null} props.openPopoverId        - The `layerId` of the currently open
 *                                                   options popover, or `null`.
 * @param {Function} props.togglePopover           - Callback `(layerId: string) => void`
 *                                                   that opens/closes the options popover.
 * @param {Object}   props.layerPrefs              - Map of `layerId → { displayMode, scaleMode }`.
 * @param {Function} props.updateLayerPref         - Callback `(layerId, key, value) => void`
 *                                                   that mutates a single preference key.
 * @param {Object}   props.visualisationDataByLayer - Map of `layerId → data[]` for
 *                                                   out-of-band detection.
 * @param {string|null} props.classMethod          - Value of `state.layers[layerId].class_method`
 *                                                   for this layer; `'c'` triggers the
 *                                                   out-of-band check.
 * @param {React.RefObject} props.popoverRef       - Ref forwarded from the parent so that
 *                                                   the outside-click handler can detect
 *                                                   clicks outside the active popover.
 * @returns {JSX.Element} The rendered legend group.
 */
const LegendLayerGroup = ({
  item,
  index,
  isLast,
  isMobile,
  openPopoverId,
  togglePopover,
  layerPrefs,
  updateLayerPref,
  visualisationDataByLayer,
  classMethod,
  popoverRef,
}) => {
  // LegendDivider is omitted on mobile because legend groups are rendered separately already.
  const shouldRenderDivider = !isLast && !isMobile;
  
  // --- Out-of-band flags ---
  // belowMin / aboveMax: whether data extends beyond the displayed scale at
  // either end. Used to decorate swatch / tick labels with ≤ / +.
  const layerData = visualisationDataByLayer[item.layerId];
  const { belowMin: rawBelowMin, aboveMax: rawAboveMax } = getOutOfBandFlags(layerData, item.legendEntriesNumeric);
  
  // Debounce the out-of-band flags to prevent flashing when data and map styles
  // are momentarily out of step during cache loads or rapid filter changes.
  const [oobFlags, setOobFlags] = useState({ belowMin: false, aboveMax: false });  

  // Only apply debounce for non-custom classification, where OOB flashing is most likely
  const timeoutLimit = classMethod === 'c' ? 0 : 600; 
  useEffect(() => {
    if (rawBelowMin || rawAboveMax) {
      // Wait for MapLibre to finish painting the new classification and sync the legend
      const timer = setTimeout(() => {
        setOobFlags({ belowMin: rawBelowMin, aboveMax: rawAboveMax });
      }, timeoutLimit);
      return () => clearTimeout(timer);
    } else {
      // If we are back in bounds, clear the warning immediately
      setOobFlags({ belowMin: false, aboveMax: false });
    }
  }, [rawBelowMin, rawAboveMax, timeoutLimit]);

  const { belowMin, aboveMax } = oobFlags;

  // --- Display mode resolution ---
  // Continuous display requires at least two numeric stops to form a gradient
  // range. Categorical layers always fall back to discrete swatches.
  const canBeContinuous =
    item.style !== "categorical" &&
    item.legendEntriesNumeric &&
    item.legendEntriesNumeric.filter(Number.isFinite).length > 1;

  // Colour gradient and numbers may be opposing, so detect directionality for annotations
  const numericVals = item.legendEntriesNumeric?.filter(Number.isFinite) || [];
  const isDescending = numericVals.length >= 2 && numericVals[0] > numericVals[numericVals.length - 1];

  const pref = layerPrefs[item.layerId] || { displayMode: item.defaultDisplayMode || 'continuous', scaleMode: 'value' };
  const useDiscreteSwatches = !canBeContinuous || pref.displayMode === 'discrete';

  const isPopoverOpen = openPopoverId === item.layerId;

  // No values for the current selection: name the layer and say so, with no scale.
  if (item.noData) {
    return (
      <LegendGroup $isOpen={false}>
        <LegendItemContainer>
          <LegendHeader>
            <div>
              <LegendTitle>{item.title}</LegendTitle>
              {item.subtitle && <LegendSubtitle>{item.subtitle}</LegendSubtitle>}
            </div>
          </LegendHeader>
          <LegendLabel>No data for this selection.</LegendLabel>
        </LegendItemContainer>
      </LegendGroup>
    );
  }

  return (
    <LegendGroup $isOpen={isPopoverOpen}>
      <LegendItemContainer>
        {item.noStyle ? (
          // No-style fallback: render a single labelled swatch for the layer
          item.legendEntries.map((entry, idx) => (
            <LegendItem key={idx}>
              {item.type === "circle" ? (
                <CircleSwatch diameter={entry.width || 10} color={entry.color} />
              ) : item.type === "line" ? (
                <LineSwatch
                  height={entry.width || 2}
                  color={entry.color}
                  isDashed={entry.isDashed || false}
                />
              ) : item.type === "fill" ? (
                <PolygonSwatch color={entry.color} />
              ) : null}
              <LegendLabel>{entry.label}</LegendLabel>
            </LegendItem>
          ))
        ) : (
          <>
            {/* Header row: title/subtitle + optional cog menu */}
            <LegendHeader>
              <div>
                <LegendTitle>{item.title}</LegendTitle>
                {item.subtitle && <LegendSubtitle>{item.subtitle}</LegendSubtitle>}
              </div>

              {canBeContinuous && (
                <CogMenuContainer ref={isPopoverOpen ? popoverRef : null}>
                  <CogButton onClick={() => togglePopover(item.layerId)} title="Legend options">
                    {/* Simple SVG Cog Icon */}
                    <svg viewBox="0 0 24 24">
                      <path d="M19.14,12.94c0.04-0.3,0.06-0.61,0.06-0.94c0-0.32-0.02-0.64-0.06-0.94l2.03-1.58c0.18-0.14,0.23-0.41,0.12-0.61 l-1.92-3.32c-0.12-0.22-0.37-0.29-0.59-0.22l-2.39,0.96c-0.5-0.38-1.03-0.7-1.62-0.94L14.4,2.81c-0.04-0.24-0.24-0.41-0.48-0.41 h-3.84c-0.24,0-0.43,0.17-0.47,0.41L9.25,5.35C8.66,5.59,8.12,5.92,7.63,6.29L5.24,5.33c-0.22-0.08-0.47,0-0.59,0.22L2.73,8.87 C2.62,9.08,2.66,9.34,2.86,9.48l2.03,1.58C4.84,11.36,4.8,11.69,4.8,12s0.02,0.64,0.06,0.94l-2.03,1.58 c-0.18,0.14-0.23,0.41-0.12,0.61l1.92,3.32c0.12,0.22,0.37,0.29,0.59,0.22l2.39-0.96c0.5,0.38,1.03,0.7,1.62,0.94l0.36,2.54 c0.05,0.24,0.24,0.41,0.48,0.41h3.84c0.24,0,0.43-0.17,0.47-0.41l0.36-2.54c0.59-0.24,1.13-0.56,1.62-0.94l2.39,0.96 c0.22,0.08,0.47,0,0.59-0.22l1.92-3.32c0.12-0.22,0.07-0.49-0.12-0.61L19.14,12.94z M12,15.6c-1.98,0-3.6-1.62-3.6-3.6 s1.62-3.6,3.6-3.6s3.6,1.62,3.6,3.6S13.98,15.6,12,15.6z"/>
                    </svg>
                  </CogButton>

                  {isPopoverOpen && (
                    <OptionsPopover>
                      <strong>Display mode</strong>
                      <label>
                        <input
                          type="radio"
                          checked={pref.displayMode === 'continuous'}
                          onChange={() => updateLayerPref(item.layerId, 'displayMode', 'continuous', item.defaultDisplayMode)}
                        />
                        Continuous bar
                      </label>
                      <label>
                        <input
                          type="radio"
                          checked={pref.displayMode === 'discrete'}
                          onChange={() => updateLayerPref(item.layerId, 'displayMode', 'discrete', item.defaultDisplayMode)}
                        />
                        Discrete swatches
                      </label>

                      {pref.displayMode === 'continuous' && (
                        <>
                          <hr />
                          <strong>Gradient scale</strong>
                          <label>
                            <input
                              type="radio"
                              checked={pref.scaleMode === 'value'}
                              onChange={() => updateLayerPref(item.layerId, 'scaleMode', 'value', item.defaultDisplayMode)}
                            />
                            Proportional to values
                          </label>
                          <label>
                            <input
                              type="radio"
                              checked={pref.scaleMode === 'color'}
                              onChange={() => updateLayerPref(item.layerId, 'scaleMode', 'color', item.defaultDisplayMode)}
                            />
                            Evenly spaced colours
                          </label>
                        </>
                      )}
                    </OptionsPopover>
                  )}
                </CogMenuContainer>
              )}
            </LegendHeader>

            {/* Swatch area: discrete swatches or continuous gradient bar */}
            {useDiscreteSwatches ? (
              <DiscreteSwatchesContainer>
                {item.legendEntries.map((entry, idx) => {
                  const isFirst = idx === 0;
                  const isLast = idx === item.legendEntries.length - 1;
                  // Align scale-direction annotation with the first and last swatch
                  // rows so the label sits beside the value it describes, matching
                  // the vertical stacking of swatches.
                  const annotation = isFirst
                    ? item.legendAnnotations?.start
                    : isLast
                    ? item.legendAnnotations?.end
                    : null;
                    
                  const decoratedLabel = decorateLegendLabel({
                    label: entry.label,
                    isFirst,
                    isLast,
                    belowMin,
                    aboveMax,
                    isDescending,
                    hasCustomLabels: item.hasCustomLabels
                  });

                  return (
                    <LegendItem key={idx} style={{ marginBottom: 0 }}>
                      {entry.type === "circle" ? (
                        <CircleSwatch diameter={entry.width || 10} color={entry.color} />
                      ) : entry.type === "line" ? (
                        <LineSwatch height={entry.width || 2} color={entry.color} isDashed={entry.isDashed || false} />
                      ) : entry.type === "fill" ? (
                        <PolygonSwatch color={entry.color} />
                      ) : null}
                      <LegendLabel>{decoratedLabel}</LegendLabel>
                      {annotation && <SwatchAnnotation>{annotation}</SwatchAnnotation>}
                    </LegendItem>
                  );
                })}
              </DiscreteSwatchesContainer>
            ) : (
              <ContinuousGradientBar item={item} scaleMode={pref.scaleMode} belowMin={belowMin} aboveMax={aboveMax} />
            )}

            {(belowMin || aboveMax) && !item.hideOutOfBandWarning && (
              <OutOfBandWrapper>
                <InfoBox 
                  text="Some data is outside the specified bands and has been capped to the nearest band."
                  fontSize="0.75em"
                  margin="0"
                />
              </OutOfBandWrapper>
            )}
          </>
        )}
      </LegendItemContainer>
      {shouldRenderDivider && <LegendDivider />}
    </LegendGroup>
  );
};

export default LegendLayerGroup;
