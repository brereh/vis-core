import React from "react";
import styled from "styled-components";
import { DynamicLegend } from "Components/DynamicLegend/DynamicLegend";
import { useMapContext } from "hooks/useMapContext";
import { selectMapGrid, selectPaneData, selectPaneMap } from "../../reducers/mapSelectors";

/** Visualisation types drawn on a map. */
const MAP_VISUALISATION_TYPES = ["joinDataToMap", "geojson"];

const LegendStack = styled.div`
  position: absolute;
  bottom: 40px;
  right: 10px;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 8px;
  max-height: calc(100% - 60px);
  overflow-y: auto;
  z-index: 1001;

  @media ${(props) => props.theme.mq.mobile} {
    position: static;
    max-height: none;
  }
`;

/**
 * The page's groups of panes that share colour classes: every pane with shared classification
 * together, and each pane with its own classification on its own.
 *
 * @param {Object} grid - From `resolveMapGrid`.
 * @returns {Array<{ id: string, paneIds: string[], title: string|undefined }>}
 */
export function classificationGroups(grid) {
  const shared = grid.panes.filter((pane) => pane.classification !== "own");
  const own = grid.panes.filter((pane) => pane.classification === "own");
  const groups = [];
  if (shared.length) {
    const titles = shared.map((pane) => pane.title).filter(Boolean);
    groups.push({ id: "shared", paneIds: shared.map((p) => p.id), title: titles.length ? titles.join(" + ") : undefined });
  }
  own.forEach((pane) => groups.push({ id: pane.id, paneIds: [pane.id], title: pane.title ?? pane.id }));
  return groups;
}

/**
 * The pane whose map a group's legend lists: the group's last pane with data for the first map
 * visualisation the group shows, or the group's last pane. (On a side-by-side page: the right
 * pane unless only the left has data, as before.)
 */
export function legendPaneId(state, grid, paneIds) {
  const panes = grid.panes.filter((pane) => paneIds.includes(pane.id));
  const firstVisualisation = Object.entries(state.visualisations ?? {}).find(
    ([name, vis]) =>
      MAP_VISUALISATION_TYPES.includes(vis?.type) &&
      panes.some((pane) => pane.showsEverything || (pane.visualisations ?? []).includes(name))
  )?.[0] ?? Object.keys(state.visualisations ?? {})[0];
  const hasData = (paneId) => (selectPaneData(state, paneId, firstVisualisation)?.length ?? 0) > 0;
  const withData = paneIds.filter(hasData);
  return withData.length ? withData[withData.length - 1] : paneIds[paneIds.length - 1];
}

/**
 * The page's legend: one for each group of panes sharing colour classes. A page with a single
 * group (every preset) shows one legend, as before; several groups show a stack of legends,
 * each headed with its panes' titles.
 */
export function PageLegend() {
  const { state } = useMapContext();
  const grid = selectMapGrid(state);
  const legends = classificationGroups(grid)
    .map((group) => ({ ...group, map: selectPaneMap(state, legendPaneId(state, grid, group.paneIds)) }))
    .filter((group) => group.map);

  if (legends.length === 0) return null;
  if (legends.length === 1) return <DynamicLegend map={legends[0].map} />;
  return (
    <LegendStack>
      {legends.map((group) => (
        <DynamicLegend key={group.id} map={group.map} title={group.title} stacked />
      ))}
    </LegendStack>
  );
}
