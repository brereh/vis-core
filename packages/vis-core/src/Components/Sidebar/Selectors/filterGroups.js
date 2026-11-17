/**
 * Groups a page's sidebar filters by the map panes they target (docs/Map Panes Consolidation
 * Plan.md §3.10).
 *
 * Grouping applies only when at least one pane has a title; otherwise the list stays flat, as
 * on the single and side-by-side presets.
 * - Filters targeting every pane (or no pane in particular) come first, with no heading.
 * - The rest are grouped by the set of panes they target, headed with those panes' titles
 *   joined with " + " (a pane without a title is named by its id).
 * - Groups follow the order their first filter appears in; filters keep config order.
 *
 * @param {Object[]} filters - The filters to show, with resolved `panes` and `paneScope`.
 * @param {Object} grid - The page's grid (from `resolveMapGrid`).
 * @returns {Array<{ key: string, title: string|undefined, filters: Object[] }>}
 */
export function groupFiltersByPane(filters, grid) {
  const list = filters ?? [];
  const panes = grid?.panes ?? [];
  if (!panes.some((pane) => pane.title)) return [{ key: "all", title: undefined, filters: list }];

  const order = panes.map((pane) => pane.id);
  const titleOf = (id) => panes.find((pane) => pane.id === id)?.title ?? id;
  const everywhere = { key: "all", title: undefined, filters: [] };
  const groups = new Map();

  list.forEach((filter) => {
    const targets = Array.isArray(filter.panes) ? filter.panes.filter((id) => order.includes(id)) : [];
    if (filter.paneScope === "all" || targets.length === 0 || targets.length === order.length) {
      everywhere.filters.push(filter);
      return;
    }
    const sorted = [...targets].sort((a, b) => order.indexOf(a) - order.indexOf(b));
    const key = `panes:${sorted.join(",")}`;
    if (!groups.has(key)) groups.set(key, { key, title: sorted.map(titleOf).join(" + "), filters: [] });
    groups.get(key).filters.push(filter);
  });

  return [everywhere, ...groups.values()].filter((group) => group.filters.length > 0);
}
