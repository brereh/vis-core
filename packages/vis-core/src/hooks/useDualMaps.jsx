import { useState, useEffect } from "react";
import maplibregl from "maplibre-gl";
import { syncMaps } from "utils";
import { mapOptions, attributionText, rememberInitialBaseSources } from "../map/mapSetup";

/**
 * Whether this is a phone or tablet with no mouse, where single-finger gestures should pan
 * the map but desktop gestures (scroll zoom, double-click zoom, box zoom, keys) are off.
 */
const isTouchOnlyMobile = () => {
  const isNarrowViewport = window.matchMedia("(max-width: 900px)").matches;
  const hasCoarsePointer =
    window.matchMedia("(pointer: coarse)").matches ||
    window.matchMedia("(any-pointer: coarse)").matches;
  const hasFinePointer =
    window.matchMedia("(pointer: fine)").matches ||
    window.matchMedia("(any-pointer: fine)").matches;
  return isNarrowViewport && hasCoarsePointer && !hasFinePointer;
};

/**
 * Custom hook to manage two synchronized MapLibre maps.
 * @function useDualMaps
 * @param {React.RefObject} leftMapContainerRef - Ref object pointing to the left map container DOM element.
 * @param {React.RefObject} rightMapContainerRef - Ref object pointing to the right map container DOM element.
 * @param {string} mapStyle - A custom map style to be used for both maps.
 * @param {Array<number>} mapCentre - The initial map center coordinates [longitude, latitude].
 * @param {number} mapZoom - The initial map zoom level.
 * @param {string} extraCopyrightText - Extra copyright text that needs to go in the bottom right bar.
 * @returns {Object} An object containing the left and right map instances, map style loaded state, map loaded state, and map ready state.
 */
export const useDualMaps = (
  leftMapContainerRef,
  rightMapContainerRef,
  mapStyle,
  mapCentre,
  mapZoom,
  extraCopyrightText
) => {
  const [leftMap, setLeftMap] = useState(null);
  const [rightMap, setRightMap] = useState(null);
  const [isMapStyleLoaded, setIsMapStyleLoaded] = useState(false);
  const [isMapLoaded, setIsMapLoaded] = useState(false);
  const isMapReady = isMapLoaded && isMapStyleLoaded;

  useEffect(() => {
    const createMap = (containerRef) => {
      const map = new maplibregl.Map(
        mapOptions({ container: containerRef.current, mapStyle, mapCentre, mapZoom })
      );
      map.on("style.load", () => {
        rememberInitialBaseSources(map);
        setIsMapStyleLoaded(true);
      });
      map.on("load", () => {
        setIsMapLoaded(true);
      });
      map.addControl(new maplibregl.NavigationControl(), "bottom-left");
      return map;
    };

    const leftMapInstance = createMap(leftMapContainerRef);
    const rightMapInstance = createMap(rightMapContainerRef);
    rightMapInstance.addControl(
      new maplibregl.AttributionControl({
        compact: true,
        customAttribution: attributionText(extraCopyrightText),
      }),
      "bottom-right"
    );
    leftMapInstance.resize();
    rightMapInstance.resize();

    if (isTouchOnlyMobile()) {
      [leftMapInstance, rightMapInstance].forEach((map) => {
        map.scrollZoom.disable();
        map.dragPan.disable();
        map.doubleClickZoom.disable();
        map.boxZoom.disable();
        map.keyboard.disable();
        map.touchZoomRotate.enable();
        map.touchZoomRotate.disableRotation();
      });
    }

    const unsync = syncMaps(leftMapInstance, rightMapInstance);

    setLeftMap(leftMapInstance);
    setRightMap(rightMapInstance);

    // Tear down the instances created by this run of the effect. (Reading leftMap/rightMap
    // state here would see the values from the first render, which are null.)
    return () => {
      unsync();
      leftMapInstance.remove();
      rightMapInstance.remove();
      setLeftMap(null);
      setRightMap(null);
      setIsMapLoaded(false);
      setIsMapStyleLoaded(false);
    };
    // The maps are created once per mount; centre and zoom changes are applied below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update map center if mapCentre changes
  useEffect(() => {
    if (leftMap && rightMap && Array.isArray(mapCentre) && mapCentre.length === 2) {
      leftMap.setCenter(mapCentre);
      rightMap.setCenter(mapCentre);
    }
  }, [leftMap, rightMap, mapCentre]);

  // Update map zoom if mapZoom changes
  useEffect(() => {
    if (leftMap && rightMap && mapZoom != null) {
      leftMap.setZoom(mapZoom);
      rightMap.setZoom(mapZoom);
    }
  }, [leftMap, rightMap, mapZoom]);

  return { leftMap, rightMap, isMapStyleLoaded, isMapLoaded, isMapReady };
};
