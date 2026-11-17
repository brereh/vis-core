import { useEffect, useRef } from "react";
import { useMapContext } from "hooks/useMapContext";
import { getSourceLayer } from 'utils';
import {
  ensureSpiderHoverSelectLayers,
  buildSpiderDataOffsetOne,
  collectSourcePoints,
} from "utils/mapSpiders";
import { getBaseMap } from "../../map/baseMaps";

/**
 * Applies or updates a filter on the parent layer to hide spiderfied duplicates.
 * It preserves any existing filter by wrapping with an "all" clause.
 *
 * @param {maplibregl.Map} map
 * @param {string} baseLayerId
 * @param {(number|string)[]} excludeIds
 */
function setDuplicateExclusionFilter(map, baseLayerId, excludeIds) {
  if (!map.getLayer(baseLayerId)) return;
  const current = map.getFilter(baseLayerId) || true;
  const notIn = ["!", ["in", ["get", "id"], ["literal", excludeIds]]];
  const next = current === true ? notIn : ["all", current, notIn];
  try {
    map.setFilter(baseLayerId, next);
  } catch {}
}

/**
 * Mirrors parent paint + visibility onto the spider point layer by sampling
 * the live map style (so runtime UI changes are preserved).
 *
 * @param {maplibregl.Map} map
 * @param {string} baseLayerId
 */
function mirrorToOverlay(map, baseLayerId) {
  const pointLayerId = `${baseLayerId}-spider`;
  if (!map.getLayer(pointLayerId) || !map.getLayer(baseLayerId)) return;

  const keys = [
    "circle-color",
    "circle-opacity",
    "circle-radius",
    "circle-stroke-color",
    "circle-stroke-width",
    "circle-stroke-opacity",
  ];
  const vis = map.getLayoutProperty(baseLayerId, "visibility") || "visible";
  try {
    map.setLayoutProperty(pointLayerId, "visibility", vis);
  } catch {}

  keys.forEach((k) => {
    try {
      const v = map.getPaintProperty(baseLayerId, k);
      if (v !== undefined) map.setPaintProperty(pointLayerId, k, v);
    } catch {}
  });

  // For links, match visibility and basic opacity
  const linkLayerId = `${baseLayerId}-spider-links`;
  if (map.getLayer(linkLayerId)) {
    try {
      map.setLayoutProperty(linkLayerId, "visibility", vis);
    } catch {}
    const co = map.getPaintProperty(baseLayerId, "circle-opacity");
    const fallback = Array.isArray(co) ? co[co.length - 1] : co;
    if (fallback != null) {
      try {
        map.setPaintProperty(linkLayerId, "line-opacity", fallback);
      } catch {}
    }
  }
}

/**
 * SpiderLayer: builds "offsetOne" spider overlay and hides duplicates on the parent.
 *
 * - Offsets all but one per coincident group (anchor remains on the parent).
 * - Parent layer duplicates are hidden via a filter that excludes their ids.
 * - Adds hover/select layers for spider overlays (point+line) using generic helpers [6][7].
 * - Mirrors parent paint/visibility to the overlay from the live map style.
 */
