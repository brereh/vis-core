# Map Panes Consolidation Plan

Status: **in progress** · Base: upstream `Transport-for-the-North/vis-core@dev` (6e1aca5, after #366) plus the unmerged `fix/map-hover-styles` branch (85c670d), which the work is rebased onto

This plan replaces the separate single-map (`Map.jsx`) and dual-map (`DualMaps.jsx`) code with one
**map pane** that is rendered in the cells of a generic, dashboard-style grid. Single and dual map
pages become presets of that grid (1×1 and 1×2). Existing page configs keep working unchanged.

---

## 1. Decisions

The decisions below were agreed in Q&A. Everything else in this plan follows from them.

| Topic | Decision |
|---|---|
| Model | A page is a **grid of cells**. A `map` cell is a **pane**. Any number of panes. |
| Cell types | The grid is widget-agnostic (each cell has a `type`). Only `map` ships now. |
| Pane content | Each pane lists the visualisations and layers it shows (default: all of the page's). |
| Camera sync | **Sync groups**. By default every pane is in one group, which is today's dual behaviour. Hover and click popups appear on every pane in the group. |
| Classification | **Shared by default**: panes showing the same visualisation classify over their combined data. A pane can opt out (`classification: "own"`). |
| Config | Optional `config.grid` on `MapLayout`. No grid gives a 1×1 preset. `DualMapLayout` is an alias for a 1×2 preset with panes `left` and `right`. |
| Compatibility | The contract is **page config plus BaseApp**. Every existing config works untouched. Internal JS (hooks, state shape, internal actions) may change, so the release is a plain minor with no BREAKING footer. |
| Filter targeting | New explicit `filter.panes`. If it is missing, the legacy `sides` value or the Left/Right name rules apply, with a dev-only warning. |
| Parity | Dual pages inherit everything the single map does. |
| Filter UI | One sidebar. Filters that target only some panes are grouped under the pane title (only when panes have titles, so presets look as they do today). |
| Layer controls | One control per layer, applied to every pane showing it. |
| Mobile | Cells stack in order. Every map uses today's dual-map touch policy: **one-finger pan is kept**, with pinch to zoom. |
| Pane cap | Soft cap: a dev warning above 4 map panes, and each pane's tile cache shrinks as the count grows. |
| Overlays | One callout-card stack and one legend per page. The legend has a section per classification group. |
| Per-pane style controls | **Deferred.** Opted-out panes compute bins from their own data and get their own legend section, but share the layer's controls. |
| Delivery | Phased PRs into `dev`, each green and releasable (§6). |

---

## 2. Why: the current state

### 2.1 Duplication

| Concern | Single | Dual |
|---|---|---|
| Map creation | `hooks/useMap.jsx` (260) | `hooks/useDualMaps.jsx` (184), copied from `useMap` and diverged since |
| Component | `MapLayout/Map.jsx` (1520) | `MapLayout/DualMaps.jsx` (1115) |
| Hover tooltip | ~400 lines | ~400 lines, near-identical, looping over sides |
| Labels, layer-click popups, pan/fit, map-click filters | own copy | own copy |
| State | `visualisations`, `map` | `leftVisualisations`, `rightVisualisations`, `maps` |
| Reducer | `UPDATE_PATH_PARAMS`, `UPDATE_QUERY_PARAMS` | `UPDATE_DUAL_*` with a `sides` switch, written out twice |
| Tests | `Map.test.jsx` (1635) | `DualMaps.test.jsx` (1001), mostly the same mocks |

### 2.2 Drift: dual pages are behind, or broken

These come from reading the code. Phase 0 pins each one down with a failing test or a characterisation test before anything changes.

1. **Tooltip values.** Dual ignores `hideValueInTooltip` and formats values with `numberWithCommas` instead of `formatNumber`, so the same value reads differently on a dual page (for example, decimals aren't rounded). It also reads `feature.state.value` directly rather than through `getFeatureStateValue` (`feature?.state?.value`), so a feature with no `state` throws. Display modes aren't affected: both read the same feature-state value.
2. **Tile auth.** `useDualMaps`'s `transformRequest` never attaches the `Authorization` header, so API tiles that need a token fail on dual pages.
3. **Base style.** `useDualMaps` passes `defaultMapStyle` (the function itself) where `useMap` calls `defaultMapStyle()`.
4. **Map cleanup.** `useDualMaps`'s cleanup closes over the initial `null` state, so the maps are never `.remove()`d. `syncMaps`'s unsubscribe is never called either.
5. **Copies of visualisation state.** `ADD_VISUALISATION` copies visualisations into the left and right slices once. After that, `UPDATE_LEGEND_TEXT`, `UPDATE_DISPLAY_MODE`, `UPDATE_PATH_PARAMS` and `UPDATE_QUERY_PARAMS` only touch `state.visualisations`. On a dual page:
   - the maps never see those updates
   - callout cards and `DynamicLegend` (which read `state.visualisations`) never see per-side params or data
6. **Stale maps after a page reset.** `RESET_CONTEXT` doesn't clear `map` or `maps`. In BaseApp this doesn't show: each route has its own page component, so a page change remounts `MapProvider`. It does show wherever one provider is reused across pages (which `MapLayout`'s page-reset logic allows for): `MapLayerSection` and `useLayerZoomMessage` would keep reading removed maps. (Corrected in Phase 2.)
7. **Every layer is set up twice.** Each dual container renders every `<Layer>`, and each `Layer` adds itself to *all* maps in `state.maps`. Tile layers are protected by the `getSource` check. GeoJSON layers aren't: both instances pass the check before their async fetch returns, so each GeoJSON layer is fetched twice for each map (four requests on a dual page) and `addSource` is called twice on each map (MapLibre throws on the second). Unmounting either instance also tears the layer down on both maps, even though the other instance still shows it.
8. **Card stack rendered twice.** Each dual container renders a `VisualisationManager`, so the callout-card stack is rendered twice.
9. **Missing features on dual:** spider layers, touch tap tooltips, the hover fallback on hover-capable touch devices, viewport filters, the draw control (feature select), the temporary label on pan, `visualisedFeatureIds` filtering, `STORE_CURRENT_ZOOM`, and the mobile attribution bar.
10. **Inconsistent popup options:** `closeOnMove`, `closeOnClick`, and whether the layer-click handler is skipped on touch devices.
11. **Dual tooltips stay up after the pointer leaves the map.** The single map clears its tooltip and hover state when the pointer leaves the canvas. Dual only cancels the pending hover pass, so both tooltips stay where they were. Both components also had a `handleLayerLeave` that never did anything, because the hover id it reads was never set. `DualMaps` registered it on `mouseleave`; `Map.jsx` only defined it. (Found in Phase 1, which deleted the dead handlers. Phase 3's shared hover hook clears both panes on leave.)

### 2.3 Dual mode is guessed from strings

- `"Side"` in a filter's first visualisation name, combined with `"Left"`/`"Right"` in `filterName`. This is repeated in `MapContext.jsx`, `MapLayout.jsx` (twice), `MapFeatureSelect.jsx` and `MapFeatureSelectAndPan.jsx`.
- `"Side-by-Side"` or `"Side by Side"` in `pageName`, in `LayerControlEntry.jsx:325`.

### 2.4 Dual-only behaviour to keep

- Camera sync (`utils/syncMaps.js`).
- Hover and layer-click popups appear on both maps at the same location.
- Map-click filters pick the feature under the point *on each map separately*, highlight it through feature state and dispatch per side (#366).
- Classification over both sides' combined data, so colours are comparable.
- `separateSidePaths`: per-side tile paths for parameterised layers.
- Per-side visualisation params and data.

---

## 3. Target architecture

### 3.1 Concepts

| Term | Meaning |
|---|---|
| **Grid** | The page's layout: `columns`, `rows` and a list of cells. Widget-agnostic. |
| **Cell** | `{ id, type, column, row, columnSpan, rowSpan, title? }`. Only `type: "map"` is registered now. |
| **Pane** | A `map` cell. It owns one MapLibre instance. |
| **Primary pane** | The first pane in config order. It backs `state.map` and page-wide readings such as `currentZoom`. |
| **Sync group** | Panes whose cameras move together and share hover and click popups. The default group is `"default"`. `null` means the pane is independent. |
| **Classification group** | For a visualisation: the panes showing it that have `classification: "shared"`. Each pane with `"own"` forms a group of its own. |

### 3.2 Config

Existing configs are unchanged:

```js
{ type: "MapLayout", config: { /* as today */ } }          // → 1×1 preset, pane "main"
{ type: "DualMapLayout", config: { /* as today */ } }      // → 1×2 preset, panes "left" | "right"
```

A new grid page is a `MapLayout` with a `grid`:

```js
{
  type: "MapLayout",
  config: {
    // layers, visualisations, filters: as today
    grid: {
      columns: 3,               // equal fractions; or an array of relative widths, e.g. [2, 1, 1]
      rows: 2,                  // or relative heights, e.g. [1, 1]
      cells: [
        {
          id: "overview",
          type: "map",
          column: 1, row: 1, columnSpan: 1, rowSpan: 2,
          title: "Overview",
          visualisations: ["Flows"],   // default: every map visualisation on the page
          layers: ["Zones", "Network"],// default: every layer on the page
          syncGroup: null,             // independent camera
        },
        { id: "base", type: "map", column: 2, row: 1, columnSpan: 2, title: "Base year" },
        { id: "future", type: "map", column: 2, row: 2, columnSpan: 2, title: "2040",
          classification: "own" },     // own bins and its own legend section
      ],
    },
    filters: [
      { filterName: "Year", paramName: "year", panes: ["future"], /* ... */ },
      { filterName: "Metric", paramName: "metric" /* no panes → every pane showing its visualisations */ },
    ],
  },
}
```

- Relative widths follow the admin page's `layout` convention (`docs/AdminPage.md`): bare numbers are ratios. Unlike the admin layout, cells can span rows and columns, which dashboards need.
- **Validation** runs in `resolveMapGrid` and logs a dev-only error naming the cell. It checks for:
  - unknown cell types
  - overlapping or out-of-range placements
  - duplicate ids
  - visualisation or layer names the page doesn't define
  - `filter.panes` entries that aren't pane ids

### 3.3 Grid resolution: `map/resolveMapGrid.js` (pure)

`resolveMapGrid(pageConfig) → { columns, rows, cells, panes, primaryPaneId, syncGroups, warnings }`

- `type: "DualMapLayout"`, or `MapLayout` without `grid`, returns the presets. The preset panes have no `title`, so the sidebar stays flat as it is today.
- Fills in defaults: visualisations and layers default to all of the page's, `syncGroup` defaults to `"default"`, and `classification` defaults to `"shared"`.
- Pane cap: more than 4 map panes logs a dev-only warning. Per-pane `maxTileCacheSize` is `min(500, round(1000 / paneCount))`, so 1 and 2 panes keep today's 500 and 4 panes get 250 each.
- The result is stored once per page with `SET_MAP_GRID` (plain data, serialisable), so the reducer can ask which panes show which visualisation.

### 3.4 Filter targeting: `map/resolveFilterPanes.js` (pure)

Resolved once in `MapContext` (replacing `filtersWithSides`) and stored as a resolved array on `filter.panes`. Every consumer reads `filter.panes`, and the five copies of the inline name rules are deleted.

Resolution order:
1. `filter.panes` as written: an array of pane ids, or `"all"`.
2. Legacy `filter.sides` or `filter.side`: `"left"`, `"right"` or `"both"`.
3. Legacy name rules, applied only when the grid is the 1×2 preset: `visualisations[0]` contains `"Side"` and `filterName` contains `"Left"` or `"Right"`. Each filter resolved this way logs a single dev-only warning suggesting `panes`.
4. The default: every pane showing any of `filter.visualisations`. A filter with no visualisations (for example a layer-path filter) targets every pane showing `filter.layer`, or failing that, every pane.

`resolveFilterPanes` also returns `paneScope: "all" | "subset"`, so the sidebar and reducer don't need to recompute it.

### 3.5 State and reducer

#### Shape

```text
state.mapGrid                 // resolved grid (3.3)
state.mapsByPane              // { [paneId]: maplibregl.Map }          replaces state.maps
state.map                     // primary pane's map                     kept (many readers)
state.visualisations          // page scope: config + shared runtime    unchanged shape
state.paneOverrides           // { [paneId]: { [vis]: { queryParams?, pathParams? } } }
state.paneData                // { [paneId]: { [vis]: data } }
```

Removed: `leftVisualisations`, `rightVisualisations`, `maps`, `SET_DUAL_MAPS`, and the dead `color_scheme`/`class_method` writes in `SET_MAP`/`SET_DUAL_MAPS`.

#### The one rule for filter-driven params

Pane overrides hold only what genuinely differs between panes (params and data). Everything else (style, `legendText`, `displayMode`, type, `joinLayer`) has a single copy in `state.visualisations`. That removes the whole class of drift bug in §2.2(5).

A pure helper, `applyVisualisationParam(state, { visualisationNames, panes, kind, paramName, value })`, handles each visualisation as follows:

| Case | Where the param is written |
|---|---|
| The visualisation is shown in no pane (e.g. a callout card) | `state.visualisations` (page scope) |
| The targeted panes include **every** pane showing it | `state.visualisations`, and the param is removed from every pane override of that visualisation (last writer wins) |
| The targeted panes are a **subset** | `paneOverrides[pane][vis]` for each targeted pane |

For a 1×1 page every filter targets all panes, so the single-map path is unchanged and `Map.test`/`mapReducer.test` expectations still hold.

#### Actions

| Action | Change |
|---|---|
| `UPDATE_PATH_PARAMS`, `UPDATE_QUERY_PARAMS` | Accept `payload.panes`. Implemented with `applyVisualisationParam`. |
| `UPDATE_DUAL_PATH_PARAMS`, `UPDATE_DUAL_QUERY_PARAMS` | **Kept as aliases** (page configs name them). They take the filter's resolved `panes`. A legacy `sides` on the action in the page config still wins: `"left"`, `"right"`, and `"both"` or unset meaning every pane. (Before, unset meant the left pane only. `MapLayout` sent no `sides` at runtime for filters on visualisations without "Side" in their name, so such filters only ever changed the left pane; see the Phase 2 result.) |
| `UPDATE_ALL_DATA` | `{ visualisationName, data, paneId }` writes to `paneData`. `state.visualisations[vis].data` is kept as the concatenation over the panes showing `vis`. That equals today's value on single pages and today's `combinedData` on dual pages, and it is a legacy read for `DynamicLegend` and callout cards until Phase 5 moves them onto selectors. |
| `UPDATE_PARAMETERISED_LAYER` | `separateSidePaths` becomes `separatePanePaths` (old name accepted), and `sidePaths`/`sideMissingParams` become `panePaths`/`paneMissingParams`. The write rule is the same as for params. `missingParams` is the union across the panes showing the layer, so the layer is added once none of them is missing anything. The flag stays opt-in so existing configs behave as they do today. |
| `SET_PANE_MAP` / `REMOVE_PANE_MAP` | `{ paneId, map }`. Also keeps `state.map` pointing at the primary pane's map. |
| `RESET_CONTEXT` | Also clears `map`, `mapsByPane`, `paneOverrides` and `paneData`. This fixes §2.2(6). `mapGrid` is left in place, because the page effect sets it again straight away. |
| `mapBoundsAndCentroid` (set by select-and-pan) | Gains `panes` from the filter that set it. |

#### Selectors: `reducers/mapSelectors.js` plus hooks

- `usePaneVisualisation(paneId, vis)` merges `state.visualisations[vis]` with `paneOverrides[paneId][vis]`. It is memoised on those two references, so the merged object only changes identity when either input does. `useFetchVisualisationData`'s effect dependencies depend on this.
- `selectPanesShowing(state, { visualisation } | { layer })`
- `selectClassificationPanes(state, vis, paneId)` and `selectClassificationData(state, vis, paneId)`
- `selectVisualisationForLayer(state, layerId)`: the visualisation whose `joinLayer` matches, otherwise the first. This replaces the `pageName` rule in `LayerControlEntry`.
- `selectMapsShowingLayer(state, layerId)`

### 3.6 Components and hooks

```text
MapLayout                         sidebar, dimmer, filter effects (unchanged responsibilities)
└─ MapGrid                        CSS grid from state.mapGrid; cell registry { map: MapPane }
   ├─ MapGroupProvider            sync groups: syncMaps per group (+ cleanup); hover/popup bus
   │  └─ MapPane × N              one map: useMap, interactions, <Layer>/<SpiderLayer>/<MapVisualisation>
   ├─ useBaseMapTransition(all pane maps)
   ├─ CalloutCardStack            once per page
   └─ PageLegend                  one section per classification group
```

| Unit | Source | Notes |
|---|---|---|
| `hooks/useMap.jsx` | today's `useMap` | Same positional signature, plus an options object `{ tileCacheSize, compactAttribution }`. Gains a `ResizeObserver` on its container (taken from dual), which handles grid resizes and the sidebar toggling. Gains `applyTouchPolicy(map)`. `useDualMaps` is deleted. |
| `Components/MapLayout/MapGrid.jsx` | new | A widget-agnostic grid. Unknown cell types render nothing and log a dev-only error. Collapses to one column at `theme.mq.mobile`. |
| `Components/MapLayout/MapGroupContext.jsx` | new | `register(paneId, map, syncGroup)`; `publish(group, sourcePaneId, event)`; `subscribe(group, paneId, handler)`. Calls `syncMaps(groupMaps)` and keeps the returned unsubscribe. |
| `Components/MapLayout/MapPane.jsx` | `Map.jsx` minus the logic extracted in Phase 1 | Renders the `Layer`, `SpiderLayer` and `MapVisualisation` entries for the pane's own layers and visualisations, passing `map` and `paneId` explicitly. |
| `map/interactions/*` | extracted from both files | See §3.7. Every unit is a pure function plus a thin hook that wires it to a map. |
| `Layer.jsx`, `SpiderLayer.jsx` | changed | Take `map` and `paneId` props instead of reading `state.map`/`state.maps`, which fixes §2.2(7). Path comes from `panePaths[paneId] ?? path`. |
| `MapVisualisation.jsx` | changed | Props `{ visualisationName, map, paneId }`. Uses `usePaneVisualisation`, and bins over `selectClassificationData`. The `left === null` branches are deleted. |
| `VisualisationManager.jsx` | split | `CalloutCardStack` (page level) and the per-pane map-visualisation list (inside `MapPane`). Fixes §2.2(8). |
| `DualMaps.jsx`, `useDualMaps.jsx`, `Map.jsx` | **deleted** | `Map.jsx` content lives on in `MapPane` and `map/interactions`. |

### 3.7 Interactions

Each item below is extracted in Phase 1 as a pure module plus a hook, written once for a single map and composed per pane.

| Module | Behaviour with N panes |
|---|---|
| `tooltipContent.js` | Pure: features, layers and visualisations in, HTML and custom-tooltip requests out. Includes `generateMetadataHtml`, metadata injection, joining custom tooltips to the default, and `showAllDataInTooltipForEachGeom`. Uses `getFeatureStateValue`, `formatNumber` and `hideValueInTooltip` everywhere, and guards a missing `customTooltip` before fetching (fixes §2.2(1)). |
| `useHoverTooltip` | The pane's own `mousemove` is coalesced per animation frame and sends `hover(lngLat)` to its sync group. Every pane in the group, including the source pane, queries at `map.project(lngLat)` with its own buffer, hover feature state, popup, abort controller and hover-event id. `mouseleave` sends `clear`. Panes outside the group are unaffected. A 1×1 page behaves exactly as today. Spider layers are queried per pane. |
| `useTouchTooltip` | The tap and hover-capable-touch paths from `Map.jsx`. The forced feature applies only on the tapped pane; the other panes in the group query at the tap's lngLat. |
| `useLayerClickPopups` | Shown on every pane in the group, as dual does today. Popup options follow the single map (`closeOnClick: false`). Skipped on touch devices, as the single map does. |
| `useMapFilterClick` | Generalises #366. A click on pane P works out, for each `type: "map"` filter, `targets = filter.panes ∩ syncGroup(P)`; for an independent pane that is just P. Each target pane queries at `T.project(lngLat)`. If **no** target has a feature, nothing is dispatched and highlights stay. If some do: panes with a feature are highlighted through feature state (the GeoJSON fallback for features without ids is kept) and dispatch `{ panes: [T] }`; panes without one are cleared and dispatch `null`. The sidebar value is the clicked pane's, otherwise the first that isn't null. |
| `useViewportFilters` | A `mapViewport` filter reads the bbox from its first target pane. Inside a sync group every pane's bbox is the same. |
| `useFeatureFocus` | `mapBoundsAndCentroid` fits the first target pane; its sync group follows through `syncMaps`, and target panes in other groups are fitted as well. The temporary label is added to each target pane and its group. |
| `useLabelLayers`, `useVisualisedFeatureFilter` | Per pane, for that pane's layers. |
| `useDrawControl` | One `MapboxDraw` instance, on the pane targeted by the page's feature-select filter (`filter.panes[0]`), otherwise the primary pane. `state.drawPaneId` is added so `useFeatureSelect` queries the right map. If feature-select filters target different panes, a dev warning is logged (see §8). |
| `useZoomTracking` | `STORE_CURRENT_ZOOM` comes from the primary pane only, which is today's meaning. Per-group zoom is a follow-up (§8). |
| `selectionHighlight.js` | `highlightSelectedFeature` from `DualMaps.jsx`, now shared. |

The `MapLayout` effect B2 skips `type: "map"` filters **only when they target more than one pane**, because those panes dispatch per pane themselves. A single map keeps today's re-dispatch exactly.

### 3.8 Visualisations, data and classification

- Each `MapVisualisation` instance fetches with `usePaneVisualisation(paneId, vis)`, so a pane with no overrides makes the same request as the page.
- *Possible later optimisation, not in scope:* panes with identical effective params could share one fetch through a request-keyed cache in `useFetchVisualisationData`.
- Bins are computed over `selectClassificationData(state, vis, paneId)`: the combined data of the pane's classification group, or the pane's own data if it has `classification: "own"`. A 1×1 page gives today's data and a 1×2 page gives today's `combinedData`.
- Per-layer runtime style (`class_method`, `customBands`, colour scheme, `invertedColorScheme`, `widthFactor`) stays keyed by layer and is shared by every pane, including opted-out panes (per-pane style is deferred, see §8).
- Loading: each instance already registers with `useVisualisationLoadingCounter`, so the dimmer stays on until every pane has loaded.
- `SET_NO_DATA_RETURNED` is aggregated across all instances. It is true only when every instance reports empty or an error, so N panes can't race each other.

### 3.9 Overlays

- **`CalloutCardStack`** is rendered once and anchored to the grid container (`position: relative`). Behaviour is unchanged on single pages, and dual pages lose the duplicate stack.
- **`PageLegend`** renders one `DynamicLegend` per classification group. Each one is given the map of the group's last pane with data (see the Phase 4 result). Phase 5 has it read the group's data through selectors rather than `state.visualisations[].data`.
  - Groups whose panes have titles show them as a heading. The presets have no titles, so they look as they do today.
  - This replaces dual's "use whichever side has data" rule for choosing a legend.
  - The mobile legend slot portal is unchanged.
- **`MapStyleToggle`** is rendered once at grid level (still off by default) and drives every pane through `useBaseMapTransition`.

### 3.10 Sidebar

- **Filter grouping** applies only if at least one pane has a `title`:
  - filters with `paneScope: "all"` are listed first, with no heading
  - the rest are grouped by their pane set, under the titles joined with " + "
  - config order is kept within a group
  - presets have no titles, so the list stays flat
- **`MapLayerSection`** lists the union of layers across the panes' styles, rather than `maps[0]` only. `LayerControlEntry` applies paint and visibility changes to `selectMapsShowingLayer`, and finds its visualisation with `selectVisualisationForLayer` (deleting the `pageName` rule).
- **`useLayerZoomMessage`** uses the primary pane's map.

### 3.11 Mobile, touch, attribution and limits

- **Mobile layout:** the grid becomes one column, with cells in config order. Each map cell gets today's single-map mobile height (`56vh`, minimum 320px) and the `map-stack` wrapper with the attribution bar below it.
- **Touch:** `applyTouchPolicy(map)` applies today's dual-map policy to every pane:
  - **Detection:** only a touch-only device counts (narrow viewport, coarse pointer and no fine pointer). Today's single-map check (viewport ≤ 900px alone) also catches narrow desktop windows and turns off their drag pan and scroll zoom.
  - **On:** one-finger pan (`dragPan`), and pinch to zoom without rotation.
  - **Off:** scroll zoom, double-click zoom, box zoom and keyboard.

  This lives in one function, so `useMap` no longer turns `dragPan` off only for the dual component to turn it back on.
- **Page scroll with one-finger pan:** a finger on a map pans the map, so the page has to be scrollable from somewhere else. On mobile, each map cell stays at most `56vh` tall, and stacked cells are separated by a gap of at least 24px. Part of the page outside the maps is always on screen to scroll from, and the sidebar sits above the grid as it does today.
- **Attribution:**
  - **1 pane:** today's full pill, with the navigation-offset logic.
  - **More than 1 pane:** a compact `AttributionControl` with the OS line on every pane. Panes can show different sources, so each one carries its own attribution. Dual today shows it on the right map only.
- **WebGL:** a `webglcontextlost` listener logs and shows a "map unavailable, reload" message in that pane. This is a safety net for the soft cap.

---

## 4. Intended behaviour changes

Everything not listed here should behave exactly as before. Each change is called out in the PR that introduces it.

**Dual pages:**
- the fixes in §2.2(1)–(10)
- every single-map feature listed in §2.2(9)
- popup options as on the single map
- compact attribution on both maps
- one card stack instead of two
- a filter that isn't side-specific and uses `UPDATE_PATH_PARAMS`/`UPDATE_QUERY_PARAMS` now affects both maps (it was silently dropped before, see §2.2(5))
- which pane a filter targets is worked out once and used everywhere, so the same filter targets the same pane at load and afterwards (the Phase 2 result lists exactly what changes)
- legend data comes from the classification group rather than the side with data (deferred to Phase 4 with `PageLegend`; until then dual pages keep the side-with-data rule)

**Single pages:**
- clicking an empty area keeps the current map-filter highlight, so the highlight matches the filter value that is still applied (today it clears the highlight but keeps the value)
- the `ResizeObserver` replaces relying on window resize
- on touch-only phones, one-finger pan starts working (today single maps need two fingers)
- narrow desktop windows (≤ 900px) keep drag pan and scroll zoom (today they lose both)

**Both:**
- `state.map` and the other map state are cleared when the page changes

**Pre-merge check (before this work goes into `dev`):** run BaseApp's dual-map pages against each change, together with the downstream app configs the maintainers have to hand. In particular, find dual-page configs that:
- send a filter through `UPDATE_*_PARAMS`, side-specific or not
- send a filter whose visualisation name lacks "Side" through `UPDATE_DUAL_*`
- name a filter with "Left"/"Right" on a visualisation without "Side" in its name
- set `sides` on a filter or on one of its actions
- target a callout card with `UPDATE_DUAL_*`
- belong to pages whose name doesn't contain "Side-by-Side" and use banding or metric-dependent layer controls
- set up map-click filters with "Left"/"Right" in their names, which now change only that pane (Phase 3)

Also find single-map configs that use `UPDATE_DUAL_*` or `separateSidePaths`.

---

## 5. File disposition

| File | Fate |
|---|---|
| `Components/MapLayout/DualMaps.jsx` (+ test) | Deleted. Its tests are re-expressed as `MapPane`/`MapGrid` tests on the 1×2 preset. |
| `Components/MapLayout/Map.jsx` (+ test) | Becomes `MapPane.jsx` (+ test), after extraction. |
| `hooks/useDualMaps.jsx` | Deleted. Its export is removed from `hooks/index.js`. |
| `hooks/useMap.jsx` | Generalised (options, `ResizeObserver`, touch policy). |
| `utils/syncMaps.js` | Kept, used by `MapGroupProvider`, with an added test that the unsubscribe works. |
| `reducers/mapReducer.js` | Pane-keyed slices, `applyVisualisationParam`, aliases. Each `UPDATE_DUAL_*` case drops from about 40 lines to 1. |
| `reducers/mapSelectors.js` | New. |
| `map/resolveMapGrid.js`, `map/resolveFilterPanes.js` | New, pure, with exhaustive unit tests. |
| `map/interactions/*` | New. Extracted from `Map.jsx` and `DualMaps.jsx`. |
| `Components/MapLayout/MapGrid.jsx`, `MapGroupContext.jsx`, `CalloutCardStack.jsx`, `PageLegend.jsx` | New. |
| `MapLayout.jsx` | Renders `MapGrid`. The side rules move to `filter.panes`. |
| `MapContext.jsx` | Resolves the grid and filter panes, replacing `filtersWithSides`. |
| `Layer.jsx`, `SpiderLayer.jsx`, `MapVisualisation.jsx`, `VisualisationManager.jsx`, `DynamicLegend.jsx` | Take a `map` and `paneId` explicitly, or are split (above). |
| `MapLayerSection.jsx`, `LayerControlEntry.jsx`, `useLayerZoomMessage.jsx`, `MapFeatureSelect*.jsx`, `useFeatureSelect.js` | Read panes and selectors. The name rules are deleted. |
| `PageSwitch.jsx` | Unchanged (`DualMapLayout` already routes to `MapLayout`). |
| `docs/Map Grid.md` | New user-facing config docs (Phase 6). |

Expected net size: `Map.jsx` and `DualMaps.jsx` together drop from about 2,600 lines to roughly 1,200 across `MapPane` and the interaction modules. The reducer loses about 120 lines of `sides` switching.

---

## 6. Phases (one PR each, all into `dev`)

Every phase keeps the full suite green and is releasable as a beta on its own. Phases 1–3 cause no visible change except the bug fixes they name.

### Phase 0: Safety net
- Install and run the baseline suite, and record the result in the PR.
- Add characterisation tests for the dual behaviours in §2.4 that aren't already pinned, such as per-side params in the reducer, combined classification, popups on both maps and `separateSidePaths`.
- Add `test.failing` tests for the bugs in §2.2(1)–(8). Later phases flip them to passing.
- Build a shared MapLibre fake, `src/testing/mapLibreFake.js`, to replace the duplicated mocks in `Map.test` and `DualMaps.test`.

*Exit:* green, with the bug inventory checked into the tests.

**Phase 0 result.** The baseline before Phase 0 was 96 suites and 700 tests, all passing. After it: 103 suites and 761 tests, all passing, including 16 known-drift tests marked `test.failing`. The preconditions those tests rely on are pinned by ordinary tests alongside them. Each known-drift test was also run as an ordinary test to confirm it fails on its assertion rather than its setup.

- **Shared fake:** `src/testing/mapLibreFake.js` is an in-memory map with real event dispatch, layers, sources, feature state and camera, plus `FakePopup` and a module mock. As in MapLibre, camera changes fire `move` events and duplicate layers are reported as errors. `resetMapLibreFake()` clears its static records, and its spies are created per call, because the jest config sets `resetMocks`. The header lists the remaining fidelity gaps.
- **Browser environment:** `src/testing/browserEnv.js` (`useMapBrowserEnv`) installs `matchMedia`, `ResizeObserver` and, optionally, immediate animation frames for a test file, and restores them afterwards.
- **Not yet migrated:** `Map.test` and `DualMaps.test` use only the fake's module mock and popup. Their hand-built per-test map stubs stay until Phase 3 re-expresses them against `MapPane`. `setupTests.js` also keeps its own `maplibre-gl` mock for the other suites.
- **Probes:** each new test file reaches state and panes only through a few probe helpers at the top of the file. Later phases change the probes, not the assertions.

| Bug (§2.2) | Known-drift test | Flips in |
|---|---|---|
| (1) tooltip formatting, `hideValueInTooltip`, missing `state` | `MapLayout/DualMaps.panes.test.jsx` | Phase 1 |
| (2) no auth header, (3) style function, (4) maps never removed or unsynced | `hooks/mapInstance.test.jsx` | Phase 1 |
| (5) changes after load don't reach the panes | `reducers/mapReducer.panes.test.js` | Phase 2 |
| (6) `RESET_CONTEXT` keeps the maps | `reducers/mapReducer.panes.test.js` | Phase 2 |
| (7) GeoJSON layers fetched and added twice per map; one pane's teardown removes the layer from both | `MapLayout/Layer.panes.test.jsx` | Phase 3 |
| (8) card stack rendered twice | `MapLayout/DualMaps.panes.test.jsx` | Phase 3 |

Behaviour pinned so later phases keep it:
- `syncMaps`: any number of maps, both directions, no echo, unsubscribe (`utils/syncMaps.test.js`)
- per-side query and path params, and per-side data (`reducers/mapReducer.panes.test.js`)
- per-side tile paths for layers with `separateSidePaths` (`MapLayout/Layer.panes.test.jsx`)
- classification over the combined data, with each pane painted from its own data (`MapLayout/MapVisualisation.panes.test.jsx`)
- hover tooltips, hover state and layer-click popups on both panes (`MapLayout/DualMaps.panes.test.jsx`)
- `useMap`'s auth header, default style and teardown (`hooks/mapInstance.test.jsx`)

### Phase 1: Extract shared modules (no behaviour change except fixes)
- Extract into `map/interactions/*`: `tooltipContent`, `selectionHighlight`, label layers, the focus and fit-bounds maths, the hover buffer calculation and the popup controller.
- `Map.jsx` and `DualMaps.jsx` both call them. Dual picks up `hideValueInTooltip`, `formatNumber` and the null-safe value read (fix 1).
- Fix `useDualMaps` items 2–4 now, as small commits, because they are independent of the restructure.

*Exit:* both components are thinner, each module has its own unit tests, and fixes 1–4 are flipped.

**Phase 1 result.** Full suite: 111 suites and 847 tests, all passing. Fixes 1–4 are flipped, which leaves 9 known-drift tests for Phases 2 and 3.

- **Shared modules:**
  - `src/map/mapSetup.js`: construction options, `transformRequest`, style resolution, attribution text, base-source registration
  - `src/map/interactions/tooltipContent.js`: hoverable layers, hit box, tooltip HTML, custom-tooltip fetch and merge, layer-click HTML
  - `src/map/interactions/hoverTooltip.js`: per-map hover session, hover state, popup, delayed fetch with stale-response guard
  - `labelLayers.js`, `featureFocus.js`, `selectionHighlight.js`

  Each has its own unit tests against the fake.
- **Size:** `Map.jsx` is down from 1,520 to about 780 lines, and `DualMaps.jsx` from 1,115 to about 450.
- **Unchanged on purpose:** the single map's map-click selection (per-layer `selected` state) is left alone until Phase 3 unifies map-click filters. Popup options and touch handling stay per component until Phase 3.
- **Small differences that come with sharing the code:**
  - On dual maps, features without an id are no longer considered for hover tooltips; they can't carry hover state anyway. (The single map already filtered them out of its hover query. A tapped feature without an id still gets its tooltip, just no hover state.)
  - A hit box with a non-finite point is skipped rather than queried.
  - OS tile URLs are normalised with `URL.href`, which gives the same string as `new Request(url).url`.
  - Clearing a tooltip (no feature, no hoverable layers, an empty tap) now also cancels a pending or in-flight custom-tooltip fetch. Before, it only removed the popup.
  - Layer-click popups show "Value: 0" for a feature with no `state`. Before, both components threw.
  - On dual maps, a custom tooltip whose response is empty renders its template against `{}`, as the single map does. Before, it threw and showed the fallback.
  - On dual maps, each label layer updates on its own map's `zoomend`, not on either map's. The maps are synced, so this is equivalent in practice.
- **Rebased onto `fix/map-hover-styles`.** That branch's hover changes sit in the shared modules rather than in the two components. One small difference: on dual maps the hover search's candidate check also needs a feature id and a configured layer, as the single map's does. Phase 1 drops id-less features on dual maps, so the search would otherwise stop on a feature that then shows nothing. The changes:
  - nearest-first hover picking with the hovered feature kept (`queryHoverFeatures` in hoverTooltip.js, used by both components, with `isHoverCandidate`)
  - `syncHoverLayers` before hover and selected state (hoverTooltip.js, selectionHighlight.js, and the single map's click selection)
  - the tooltip offset
  - the selected-highlight colours for the GeoJSON fallback
- **Also fixed:** dual custom tooltips used one hover counter for both panes, bumped once per pane in the same pass. When both panes moved to new features at once, the left pane's custom data was treated as stale and never filled in. Each pane now has its own hover session.
- **Test changes:** one existing `DualMaps.test` case stubbed `project()` to return `true`. It now returns a screen point, with its assertion unchanged. The dual hover characterisation now expects the single map's number formatting.

### Phase 2: Pane-keyed state
- Add `resolveMapGrid`, `resolveFilterPanes`, `SET_MAP_GRID`, `paneOverrides`, `paneData`, `mapsByPane`, the selectors and `applyVisualisationParam`.
- Move the `UPDATE_DUAL_*` actions onto aliases.
- Fix `RESET_CONTEXT`.
- Point `DualMaps.jsx` at the new selectors, using pane ids `left` and `right`. Delete `leftVisualisations`, `rightVisualisations` and `SET_DUAL_MAPS`.
- The five copies of the name rules become reads of `filter.panes`.

*Exit:* reducer tests are rewritten around panes, and fixes 5–6 are flipped.

**Phase 2 result.** Full suite: 118 suites and 995 tests, all passing. Fixes 5 and 6 are flipped, which leaves 4 known-drift tests for Phase 3.

- **New modules:**
  - `src/map/resolveMapGrid.js` (presets only; custom grids come in Phase 4)
  - `src/map/resolveFilterPanes.js`
  - `src/reducers/paneState.js`: the shared-copy-or-override rule, pane data, per-pane layer paths, pane map registration
  - `src/reducers/mapSelectors.js` and `src/hooks/usePaneVisualisation.js`
- **State:**
  - added: `mapGrid`, `mapsByPane`, `paneOverrides`, `paneData`
  - removed: `leftVisualisations`, `rightVisualisations`, `maps`, `SET_DUAL_MAPS`, and the dead colour-scheme code in `SET_MAP`
  - `SET_MAP` is kept as an alias that registers the primary pane's map
  - `UPDATE_DUAL_*` are aliases of `UPDATE_*_PARAMS`
  - layers use `panePaths`/`paneMissingParams`, with `separatePanePaths` accepted alongside `separateSidePaths`
- **Consumers.** `MapContext` stores each filter's resolved `panes` and `paneScope`. `MapLayout`, the feature selectors, `DualMaps`, `Map`, `MapVisualisation`, `Layer`, `MapLayerSection`, `useLayerZoomMessage` and `LayerControlEntry` read panes and selectors.
- **Name rules.** All five copies of the `Left`/`Right`/`Side` rules and the `pageName` rule are gone. The name rules survive only as the legacy fallback in `resolveFilterPanes`. On the dual preset, "Left"/"Right" in a filter's name targets that pane whatever the visualisation is called, as the old load-time dispatch and feature selectors did. Other filters on "Side" visualisations target both panes. (Only `LayerControlEntry`'s `pageName` rule moved here rather than in Phase 5, because removing the left/right copies forced it. It reads the primary pane's own view, which is what the left copy gave it, not the per-layer selector Phase 5 adds.)
- **Map registration.** Maps register per pane, register again if a reset clears them while they stay mounted, and unregister on unmount.
- **Behaviour changes on dual pages, beyond fixes 5–6.** Before, the initial dispatch applied the Left/Right name rule to every filter, but the runtime dispatch only applied it to filters on "Side" visualisations; for other filters it sent no `sides`. Each filter now has one resolved target, used in both places. In detail:
  - A filter that isn't side-specific, using `UPDATE_*_PARAMS`, reaches both maps; before, its value never reached the maps (§4).
  - A filter named "Left …"/"Right …" targets that pane at load and afterwards, whatever its visualisation is called. Before, on a visualisation without "Side", it targeted its side at load, then the left pane (`UPDATE_DUAL_*`) or neither map (`UPDATE_*_PARAMS`) afterwards.
  - A side-specific filter using `UPDATE_*_PARAMS` changes its own pane; before, its value never reached the maps.
  - `UPDATE_DUAL_*` from a filter that is neither side-specific nor on a "Side" visualisation targets both panes afterwards; before, the left pane only.
  - A `sides` set on a filter in the page config steers its map actions, and wins over the name rules. Before, it only chose the feature-lookup side, and the name rules overwrote it on "Side" visualisations.
  - A `sides` or `panes` set on an action in the page config wins over the filter's target, at load and afterwards. Before, it won only at load: afterwards, the name-derived side replaced it for filters on "Side" visualisations. For example, a filter named "Left …" whose action sets `sides: "both"` used to change only the left pane after load, and now changes both.
  - A callout card targeted by `UPDATE_DUAL_*` now gets the value, on its page copy; between a Left and a Right filter, the last change wins. Before, callout cards never saw these values.
  - Feature selects, including download-section filters that never pass through `MapContext`, pick their lookup pane with the same rules. In practice the outcome is unchanged: "Right" in the name, or `sides: "right"`, means right; otherwise left.
  - A pane classifies over its own freshly fetched data plus the other panes' last stored data. Before, both sides came from state, one render behind.
  - The layer controls describe the primary (left) pane, with its own params and data, and an up-to-date display mode. With no data stored yet, the left pane has none, rather than the right pane's. Before, only pages named "Side-by-Side" read the left copy; other dual pages read the page copy, which had no data and no per-side params.
  - Map-click filters on visualisations without "Side" are no longer re-dispatched by `MapLayout`. Before, it re-sent their single value to the left pane, overwriting that pane's own clicked feature. `DualMaps` dispatches every map-click filter per side, so `MapLayout` now leaves all map-click filters to it on multi-pane pages. Phase 3 narrows this to filters that target several panes.
- **Behaviour changes on single-map pages, from dual-only options only:**
  - `UPDATE_DUAL_*` now applies, to the only pane; before, it wrote copies nothing read.
  - A map-click filter on a "Side" visualisation is now also re-sent by `MapLayout`. This repeats the map's own dispatch with the same value.
  - A `separateSidePaths` layer changed by a "Left"/"Right" filter now updates its tiles; before, the single map used the unchanged `layer.path`.

### Phase 3: `MapPane` replaces both components
- Add `MapPane`, `MapGroupProvider`, and a `MapGrid` that supports only the presets for now.
- `Layer`, `SpiderLayer` and `MapVisualisation` take `map` and `paneId`. Split `VisualisationManager`. Add `PageLegend` (one group on the presets).
- Delete `DualMaps.jsx`, `useDualMaps.jsx` and `Map.jsx`.

*Exit:* `Map.test` and `DualMaps.test` are re-expressed against `MapPane`, parameterised over the 1×1 and 1×2 presets. Fixes 7–10 are flipped. BaseApp's dual pages are checked by hand on desktop and mobile (the §4 pre-merge check).

**Phase 3 result.** Full suite: 120 suites and 1032 tests, all passing, and no known-drift tests remain.

**What replaced what:**

| Before | Now |
|---|---|
| `Map.jsx`, `DualMaps.jsx` | `MapPane.jsx` (one map per pane) inside `MapGrid.jsx` (the page's grid) |
| `useDualMaps.jsx` | Removed: every pane uses `useMap`. Camera sync is the map group's job. |
| `VisualisationManager.jsx` | `CalloutCardStack.jsx` (cards only). Each pane draws its own map visualisations. |
| per-component map-click handlers | `map/interactions/mapFilterClick.js` |

- **New modules:**
  - `src/map/mapGroup.js` and `MapGroupContext.jsx`: camera sync per sync group, pointer events shared within a group, a selection per pane
  - `src/map/touchPolicy.js`
- **`Layer` and `SpiderLayer`** take their pane's `map` (and `paneId`) as props, so each pane sets up its own layers once.
- **`useMap`** gains `compactAttribution` and `tileCacheSize` options, the shared touch policy, and a `ResizeObserver` on its container.
- **`MapLayout`** renders `MapGrid` for both page types, and leaves only map-click filters that target several panes to the panes.
- **Tests:**
  - `MapGrid.test.jsx` runs each behaviour of the former `Map.test` and `DualMaps.test` on both presets.
  - The probe-based tests changed their probes, plus small fixture additions the grid needs (each fixture's grid now lists its layers, and the side-by-side fixture registers its maps). Their assertions didn't change. Files named after deleted components were renamed: `SideBySide.panes`, `MapPane.touch`, `MapPane.registration`.
  - `MapGrid.test.jsx` records what each pane renders: `Layer` and `SpiderLayer` get the pane's map only once it has loaded, `MapVisualisation` gets the pane's map and id for map visualisations only, and the legend waits for a ready map.
  - New unit tests cover the map group, map-click filters and the touch policy.

**Behaviour changes on dual pages.** These are the intended ones from §4:
- Everything the single map does is now available: spider layers, tap tooltips (the tapped feature on the tapped pane, the feature at that location on the other), the hover fallback on touch devices that hover, viewport filters, the draw control (on the left pane), the temporary feature label (on both panes), `visualisedFeatureIds` filtering, zoom tracking (from the left pane) and the mobile attribution bar.
- Leaving a map clears both panes' tooltips (§2.2(11)).
- Each pane sets up its layers once (§2.2(7)), and the card stack is drawn once (§2.2(8)).
- Layer-click popups use the single map's options (`closeOnClick: false`), close when the data changes (as on the single map, so they never show a stale value), and are skipped on touch devices, where the tap tooltip stands in.
- Compact attribution on both maps (before, the right map only).

Map-click filters also change on dual pages:
- They respect `filter.panes`: a filter named "Left …" changes only the left pane (before, both).
- Each pane looks up its feature at the click's location projected onto its own map (before, the same screen point on both maps).
- The action's configured payload is passed on (before, it was dropped on dual pages).
- When several map-click filters' layers are under the click, the top-most feature decides, and of several filters on one layer only the first applies to each pane, as on the single map. A "Left …" and a "Right …" filter on one layer still each apply to their own pane. (Before, dual pages applied every map-click filter.)
- A map-click filter targeting one pane (say "Left …") is also re-sent by `MapLayout` when its value changes, as on single pages, and its initial value is sent at load.
- On touch devices a tap runs the map-click filter from both `touchend` and the map's `click`, as single pages already did; the second run repeats the same values.

**Behaviour changes on single-map pages:**
- Clicking where there is no feature keeps the map-click selection (§4).
- The one-finger-pan touch policy and the narrow-desktop-window fix apply (§4).
- Resizing follows the container (§4).
- There is one map-click selection per pane: selecting a feature of another filter's layer clears the first highlight (before, each layer kept its own). A feature without an id gets the GeoJSON fallback highlight.
- The pointer cursor also shows over layers with hover tooltips, not only click tooltips.

**Unchanged:**
- the legend's choice of map on dual pages (the right pane, unless only the left has data)
- the legend's and card stack's positions on screen (they are now drawn over the grid, whose bottom-right corner is the right pane's)

**Not yet:**
- grid configs other than the presets, independent panes and own classification (Phase 4)
- `PageLegend`, with a legend section per classification group (Phase 4); for now the legend keeps the old rule
- `state.drawPaneId` (Phase 5)
- the manual check of BaseApp's dual pages on desktop and mobile: this environment has no running app with real configs and data, so it stays in the §4 pre-merge check before this work goes into `dev`

**Pulled forward from Phase 4:** per-pane tile-cache sizing and the mobile one-column layout with a gap.

**Also:** the draw control is now removed again when its pane's map goes (it never was before).

### Phase 4: Grid config and layout
- `config.grid`: placement, spans, relative sizes, validation, sync groups other than `"default"` and `null`, `classification: "own"` (own bins and its own legend section), `PageLegend` (a legend section per classification group), the pane cap warning, and the `webglcontextlost` message. (Tile-cache sizing and the mobile one-column layout shipped in Phase 3.)

*Exit:* `resolveMapGrid` tests, plus `MapGrid` tests for a 2×2 grid, a spanning cell, an independent pane and an opted-out pane.

**Phase 4 result.** Full suite: 121 suites and 1078 tests, all passing.

- **Grid config.** `resolveMapGrid` reads `config.grid` on any map page (a `DualMapLayout` page with a grid uses the grid):
  - `columns` and `rows` take a count or a list of relative sizes
  - each cell takes placement, spans, title, visualisations, layers, sync group and classification, with the defaults in §3.3
  - every cell stays in the grid, but only `map` cells become panes; other types render an empty cell for now
- **Validation.** Problems don't throw. Each comes back as a warning, and where one can be fixed it is:
  - bad sizes, including sizes that aren't finite (a size of 1 is used)
  - missing, non-string or repeated ids (a new id is generated that no other cell has or asks for)
  - unknown cell types (an empty cell)
  - placement values that aren't positive whole numbers (1 is used)
  - cells reaching outside the grid (moved and trimmed to fit)
  - a cell overlapping an earlier one (left out; the earlier cell keeps the space)
  - visualisations that aren't page map visualisations, or layers the page doesn't define (warned only)
  - unknown classification values (`"shared"` is used)
  - map fields (`classification`, `syncGroup`, `visualisations`, `layers`) on a cell that isn't a map (ignored)
  - a grid with no map cells (the page falls back to its preset)
  - a grid on a `DualMapLayout` page: filters' `sides` and the Left/Right name rules no longer apply, so filters need `panes` (warned only)
  - more than 4 map panes (warned only)

  `filterPaneWarnings` names filters that target panes the grid doesn't have. `MapContext` logs all of them in development only (when the app's bundler sets `process.env.NODE_ENV` to `development`), prefixed with the page name.
- **Layout.** `MapGrid` turns the sizes into grid tracks and renders cells through a registry of cell types (only `map` for now).
- **Panes:**
  - A pane without a sync group neither moves with nor shares hover and popups with the others.
  - A pane with `classification: "own"` classifies over its own data only.
  - A titled pane is a labelled region.
- **Legend.** `PageLegend` shows a legend per classification group. A page with one group shows a single legend. With several groups, the legends stack in the bottom-right corner (on mobile each goes to the mobile legend slot); groups with titled panes are headed with those titles. Each group's legend lists its last pane with data for the first map visualisation the group shows. Preset pages keep their earlier rule, checking the page's first visualisation whatever its type, so their legend lists the same map as before. `DynamicLegend` gains `title` and `stacked` props.
- **Context loss.** If the browser drops a pane's WebGL context, the pane says the map can't be drawn and asks for a reload. The message clears if the context comes back.
- **No change on presets.** Single and side-by-side pages behave as after Phase 3.
- **Not yet:**
  - A legend for a pane with its own classification lists that pane's layers and colours, but its band editor and histogram data still come from the page copy (all panes' data). Phase 5 moves `DynamicLegend` onto the selectors.
  - Feature focus moves the primary pane and its sync group. Panes in other groups aren't fitted, because the request doesn't say which panes it is for. That comes with the targeting work in Phase 5.
  - Per-pane style controls are deferred (§8).

### Phase 5: Explicit targeting and UI
- Document `filter.panes` and add the dev warning for the legacy rules.
- Group sidebar filters by pane title.
- `MapLayerSection` shows the union of layers across panes.
- `LayerControlEntry` uses `selectVisualisationForLayer`.
- Move `DynamicLegend` and the callout cards onto selectors, so `state.visualisations[].data` can be dropped.
- Add `state.drawPaneId`.

*Exit:* sidebar and layer-control tests on grid pages.

### Phase 6: Docs and cleanup
- Add `docs/Map Grid.md`: the config reference, the presets, and a migration note from `Left`/`Right` names and `separateSidePaths` to `panes` and `separatePanePaths`.
- Write the CHANGELOG entry (a minor, with no BREAKING footer, because the config and BaseApp contract is unchanged).
- Delete the legacy `data` mirror if Phase 5 removed the last reader.

---

## 7. Testing strategy

- **Pure first.** `resolveMapGrid`, `resolveFilterPanes`, `applyVisualisationParam`, the selectors, `tooltipContent` and `selectionHighlight` get table-driven unit tests with no MapLibre involved. Most of the logic that used to be duplicated ends up here.
- **Component tests run over presets.** `describe.each([["1×1", single], ["1×2", dual]])` over `MapPane`/`MapGrid` replaces the two parallel 1,000+ line files, so each behaviour is asserted once and runs for both layouts.
- **Grid-specific tests** cover sync-group isolation (hover in pane A doesn't reach an independent pane B), own classification bins, and map-click targeting where a filter's panes and the sync group only partly overlap.
- **Listener hygiene.** Keep and generalise the tests from #366 ("removes every map listener it adds", "one mousemove per map however often it re-renders") to N panes.
- **Accessibility.** Re-run the BaseApp accessibility tests. Grid cells with titles get `role="region"` and an `aria-label`.

---

## 8. Risks and follow-ups

| Risk | Mitigation |
|---|---|
| The memoised merge in `usePaneVisualisation` changes identity too often, so fetches repeat | Memoise on the canonical and override references only. A test asserts one fetch per param change per pane. |
| N instances of `MapVisualisation` race on page-wide flags | `SET_NO_DATA_RETURNED` is aggregated (§3.8). Classification-method initialisation dispatches only if the value isn't set, and is idempotent. |
| Memory and GPU use with many panes | Soft cap, tile-cache scaling and the context-loss message (§3.11). |
| One-finger pan on stacked mobile maps makes the page hard to scroll | Each cell is at most `56vh` tall, with a gap of at least 24px between cells (§3.11). Phase 3's mobile check confirms the page scrolls on a real phone for both presets and a 2×2 grid. |
| A dual config relies on the old silent behaviour | §4 lists every change. The Phase 3 pre-merge check covers BaseApp and the known app configs. |
| A large diff in Phase 3 | Phases 1–2 move most of the logic first. Phase 3 is mainly wiring and deletion. |
| Map instances stored in reducer state | Kept, as today. Moving them into a ref-based registry (`MapGroupContext`) is a possible follow-up, not needed for this work. |

**Deferred, by decision or out of scope:**
- **Telling id-less features apart.** The hover fast path compares feature ids, so two different features without ids on one layer count as the same. A second tap on such a feature moves the popup but keeps the first feature's text. This predates the consolidation; Phase 3 could compare a key that falls back to the feature's properties or geometry.
- **Per-pane style controls.** Move runtime style into a `layerStyles[styleKey]` slice, where `styleKey` is the layer, or layer plus pane for opted-out panes, so opted-out panes get their own entry in the layer controls.
- **Non-map cell types**, such as charts, standalone card stacks and text. The grid's cell registry is the extension point.
- **Per-group `currentZoom`** for zoom-gated legend sections on independent panes.
- **Feature-select filters targeting different panes**, which needs one draw instance per pane.
- **Sharing a fetch** across panes with identical effective params.
- **One grid primitive** shared by the admin page's `layout` and `MapGrid`.
