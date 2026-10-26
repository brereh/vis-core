import styled, { keyframes } from "styled-components";
import { LEGEND_MAX_DIAMETER, mobileMQ } from "./DynamicLegend.styles";

/** Flex column wrapper for a single legend group's items. */
export const LegendItemContainer = styled.div`
  display: flex;
  flex-direction: column;
  min-width: 0;
`;

/**
 * Outer wrapper for one layer's legend group. Elevates z-index when its
 * popover is open to ensure it renders above sibling groups.
 *
 * @prop {boolean} [$isOpen] - When true, applies a very high z-index.
 */
export const LegendGroup = styled.div`
  width: 100%;
  min-width: 260px;
  position: relative;
  /* Massively high z-index when open to defeat any sibling stacking contexts */
  z-index: ${(props) => (props.$isOpen ? 999999 : 1)};
  
  @media ${mobileMQ} {
    border: 1px solid #ccc;
    padding: 8px;
    margin-bottom: 8px;
    border-radius: 10px;
    box-shadow: 0 1px 4px rgba(0, 0, 0, 0.3);
  }
`;

/** Row containing the legend title/subtitle and the cog button. */
export const LegendHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  width: 100%;
  margin-bottom: 4px;
`;

/** Bold layer name displayed at the top of each legend group. */
export const LegendTitle = styled.div`
  font-weight: bold;
  text-align: left;
  margin-bottom: 2px;
  max-width: 150px;
  font-size: 0.9em;
`;

/** Italic subtitle below the legend title (e.g. unit or filter description). */
export const LegendSubtitle = styled.h2`
  font-weight: normal;
  text-align: left;
  margin-top: 2px;
  margin-bottom: 2px;
  font-size: small;
  font-style: italic;
`;

/** Row container for a single swatch + label pair. */
export const LegendItem = styled.div`
  display: flex;
  align-items: center;
  min-width: 0;
  font-size: medium;
`;

/**
 * Circular colour swatch for point/circle layers.
 *
 * @prop {number} diameter - Diameter of the circle in pixels.
 * @prop {string} color - CSS background colour.
 */
export const CircleSwatch = styled.div`
  width: ${(props) => Math.min(props.diameter, LEGEND_MAX_DIAMETER)}px;
  height: ${(props) => Math.min(props.diameter, LEGEND_MAX_DIAMETER)}px;
  flex-shrink: 0;
  background-color: ${(props) => props.color};
  border: 1px solid #333;
  border-radius: 50%;
  margin-right: 5px;
`;

/**
 * Rectangular swatch for line layers, supporting solid and dashed styles.
 *
 * @prop {number} height - Height (thickness) of the line swatch in pixels.
 * @prop {string} color - CSS colour.
 * @prop {boolean} isDashed - When true renders a dashed border instead of a solid fill.
 */
export const LineSwatch = styled.div`
  width: 50px;
  height: ${(props) => props.height}px;
  ${(props) => props.isDashed 
    ? `border-top: ${props.height}px dashed ${props.color}; background-color: transparent;`
    : `background-color: ${props.color};`
  }
  margin-right: 5px;
`;

/**
 * Square colour swatch for polygon/fill layers.
 *
 * @prop {string} color - CSS background colour.
 */
export const PolygonSwatch = styled.div`
  width: 15px;
  height: 15px;
  background-color: ${(props) => props.color};
  border: 1px solid #333;
  margin-right: 5px;
`;

/** Small text label displayed alongside each legend swatch. */
export const LegendLabel = styled.span`
  font-size: small;
  text-align: left;
  flex: 1;
`;

/**
 * Italic annotation appended after the label on the first and last discrete
 * swatch rows, communicating the scale direction (e.g. "Lowest Risk of TRSE").
 * Mirrors the AnnotationRow used in the continuous gradient bar.
 */
export const SwatchAnnotation = styled.span`
  font-size: 10px;
  color: #666;
  font-style: italic;
  margin-left: 6px;
  white-space: nowrap;
`;

/** Thin horizontal rule used to separate consecutive legend groups. */
export const LegendDivider = styled.div`
  height: 1px;
  background-color: #ccc;
  margin: 12px 0;
`;

/**
 * Wrapper for the InfoBox shown when data falls outside the band range.
 * Controls spacing within the legend panel and resets the InfoBox's own
 * default margins so the layout stays compact.
 */
export const OutOfBandWrapper = styled.div`
  width: 0;
  min-width: 100%;
`;

/** Flex column container for discrete swatch rows in non-continuous display mode. */
export const DiscreteSwatchesContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-bottom: 12px;
`;

/** Wrapper that positions the cog button relative to the popover it controls. */
export const CogMenuContainer = styled.div`
  position: relative;
  display: flex;
  align-items: center;
`;

/** Icon-only button that opens the legend options popover. */
export const CogButton = styled.button`
  background: none;
  border: none;
  cursor: pointer;
  padding: 2px 4px;
  color: #666;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  
  &:hover {
    background-color: #f0f0f0;
    color: #000;
  }
  
  svg {
    width: 14px;
    height: 14px;
    fill: currentColor;
  }
`;

/** Keyframe animation for the options popover entrance. */
export const popoverFadeIn = keyframes`
  from {
    opacity: 0;
    transform: translateY(4px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
`;

/** Floating panel of display-mode and scale-mode options for a legend group. */
export const OptionsPopover = styled.div`
  position: absolute;
  bottom: 100%; 
  right: 0;     
  margin-bottom: 8px; 
  background: white;
  border: 1px solid #e0e0e0;
  border-radius: 6px;
  padding: 12px;
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.25); /* Slightly stronger shadow */
  z-index: 999999; /* Maximum z-index */
  display: flex;
  flex-direction: column;
  gap: 10px;
  font-size: 13px;
  min-width: 180px;
  color: #333;
  text-align: left;
  animation: ${popoverFadeIn} 0.2s ease-out;

  strong {
    font-weight: 600;
    margin-bottom: 2px;
    color: #111;
  }

  label {
    display: flex;
    align-items: center;
    gap: 8px;
    cursor: pointer;
    font-weight: normal;
  }
  
  hr {
    margin: 4px 0;
    border: none;
    border-top: 1px solid #eee;
    width: 100%;
  }
`;
