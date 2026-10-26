import { LEGEND_MAX_DIAMETER } from "./DynamicLegend.styles";
import React, { useId } from "react";
import { WidthTrackSvg } from "./ContinuousGradientBar.styles";

// Vertical padding (px) added above and below track content to prevent clipping.
const TRACK_PAD = 2;


/**
 * LineWidthTrack
 *
 * Renders a filled SVG polygon whose top edge traces the interpolated line width at each
 * colour stop. The polygon fill is a `<linearGradient>` that mirrors the colour stops of
 * the gradient bar, so both colour and thickness are encoded in a single visual object.
 *
 * Only rendered when width actually varies across the stops.
 *
 * @param {Object} props
 * @param {Array}  props.stops - `stopsWithPercentages` from `ContinuousGradientBar`:
 *   each element has `{ color, width, percent }`.
 */
export const LineWidthTrack = ({ stops }) => {
  const gradId = useId();

  const rawWidths = stops.map(s => (Number.isFinite(s.width) && s.width > 0 ? s.width : 1));
  const maxWidth = Math.max(...rawWidths);
  const totalHeight = maxWidth + TRACK_PAD;
  const bottomY = totalHeight - TRACK_PAD / 2;

  // Build a closed polygon: top edge traces the width profile, bottom edge is flat.
  // Points run left-to-right along the top, then right-to-left along the bottom.
  const topPoints = stops.map((s, i) => `${s.percent},${bottomY - rawWidths[i]}`);
  const bottomPoints = [...stops].reverse().map(s => `${s.percent},${bottomY}`);
  const points = [...topPoints, ...bottomPoints].join(" ");

  return (
    <WidthTrackSvg
      viewBox={`0 0 100 ${totalHeight}`}
      preserveAspectRatio="none"
      height={totalHeight}
    >
      <defs>
        <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="0%">
          {stops.map((s, i) => (
            <stop key={i} offset={`${s.percent}%`} stopColor={s.color} />
          ))}
        </linearGradient>
      </defs>
      <polygon
        points={points}
        fill={`url(#${gradId})`}
        stroke="none"
        opacity="0.85"
      />
    </WidthTrackSvg>
  );
};

/**
 * CircleTrack
 *
 * Renders a row of CSS circles (div + border-radius), one per colour stop, positioned
 * horizontally by each stop's `percent` and sized by its `width` (circle diameter in px).
 * Each circle is filled with its stop's colour.
 *
 * CSS divs are used rather than SVG `<circle>` elements because SVG's non-uniform viewBox
 * scaling (needed to stretch stops across the bar width) distorts circles into ellipses.
 *
 * Only rendered when width actually varies across the stops.
 *
 * @param {Object} props
 * @param {Array}  props.stops - `stopsWithPercentages` from `ContinuousGradientBar`:
 *   each element has `{ color, width, percent }`.
 */
export const CircleTrack = ({ stops }) => {
  const rawDiameters = stops.map(s => (Number.isFinite(s.width) && s.width > 0 ? s.width : 2));
  // Circle sizes match the map up to LEGEND_MAX_DIAMETER; above that (for example a radius that
  // grows with zoom) every circle is scaled by the same factor, so the proportions stay right.
  const scale = Math.min(1, LEGEND_MAX_DIAMETER / Math.max(...rawDiameters));
  const diameters = rawDiameters.map(d => d * scale);
  const maxDiameter = Math.max(...diameters);

  // The container height accommodates the largest circle plus vertical clearance.
  const trackHeight = maxDiameter + TRACK_PAD * 2;

  return (
    <div style={{
      position: 'relative',
      width: '100%',
      height: `${trackHeight}px`,
      marginBottom: '2px',
    }}>
      {stops.map((s, i) => {
        const d = diameters[i];
        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              // Place the circle's left edge so its centre lands at s.percent% of the
              // container width. ContinuousScaleContainer's 16 px side padding provides
              // room for the half-circles that extend beyond the 0 % and 100 % edges.
              left: `calc(${s.percent}% - ${d / 2}px)`,
              bottom: `${TRACK_PAD}px`,
              width: `${d}px`,
              height: `${d}px`,
              borderRadius: '50%',
              background: s.color,
              border: '1px solid rgba(0,0,0,0.2)',
              boxSizing: 'border-box',
            }}
          />
        );
      })}
    </div>
  );
};
