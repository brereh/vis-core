import styled from "styled-components";

/** Media query string for mobile breakpoint (max-width: 900px). */
export const MOBILE_Q = '(max-width: 900px)';

/** Largest circle the legend draws, in px. Radii that grow with zoom are scaled down to fit. */
export const LEGEND_MAX_DIAMETER = 48;

/**
 * Returns the mobile media query string from the theme if available,
 * otherwise falls back to {@link MOBILE_Q}.
 *
 * @param {Object} p - Styled-components props (includes `theme`).
 * @returns {string} A CSS media query string.
 */
export const mobileMQ = (p) => p.theme?.mq?.mobile || MOBILE_Q;

/**
 * Root container for the legend panel. Positioned absolutely over the map
 * in desktop mode; renders as a static block when `$outside` is true (mobile).
 *
 * @prop {boolean} [$outside] - When true, switches to a static full-width layout.
 */
export const LegendContainer = styled.div`
  --scrollbar-width: 4px; /* Default scrollbar width for Webkit browsers */
  --firefox-scrollbar-width: 4px; /* Approximate scrollbar width for Firefox */  
  
  display: inline-flex;
  flex-direction: column;
  flex-wrap: wrap;
  gap: 0 15px;
  position: absolute;
  bottom: 40px;
  right: 10px;
  background: rgba(255, 255, 255, 0.9);
  padding: 15px;
  /* Adjust padding-right and left to account for scrollbar width */
  padding-right: calc(15px - var(--scrollbar-width)); /* For WebKit browsers */
  padding-left: calc(15px - var(--scrollbar-width)); /* For WebKit browsers */
  box-sizing: border-box; /* Include padding and border in width */
  border-radius: 10px;
  /* Sit above CalloutCard panels (z-index 1000) so the hover tooltip is never
     occluded by a card that happens to render on top of the legend. */
  z-index: 1100;
  min-width: 0;
  max-height: none;
  max-width: 80vw;
  overflow: visible;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.3);
  font-family: var(--font-family-base);
  font-size: medium;
  
  /* Custom scrollbar styling for Webkit-based browsers */
  &::-webkit-scrollbar {
    width: var(--scrollbar-width);
  }
  &::-webkit-scrollbar-track {
    background: transparent;
    border-radius: 10px;
  }
  &::-webkit-scrollbar-thumb {
    background-color: transparent; /* Default color */
    border-radius: 10px;
    background-clip: padding-box;
    transition: background-color 0.3s ease-in-out;
  }
  &:hover::-webkit-scrollbar-thumb {
    background-color: darkgrey; /* Color when hovered */
  }

  /* Firefox-specific styles */
  @-moz-document url-prefix() {
    scrollbar-width: thin;
    scrollbar-color: transparent transparent; /* Default color */
    padding-right: calc(15px - var(--firefox-scrollbar-width)); /* Adjust padding for Firefox */
    &:hover {
      scrollbar-color: darkgrey transparent; /* Color when hovered */
    }
  }

  
  @media ${mobileMQ} {
    display: flex;
    flex-direction: row;
    flex-wrap: wrap;
    gap: 0 10px;
  }

  /* Docked map layout: bottom right, just above the map attribution, at a fixed width that never
     runs past the map, scrolling rather than growing taller than it. */
  ${({ $docked }) => $docked && `
    right: 10px;
    bottom: 30px;
    left: auto;
    width: min(280px, calc(100% - 20px));
    max-width: calc(100% - 20px);
    max-height: calc(100% - 60px);
    overflow-y: auto;
    flex-wrap: nowrap;
  `}

  ${({ $outside }) => $outside && `
    position: static;
    display: block;
    bottom: auto;
    right: auto;
    width: 100%;
    max-width: 100%;
    max-height: none;
    box-shadow: none;
    border-radius: 10px;
    background: rgba(255,255,255,0.95);
    margin: 8px 0 0;
    padding: 12px 16px;
  `}
`;
