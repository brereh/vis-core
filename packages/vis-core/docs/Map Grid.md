# Map grids and filter targeting

Every map page is a grid of cells. A `map` cell is a **pane**: a map of its own, with its own content, camera and data.

- A `MapLayout` page without `grid` is a single pane, called `main`.
- A `DualMapLayout` page without `grid` is two panes side by side, called `left` and `right`.
- Either page type can set `config.grid` to lay out its panes as a dashboard.

## Presets

| Page | Panes | Notes |
|---|---|---|
| `MapLayout` | `main` | One map, as before. |
| `DualMapLayout` | `left`, `right` | Two maps side by side, in one sync group, sharing colour classes and one legend. The legacy `sides` and Left/Right name rules still pick panes. |

Presets need no config changes: pages written for the single and side-by-side maps keep working.

## Configuring a grid

```js
config: {
  grid: {
    columns: [2, 1],  // a count, or relative widths
    rows: 2,          // a count, or relative heights
    cells: [
      { id: "overview", column: 1, row: 1, rowSpan: 2, title: "Overview", syncGroup: null },
      { id: "base", column: 2, row: 1, title: "Base year", visualisations: ["Zones base"] },
      { id: "future", column: 2, row: 2, title: "2040", classification: "own" },
    ],
  },
  // layers, visualisations, filters as usual
}
```

| Cell field | Default | Meaning |
|---|---|---|
| `id` | generated, with a warning | The pane's id, used by `filter.panes`. Must be unique. |
| `type` | `"map"` | Only `map` cells are drawn for now. Other types leave an empty cell (hidden on mobile). |
| `column`, `row` | `1` | Where the cell starts (1-based). |
| `columnSpan`, `rowSpan` | `1` | How many tracks the cell covers. |
| `title` | none | Names the pane: it labels the pane for screen readers, heads its sidebar filters and heads its legend. |
| `visualisations` | every map visualisation | The page visualisations (`joinDataToMap`, `geojson`) this pane draws. |
| `layers` | every layer | The page layers this pane shows. |
| `syncGroup` | `"default"` | Panes in the same group move together and share hover and popups. `null` makes a pane independent. |
| `classification` | `"shared"` | `"own"` gives the pane colour classes worked out from its own data only, and a legend of its own. |

On mobile the cells stack in config order, with a gap between maps so the page can still be scrolled with one finger.

### Problems in a grid

A grid with problems still renders. In development, each problem is logged to the console, prefixed with `[MapGrid]` and the page name:

- Bad sizes or placements fall back to `1`.
- Missing, repeated or non-string ids are replaced with a generated id that no other cell has.
- A cell reaching outside the grid is fitted inside it.
- A cell overlapping an earlier cell is left out.
- If the grid has no map cells, the page falls back to its preset layout.
- More than 4 map panes works, but it is warned about, because each pane needs a WebGL context.

## Which panes a filter changes

Each filter changes some of the page's panes. It finds them in this order:

1. **`panes`** on the filter: a list of pane ids, or `"all"`. Unknown ids are ignored, and a warning is logged in development.
2. **`sides`** (or `side`) on the filter, on side-by-side pages without a grid: `"left"`, `"right"` or `"both"`.
3. **Legacy name rules**, on side-by-side pages without a grid:
   - "Left" or "Right" in the filter's name targets that pane.
   - Any other filter on a visualisation with "Side" in its name targets both panes.

   In development, each filter that relies on these rules is named in a warning, so it can be given `panes`.
4. **Otherwise**, the panes that show any of the filter's visualisations, or failing that its `layer`, or failing that every pane.

```js
{ filterName: "Year", paramName: "year", type: "dropdown", visualisations: ["Zones"], panes: ["future"], actions: [...] }
```

On a page with a grid, `sides` and the name rules don't apply. Give such filters `panes` (a warning names any that rely on them).

An action can still name its own target: `sides` on an `UPDATE_DUAL_*` action in the page config wins over the filter's panes.

### What targeting affects

- **Sidebar.** When any pane has a title, filters for every pane are listed first. The rest are grouped under the titles of the panes they target. Pages without pane titles keep a flat list.
- **Map-click filters** (`type: "map"`). A click applies to the filter's panes in the clicked pane's sync group. Each pane takes the feature under the click on its own map.
- **Feature selection** (`mapFeatureSelect` and similar). On a page with a grid, the draw control sits on the first pane (in grid order) that the page's first feature-select filter targets, and a warning is logged if feature-select filters disagree. Preset pages keep it on their first pane.
- **Select and pan** (`mapFeatureSelectAndPan`). The map moves to the feature on the filter's panes: one pane per sync group moves, and the rest of its group follows. The feature's label shows on those panes and their groups.
- **Viewport filters** (`mapViewport`). The bounds are read from the filter's first pane, in grid order.

## Layers, legends and callout cards

- The sidebar's layer controls list each layer once, across all panes, and change it on every pane that shows it. A layer's controls describe the visualisation joined to it (`joinLayer`), as drawn by the first pane that shows the layer.
- A page whose panes all share colour classes shows one legend. A pane with `classification: "own"` gets a legend of its own, so a page with such a pane shows a stack of legends, each headed with its panes' titles.
- Callout cards are shown once per page, over the grid.

## Parameterised layers with a path per pane

A layer whose tile path has parameters can keep a separate path for each pane: set `separatePanePaths: true` (the older `separateSidePaths` still works). A filter that targets only some of the panes showing the layer then changes only those panes' tiles. Without the flag, the layer has one path, and every filter on its parameters changes it on every pane.

## Migrating a side-by-side page

Nothing has to change: side-by-side configs keep working. To make targeting explicit, or to move a page onto a grid:

| Before | After |
|---|---|
| "Left"/"Right" in a filter's name | `panes: ["left"]` / `panes: ["right"]` |
| A "Side" visualisation so a filter targets both maps | `panes: "all"` (or leave it out: a filter targets the panes showing its visualisations) |
| `sides: "left"` / `"right"` / `"both"` on a filter | `panes: ["left"]` / `["right"]` / `"all"` |
| `separateSidePaths: true` on a layer | `separatePanePaths: true` |
| `UPDATE_DUAL_PATH_PARAMS` / `UPDATE_DUAL_QUERY_PARAMS` | `UPDATE_PATH_PARAMS` / `UPDATE_QUERY_PARAMS` (the `UPDATE_DUAL_*` names remain as aliases) |

To lay a side-by-side page out differently, add `grid` with cells called `left` and `right`, and give every side-specific filter `panes`. On a page with a grid, `sides` and the name rules don't apply, and a warning names any filter that relies on them.

### Behaviour that changed on side-by-side pages

Side-by-side pages now share the single map's code, so they gain its features. A few behaviours changed:

- **Filters that aren't side-specific.** One sent through `UPDATE_PATH_PARAMS`/`UPDATE_QUERY_PARAMS` now changes both maps. Before, only the left map changed.
- **Popups and attribution.** Popup options match the single map, and attribution is compact on both maps.
- **Callout cards.** There is one stack of callout cards instead of two.
- **Map-click filters.** One with "Left"/"Right" in its name changes only that pane.
- **Phones.** On touch-only phones, one finger pans each map, and pinch zooms without rotating.

See §4 of `Map Panes Consolidation Plan.md` for the full list, including the changes on single-map pages.
