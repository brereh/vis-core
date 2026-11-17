/**
 * Which panes a filter applies to.
 *
 * Pure: resolved once per page (in MapContext) and stored on the filter as `panes` and
 * `paneScope`, so nothing else needs to work it out again.
 */
import { LEFT_PANE_ID, RIGHT_PANE_ID, panesShowing } from "./resolveMapGrid";

const LEGACY_SIDES = {
  left: [LEFT_PANE_ID],
  right: [RIGHT_PANE_ID],
};

/**
 * The legacy name rules for side-by-side pages: a filter whose name contains "Left" or
 * "Right" targets that pane; any other filter on a visualisation whose name contains "Side"
 * targets both. Returns null for filters the rules don't cover.
 *
 * The Left/Right rule applies whatever the visualisation is called, as the legacy code did
 * when setting initial values and when picking a feature-lookup side.
 */
function legacyNamedSide(filter) {
  const name = filter.filterName ?? "";
  if (name.includes("Left")) return "left";
  if (name.includes("Right")) return "right";
  if (filter.visualisations?.[0]?.includes("Side")) return "both";
  return null;
}

const isDualPreset = (grid) => grid.preset === "dual";

/**
 * Resolves the panes a filter targets.
 *
 * In order:
 * 1. `filter.panes`: an array of pane ids, or "all".
 * 2. Legacy `filter.sides` / `filter.side`: "left", "right" or "both" (side-by-side pages).
 * 3. Legacy name rules, on side-by-side pages only (see `legacyNamedSide`).
 * 4. The panes showing any of the filter's visualisations; failing that, those showing
 *    `filter.layer`; failing that, every pane.
 *
 * Unknown pane ids are dropped; if none is left, resolution carries on with step 2.
 *
 * @param {Object} filter - Filter config.
 * @param {Object} grid - From `resolveMapGrid`.
 * @returns {{ panes: string[], paneScope: "all"|"subset", source: string }} `source` says
 *   which rule applied ("panes", "sides", "names" or "default").
 */
export function resolveFilterPanes(filter, grid) {
  const all = grid.paneIds;
  const result = (panes, source) => {
    const known = all.filter((id) => panes.includes(id));
    return { panes: known, paneScope: known.length === all.length ? "all" : "subset", source };
  };

  if (filter.panes === "all") return result(all, "panes");
  if (Array.isArray(filter.panes)) {
    const resolved = result(filter.panes, "panes");
    if (resolved.panes.length > 0) return resolved;
  }

  const side = filter.sides ?? filter.side;
  if (side && isDualPreset(grid)) {
    return result(LEGACY_SIDES[side] ?? all, "sides");
  }

  if (isDualPreset(grid)) {
    const named = legacyNamedSide(filter);
    if (named) return result(LEGACY_SIDES[named] ?? all, "names");
  }

  const byVisualisation = [
    ...new Set((filter.visualisations ?? []).flatMap((visualisation) => panesShowing(grid, { visualisation }))),
  ];
  if (byVisualisation.length > 0) return result(byVisualisation, "default");

  if (filter.layer) {
    const byLayer = panesShowing(grid, { layer: filter.layer });
    if (byLayer.length > 0) return result(byLayer, "default");
  }

  return result(all, "default");
}

const filterLabel = (filter) => filter.filterName ?? filter.paramName ?? filter.id ?? "(unnamed)";

/**
 * Warnings for filters that pick their panes through the legacy side-by-side rules, so page
 * authors can move them onto `panes`:
 * - on the side-by-side preset, a filter targeted by its name ("Left"/"Right", or a "Side"
 *   visualisation) rather than by `panes` or `sides`;
 * - on a side-by-side page that has a grid, a filter with `sides` or a name the legacy rules
 *   would have used, as those rules no longer apply there.
 *
 * @param {Object[]} filters - Filter configs.
 * @param {Object} grid - From `resolveMapGrid`.
 * @param {string} [pageType] - The page's type.
 * @returns {string[]}
 */
export function legacyTargetingWarnings(filters, grid, pageType) {
  const hasPanes = (filter) => filter.panes === "all" || (Array.isArray(filter.panes) && filter.panes.length > 0);
  return (filters ?? []).flatMap((filter) => {
    if (hasPanes(filter)) return [];
    if (isDualPreset(grid)) {
      return resolveFilterPanes(filter, grid).source === "names"
        ? [`Filter "${filterLabel(filter)}" picks its panes from its name; give it "panes" instead.`]
        : [];
    }
    if (pageType === "DualMapLayout" && grid.preset === "custom" && ((filter.sides ?? filter.side) || legacyNamedSide(filter))) {
      return [
        `Filter "${filterLabel(filter)}" relies on "sides" or its name to pick panes, which a page with a grid doesn't use; give it "panes" instead.`,
      ];
    }
    return [];
  });
}

/**
 * A warning when the page's feature-select filters target different panes: there is one draw
 * control, on the first one's pane, so the others select on that pane too.
 *
 * Configured grids only: presets keep the draw control on their primary pane.
 *
 * @param {Object[]} filters - Filters with resolved `panes`.
 * @param {string[]} featureSelectTypes - The filter types that use the draw control.
 * @param {Object} grid - From `resolveMapGrid`.
 * @returns {string[]}
 */
export function drawPaneWarnings(filters, featureSelectTypes, grid) {
  if (grid?.preset !== "custom") return [];
  const selects = (filters ?? []).filter((filter) => featureSelectTypes.includes(filter.type));
  const firstPanes = selects.map((filter) => filter.panes?.[0]).filter(Boolean);
  if (new Set(firstPanes).size <= 1) return [];
  return [
    `Feature-select filters target different panes (${[...new Set(firstPanes)].join(", ")}); all of them select on "${firstPanes[0]}", where the draw control is.`,
  ];
}
