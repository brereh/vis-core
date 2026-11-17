import React, { useEffect, useRef } from "react";
import styled from "styled-components";

import { DynamicLegend } from "Components/DynamicLegend/DynamicLegend";
import { useMapContext } from "hooks/useMapContext";
import { useBaseMapTransition } from "hooks/useBaseMapTransition";
import { useShallowStableArray } from "hooks/usePaneVisualisation";
import { actionTypes } from "reducers";
import { selectMapGrid, selectMaps, selectPaneData, selectPaneMap } from "../../reducers/mapSelectors";
import { getBaseMap } from "../../map/baseMaps";
import { focusFeature, showFeatureLabel } from "../../map/interactions/featureFocus";
import { MapGroupProvider, useMapGroup } from "./MapGroupContext";
import { CalloutCardStack } from "./CalloutCardStack";
import MapPane from "./MapPane";
import MapStyleToggle from "./MapStyleToggle";

/** Tiles kept in memory across all panes; each pane gets a share (at most the default 500). */
const TOTAL_TILE_CACHE = 1000;
const MAX_TILE_CACHE_PER_PANE = 500;

const GridContainer = styled.div`
  position: relative;
  display: grid;
  grid-template-columns: repeat(${({ $columns }) => $columns}, minmax(0, 1fr));
  grid-template-rows: repeat(${({ $rows }) => $rows}, minmax(0, 1fr));
  width: 100%;
  height: calc(100vh - 75px);

  @media ${(props) => props.theme.mq.mobile} {
    /* Panes stack in order. The gap keeps part of the page outside the maps on screen, so the
       page can be scrolled with one finger while one-finger drags pan the maps. */
    display: flex;
    flex-direction: column;
    gap: ${({ $paneCount }) => ($paneCount > 1 ? "24px" : "0")};
    height: auto;
  }
`;

const GridCell = styled.div`
  position: relative;
  min-width: 0;
  min-height: 0;
  overflow: hidden;

  @media ${(props) => props.theme.mq.mobile} {
    width: 100%;
  }
`;

const cellPlacement = (pane) => ({
  gridColumn: `${pane.column} / span ${pane.columnSpan}`,
  gridRow: `${pane.row} / span ${pane.rowSpan}`,
});

/**
 * The map whose layers the legend lists: on a page with several panes, the last pane with data
 * for the first visualisation, or the last pane if none has any. (On a side-by-side page that
 * is the right pane unless only the left has data, as before.)
 */
function legendPaneId(state, grid) {
  const firstVisualisation = Object.keys(state.visualisations ?? {})[0];
  const hasData = (paneId) => (selectPaneData(state, paneId, firstVisualisation)?.length ?? 0) > 0;
  const withData = grid.paneIds.filter(hasData);
  return withData.length ? withData[withData.length - 1] : grid.paneIds[grid.paneIds.length - 1];
}

/**
 * Moves the primary pane to a feature chosen in a select-and-pan filter (its sync group
 * follows) and labels the feature on every map in that group for a few seconds.
 */
function useFeatureFocus(state, dispatch, primaryPaneId) {
  const group = useMapGroup();
  const labelTimeoutsRef = useRef({});
  const primaryMap = selectPaneMap(state, primaryPaneId);

  useEffect(() => {
    const focus = state.mapBoundsAndCentroid;
    if (!primaryMap || !focus) return;
    focusFeature(primaryMap, focus);
    if (focus.featureName && focus.centroid) {
      const maps = group.mapsInGroupOf(primaryPaneId);
      Object.entries(Object.keys(maps).length ? maps : { [primaryPaneId]: primaryMap }).forEach(
        ([paneId, map]) => {
          labelTimeoutsRef.current[paneId] ??= { current: null };
          showFeatureLabel(map, {
            featureName: focus.featureName,
            centroid: focus.centroid,
            timeoutRef: labelTimeoutsRef.current[paneId],
          });
        }
      );
    }
    dispatch({ type: actionTypes.CLEAR_BOUNDS_AND_CENTROID });
  }, [primaryMap, state.mapBoundsAndCentroid, dispatch, group, primaryPaneId]);
}

function MapGridContent({ extraCopyrightText, sidebarIsOpen, showMapStyleToggle }) {
  const { state, dispatch } = useMapContext();
  const grid = selectMapGrid(state);
  const paneCount = grid.panes.length;
  const maps = useShallowStableArray(selectMaps(state));

  // Base-map changes (style, labels, repaint) on every pane's map.
  useBaseMapTransition({
    maps,
    descriptor: getBaseMap(state.baseMapId),
    applicationLayers: state.layers,
  });

  useFeatureFocus(state, dispatch, grid.primaryPaneId);

  const tileCacheSize = Math.min(MAX_TILE_CACHE_PER_PANE, Math.round(TOTAL_TILE_CACHE / Math.max(2, paneCount)));
  const legendMap = selectPaneMap(state, legendPaneId(state, grid));
  const primaryMap = selectPaneMap(state, grid.primaryPaneId);

  return (
    <GridContainer $columns={grid.columns} $rows={grid.rows} $paneCount={paneCount}>
      {grid.panes.map((pane) => (
        <GridCell key={pane.id} style={cellPlacement(pane)}>
          <MapPane
            pane={pane}
            isPrimary={pane.id === grid.primaryPaneId}
            extraCopyrightText={extraCopyrightText}
            compactAttribution={paneCount > 1}
            tileCacheSize={tileCacheSize}
          />
        </GridCell>
      ))}
      {showMapStyleToggle && primaryMap && <MapStyleToggle map={primaryMap} />}
      {state.visualisations && (
        <CalloutCardStack visualisationConfigs={state.visualisations} sidebarIsOpen={sidebarIsOpen} />
      )}
      {legendMap && <DynamicLegend map={legendMap} />}
    </GridContainer>
  );
}

/**
 * The page's maps: one pane per map cell of the page's grid (one for a single-map page, two
 * side by side for a dual page), with the page's callout cards and legend drawn once over them.
 *
 * @param {Object} props
 * @param {string} [props.extraCopyrightText]
 * @param {boolean} [props.sidebarIsOpen]
 * @param {boolean} [props.showMapStyleToggle=false]
 */
const MapGrid = (props) => (
  <MapGroupProvider>
    <MapGridContent {...props} />
  </MapGroupProvider>
);

export default React.memo(MapGrid);
