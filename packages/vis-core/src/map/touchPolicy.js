/**
 * How maps respond to touch, the same on every pane.
 */

/**
 * Whether this is a phone or tablet with no mouse: a narrow viewport, a coarse pointer and no
 * fine one. A narrow desktop window doesn't count, so it keeps drag pan and scroll zoom.
 *
 * @returns {boolean}
 */
export function isTouchOnlyDevice() {
  const matches = (query) => window.matchMedia(query).matches;
  const isNarrowViewport = matches("(max-width: 900px)");
  const hasCoarsePointer = matches("(pointer: coarse)") || matches("(any-pointer: coarse)");
  const hasFinePointer = matches("(pointer: fine)") || matches("(any-pointer: fine)");
  return isNarrowViewport && hasCoarsePointer && !hasFinePointer;
}

/**
 * On touch-only devices, one finger pans the map and two fingers zoom it (without rotating);
 * gestures meant for a mouse or keyboard are off. Elsewhere the map is left as created.
 *
 * Stacked maps on a phone leave part of the page outside the maps on screen, so the page can
 * still be scrolled from there (see the map grid's mobile layout).
 *
 * @param {Object} map - MapLibre map.
 * @returns {boolean} Whether the touch policy was applied.
 */
export function applyTouchPolicy(map) {
  if (!isTouchOnlyDevice()) return false;
  map.dragPan.enable();
  map.touchZoomRotate.enable();
  map.touchZoomRotate.disableRotation();
  map.scrollZoom.disable();
  map.doubleClickZoom.disable();
  map.boxZoom.disable();
  map.keyboard.disable();
  return true;
}
