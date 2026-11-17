import React, { useEffect, useRef } from "react";
import styled from "styled-components";

import { useMapContext } from "hooks/useMapContext";
import { useBaseMapTransition } from "hooks/useBaseMapTransition";
import { useShallowStableArray } from "hooks/usePaneVisualisation";
import { actionTypes } from "reducers";
import { selectMapGrid, selectMaps, selectPaneMap } from "../../reducers/mapSelectors";
import { getBaseMap } from "../../map/baseMaps";
import { focusFeature, showFeatureLabel } from "../../map/interactions/featureFocus";
import { MapGroupProvider, useMapGroup } from "./MapGroupContext";
import { CalloutCardStack } from "./CalloutCardStack";
import MapPane from "./MapPane";
import { PageLegend } from "./PageLegend";
import MapStyleToggle from "./MapStyleToggle";

/** Tiles kept in memory across all panes; each pane gets a share (at most the default 500). */
const TOTAL_TILE_CACHE = 1000;
const MAX_TILE_CACHE_PER_PANE = 500;

const GridContainer = styled.div`
  position: relative;
  display: grid;
  grid-template-columns: ${({ $columnSizes }) => trackTemplate($columnSizes)};
  grid-template-rows: ${({ $rowSizes }) => trackTemplate($rowSizes)};
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
    /* A cell with nothing to show takes no space (or gap) in the stack. */
    ${({ $empty }) => ($empty ? "display: none;" : "")}
  }
`;

/** Grid tracks from relative sizes: [2, 1] → "minmax(0, 2fr) minmax(0, 1fr)". */
const trackTemplate = (sizes) => sizes.map((size) => `minmax(0, ${size}fr)`).join(" ");

/** What each cell type renders. Only maps for now; other widgets can be added here. */
const CELL_COMPONENTS = { map: MapPane };

const cellPlacement = (pane) => ({
  gridColumn: `${pane.column} / span ${pane.columnSpan}`,
  gridRow: `${pane.row} / span ${pane.rowSpan}`,
});

/**
 * Moves the map to a feature chosen in a select-and-pan filter and labels the feature for a few
 * seconds. The request names the panes its filter targets (the primary pane if it names none):
 * one target pane per sync group is moved, and the rest of its group follows; the label goes on
 * every target pane and the panes in their groups.
 */
function useFeatureFocus(state, dispatch, grid) {
  const group = useMapGroup();
  const labelTimeoutsRef = useRef({});
  const maps = useShallowStableArray(selectMaps(state));

  // Runs on each new focus request; the registered maps it reads are current at that moment.
  useEffect(() => {
    const focus = state.mapBoundsAndCentroid;
    if (!focus) return;
    const named = (focus.panes ?? []).filter((paneId) => grid.paneIds.includes(paneId));
    const targets = named.length ? named : [grid.primaryPaneId];
    // Wait until every target pane's map is ready, so none misses the move.
    if (!targets.every((paneId) => selectPaneMap(state, paneId))) return;

    const moved = new Set();
    const labelled = new Set();
    targets.forEach((paneId) => {
      // Only maps registered as ready: a label can't be added before a map's style loads.
      const groupPanes = Object.keys(group.mapsInGroupOf(paneId)).filter((id) => selectPaneMap(state, id));
      const panesInGroup = groupPanes.length ? groupPanes : [paneId];
      if (!moved.has(paneId)) {
        focusFeature(selectPaneMap(state, paneId), focus);
        panesInGroup.forEach((id) => moved.add(id));
        moved.add(paneId);
      }
      if (focus.featureName && focus.centroid) {
        panesInGroup.forEach((id) => labelled.add(id));
      }
    });

    labelled.forEach((paneId) => {
      labelTimeoutsRef.current[paneId] ??= { current: null };
      showFeatureLabel(selectPaneMap(state, paneId), {
        featureName: focus.featureName,
        centroid: focus.centroid,
        timeoutRef: labelTimeoutsRef.current[paneId],
      });
    });
    dispatch({ type: actionTypes.CLEAR_BOUNDS_AND_CENTROID });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [maps, state.mapBoundsAndCentroid, dispatch, group, grid]);
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

  useFeatureFocus(state, dispatch, grid);

  const tileCacheSize = Math.min(MAX_TILE_CACHE_PER_PANE, Math.round(TOTAL_TILE_CACHE / Math.max(2, paneCount)));
  const primaryMap = selectPaneMap(state, grid.primaryPaneId);
  const columnSizes = grid.columnSizes ?? Array.from({ length: grid.columns }, () => 1);
  const rowSizes = grid.rowSizes ?? Array.from({ length: grid.rows }, () => 1);

  return (
    <GridContainer $columnSizes={columnSizes} $rowSizes={rowSizes} $paneCount={paneCount}>
      {(grid.cells ?? grid.panes).map((cell) => {
        const CellComponent = CELL_COMPONENTS[cell.type ?? "map"];
        return (
          <GridCell key={cell.id} style={cellPlacement(cell)} data-cell-id={cell.id} $empty={!CellComponent}>
            {CellComponent && (
              <CellComponent
                pane={cell}
                isPrimary={cell.id === grid.primaryPaneId}
                extraCopyrightText={extraCopyrightText}
                compactAttribution={paneCount > 1}
                tileCacheSize={tileCacheSize}
              />
            )}
          </GridCell>
        );
      })}
      {showMapStyleToggle && primaryMap && <MapStyleToggle map={primaryMap} />}
      {state.visualisations && (
        <CalloutCardStack visualisationConfigs={state.visualisations} sidebarIsOpen={sidebarIsOpen} />
      )}
      <PageLegend />
    </GridContainer>
  );
}

/**
 * The page's maps: one pane per map cell of the page's grid (one for a single-map page, two
 * side by side for a dual page, or as `config.grid` lays them out), with the page's callout
 * cards and legend drawn once over them.
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