export function SpiderLayer({ baseLayerId, map }) {
  const { state } = useMapContext();
  // Latest base-map theme, so overlay hover layers created later get the right colours.
  const themeRef = useRef("light");
  themeRef.current = getBaseMap(state.baseMapId)?.theme ?? "light";
  const debounce = useRef(null);
  const baseFilterRef = useRef(null); // to restore on unmount
  const prevExcludeIds = useRef([]); 

  useEffect(() => {
    if (!map) return;
    const base = map.getLayer(baseLayerId);
    if (!base || base.type !== "circle") return;

    // Save original filter once so we can restore on unmount
    if (baseFilterRef.current == null) {
      try {
        baseFilterRef.current = map.getFilter(baseLayerId) || null;
      } catch {
        baseFilterRef.current = null;
      }
    }

    const pointSourceId = `${baseLayerId}-spider-src`;
    const pointLayerId = `${baseLayerId}-spider`;
    const linkSourceId = `${baseLayerId}-spider-links-src`;
    const linkLayerId = `${baseLayerId}-spider-links`;

    const onSourceData = (e) => {
      // Check if the event is for our layer and if loading is complete
      if (e.sourceId === baseLayerId && e.isSourceLoaded) {
        schedule();
      }
    };
    map.on("sourcedata", onSourceData);

    const schedule = () => {
      if (debounce.current) clearTimeout(debounce.current);
      debounce.current = setTimeout(() => {
        rebuild();
        mirrorToOverlay(map, baseLayerId);
      }, 100);
    };
    map.on("zoomend", schedule);
    map.on("idle", () => mirrorToOverlay(map, baseLayerId));
    map.on("styledata", () => mirrorToOverlay(map, baseLayerId));

    function rebuild() {
      // Build overlay for duplicates and receive the ids to hide in the parent
      const allBasePoints = collectSourcePoints(map, baseLayerId);
      const { pointsFc, linksFc, index, excludeIds } = buildSpiderDataOffsetOne(
        map,
        baseLayerId,
        { features: allBasePoints }
      );

      // Persist index
      if (!map.__spiderIndex) map.__spiderIndex = {};
      map.__spiderIndex[baseLayerId] = index;

      // Add/update sources
      if (map.getSource(pointSourceId)) {
        map.getSource(pointSourceId).setData(pointsFc);
      } else {
        map.addSource(pointSourceId, { type: "geojson", data: pointsFc });
      }

      if (map.getSource(linkSourceId)) {
        map.getSource(linkSourceId).setData(linksFc);
      } else {
        map.addSource(linkSourceId, { type: "geojson", data: linksFc });
      }

      // Ensure overlay layers exist (we'll mirror the paint later)
      if (!map.getLayer(linkLayerId)) {
        map.addLayer({
          id: linkLayerId,
          type: "line",
          source: linkSourceId,
          paint: { "line-opacity": 0.7 },
        });
        try {
          map.moveLayer(linkLayerId, baseLayerId);
        } catch {}
      }

      if (!map.getLayer(pointLayerId)) {
        map.addLayer({
          id: pointLayerId,
          type: "circle",
          source: pointSourceId,
          paint: {},
        });
        try {
          map.moveLayer(pointLayerId, baseLayerId);
        } catch {}
      }

      // Add hover/select for overlay
      ensureSpiderHoverSelectLayers(map, baseLayerId, themeRef.current);

      // Initialise state: copy current state from parent to spider
      // The mirror handles updates, but we need to copy the state that exists now.
      const sourceLayer = getSourceLayer(map, baseLayerId);
      
      pointsFc.features.forEach((f) => {
        // We use map.getFeatureState directly on the parent source.
        // This is robust because we know the feature exists (we just collected it).
        const parentState = map.getFeatureState({
          source: baseLayerId,
          sourceLayer: sourceLayer,
          id: f.id
        });

        if (parentState) {
          map.setFeatureState(
            { source: pointSourceId, id: f.id },
            parentState
          );
        }
      });
      
      // Hide duplicates in parent (keeps exactly one visible per group)
      // 
      const idsChanged = 
        excludeIds.length !== prevExcludeIds.current.length ||
        excludeIds.some((id, i) => id !== prevExcludeIds.current[i]);

      if (idsChanged) {
        setDuplicateExclusionFilter(map, baseLayerId, excludeIds, baseFilterRef.current);
        prevExcludeIds.current = excludeIds;
      }
    }

    return () => {
      if (!map || !map.style) return;

      map.off("sourcedata", onSourceData);
      map.off("zoomend", schedule);
      map.off("idle", () => mirrorToOverlay(map, baseLayerId));
      map.off("styledata", () => mirrorToOverlay(map, baseLayerId));
      if (debounce.current) clearTimeout(debounce.current);

      // Restore parent filter
      try {
        map.setFilter(baseLayerId, baseFilterRef.current);
      } catch {}

      // Remove hover/select layers for overlay (before the source they read from)
      [
        `${baseLayerId}-spider-hover-halo`,
        `${baseLayerId}-spider-hover`,
        `${baseLayerId}-spider-select-halo`,
        `${baseLayerId}-spider-select`,
      ].forEach((id) => {
        if (map.getLayer(id)) map.removeLayer(id);
      });

      // Remove overlay
      if (map.getLayer(pointLayerId)) map.removeLayer(pointLayerId);
      if (map.getSource(pointSourceId)) map.removeSource(pointSourceId);
      if (map.getLayer(linkLayerId)) map.removeLayer(linkLayerId);
      if (map.getSource(linkSourceId)) map.removeSource(linkSourceId);
      if (map.__spiderIndex) delete map.__spiderIndex[baseLayerId];
    };
  }, [map, baseLayerId]);

  return null;
}
