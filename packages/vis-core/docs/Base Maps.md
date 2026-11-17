# Base maps

This document explains how base maps are configured, changed, and extended in `vis-core`.

## Overview

The `vis-core` mapping architecture separates base maps (background geography, terrain, water, and place-name labels) from application data (choropleths, boundary outlines, point markers, and line networks).

All base maps are represented as explicit descriptors in [`baseMaps.js`](file:///C:/dev/Transport-for-the-North/vis-core/packages/vis-core/src/map/baseMaps.js). This ensures that style resolution, UI metadata, colour theming, and label-layering rules are defined declaratively in one location. When changing base maps, a shared transition coordinator ([`useBaseMapTransition.js`](file:///C:/dev/Transport-for-the-North/vis-core/packages/vis-core/src/hooks/useBaseMapTransition.js)) swaps the background cartography while preserving all loaded application data, re-theming boundary outlines, and replaying feature states.

## Changing base map styles

Consuming applications and end users can change base map styles in four ways:

### 1. Application default configuration

Consuming applications specify their preferred initial base map by passing `defaultBaseMapId` to `AppProvider` (or setting it on `AppContext`):

```jsx
import React from "react";
import { AppProvider } from "vis-core/contexts";

export const App = () => (
  <AppProvider defaultBaseMapId="darkMatter">
    {/* Application content */}
  </AppProvider>
);
```

If `defaultBaseMapId` is omitted, the application falls back to `DEFAULT_BASE_MAP_ID` (`"positron"`).

### 2. Runtime switching with the map style toggle

When base maps are managed through descriptors, the [`MapStyleToggle`](file:///C:/dev/Transport-for-the-North/vis-core/packages/vis-core/src/Components/MapLayout/MapStyleToggle.jsx) component renders an interactive toggle button into MapLibre's navigation control group alongside the zoom and compass controls.

Clicking the toggle button dispatches `actionTypes.SET_BASE_MAP` to [`MapContext`](file:///C:/dev/Transport-for-the-North/vis-core/packages/vis-core/src/contexts/MapContext.jsx):

```javascript
dispatch({
  type: actionTypes.SET_BASE_MAP,
  payload: "darkMatter",
});
```

The toggle automatically selects the alternative base map from the catalogue, displays accessible tooltip text (such as "Switch to Dark map"), and switches its icon between sun and moon according to the active descriptor's `theme`.

### 3. User preference persistence

User base-map selections persist in browser `localStorage` under the key `vis-core-base-map`.

When a user selects a base map, [`MapContext`](file:///C:/dev/Transport-for-the-North/vis-core/packages/vis-core/src/contexts/MapContext.jsx) automatically writes the preference to storage using [`writeBaseMapPreference`](file:///C:/dev/Transport-for-the-North/vis-core/packages/vis-core/src/map/baseMapPreference.js).

When the map initialises, [`readBaseMapPreference`](file:///C:/dev/Transport-for-the-North/vis-core/packages/vis-core/src/map/baseMapPreference.js) resolves the initial style using the following priority order:

1. **Saved user preference:** The value stored under `vis-core-base-map` in `localStorage`, provided it matches a known descriptor in `BASE_MAPS`. If the stored ID is unrecognised, it is pruned and ignored.
2. **Application default:** The `defaultBaseMapId` provided by `AppContext`.
3. **Library default:** `DEFAULT_BASE_MAP_ID` (`"positron"`).

### 4. Custom unmanaged styles

If an application requires a bespoke, static MapLibre style JSON URL without descriptor management, it can supply `mapStyle` directly to `AppContext` without specifying `defaultBaseMapId`:

```jsx
<AppProvider mapStyle="https://example.com/custom-style.json">
  {/* Application content */}
</AppProvider>
```

Under this configuration:
- `state.baseMapId` is initialised to `null`.
- `state.mapStyle` loads the custom style URL directly.
- [`MapStyleToggle`](file:///C:/dev/Transport-for-the-North/vis-core/packages/vis-core/src/Components/MapLayout/MapStyleToggle.jsx) renders `null`, hiding itself from the map control group.
- The map operates with the unmanaged custom style without running descriptor label transforms.

## Adding new base map styles

New base map styles are added by defining a descriptor in [`baseMaps.js`](file:///C:/dev/Transport-for-the-North/vis-core/packages/vis-core/src/map/baseMaps.js).

### Base map descriptor specification

Each base map is defined as an object conforming to the `BaseMapDescriptor` structure:

| Property | Type | Required | Description |
|---|---|---|---|
| `id` | `string` | Yes | Unique string identifier (for example `"positron"`, `"darkMatter"`, or `"osVector"`). |
| `label` | `string` | Yes | Human-readable title displayed in toggle tooltips and accessibility labels. |
| `theme` | `'light'` \| `'dark'` | Yes | Authoritative colour theme. Used to theme application layers, legend backgrounds, and boundaries. |
| `resolveStyle` | `() => string \| Object` | Yes | Function returning either a style JSON URL or a full MapLibre style specification object. |
| `labels` | `Object` | No | Configuration policy for place and street name labels. |

#### Why theme is explicit

The `theme` property is strictly `'light'` or `'dark'`. It is never inferred from style URLs or style metadata names. When switching between light and dark base maps, [`applyApplicationTheme`](file:///C:/dev/Transport-for-the-North/vis-core/packages/vis-core/src/map/applicationLayerTheme.js) adapts application layer boundary lines, non-stylable polygons, points, and line colours to ensure contrast against the base map.

#### Label policy properties

The `labels` object controls how base-map symbol layers are styled and ordered:

- `placement`: `'above-application'` or `'below-application'`.
  - When set to `'above-application'`, base place-name and settlement labels are lifted above application polygon fill layers so geographical context remains readable beneath data visualisations.
  - When set to `'below-application'`, all base layers remain beneath application layers.
- `layerPrefixes`: Array of string prefixes matching symbol layer IDs (for example `["place_", "place-"]`).
- `layerIds`: Array of exact layer IDs to target.
- `matches`: Optional function `(layer) => boolean` for custom layer matching.
- `paint`: Either `"provider"` (preserves the provider's default text colour and halo) or a paint override object containing `default` and optional `byLayerId` overrides.
- `layout`: Either `"provider"` (or omitted, preserving the provider's layout object by reference) or a layout override object containing `default` and optional `byLayerId` overrides (for example `default: { "text-font": ["Noto Sans Bold"] }`).

> [!NOTE]
> When `layout` is `"provider"` or omitted, layout objects are preserved by reference identity, avoiding glyph re-layout overhead and font stack conflicts. When configured, layout properties (such as `text-font`) are merged to configure appropriate font weights or styling.

### Example: adding an Ordnance Survey (OS) vector tile style

The Ordnance Survey OS Maps API provides vector tiles with MapLibre-compatible style JSON.

To add an OS vector base map:

1. Open [`packages/vis-core/src/map/baseMaps.js`](file:///C:/dev/Transport-for-the-North/vis-core/packages/vis-core/src/map/baseMaps.js).
2. Define the descriptor and add it to `BASE_MAPS`:

```javascript
import { getMapApiToken } from "../runtime";

export const BASE_MAPS = {
  positron: {
    id: "positron",
    label: "Light map",
    theme: "light",
    resolveStyle: () =>
      `https://maps.geoapify.com/v1/styles/positron/style.json?apiKey=${getMapApiToken()}`,
    labels: {
      placement: "above-application",
      layerPrefixes: ["place_", "place-"],
      layout: {
        default: {
          "text-font": ["Noto Sans Bold"],
        },
      },
      paint: "provider",
    },
  },

  darkMatter: {
    id: "darkMatter",
    label: "Dark map",
    theme: "dark",
    resolveStyle: () => "https://tiles.openfreemap.org/styles/dark",
    labels: {
      placement: "above-application",
      layerPrefixes: ["place_", "place-"],
      paint: {
        default: {
          "text-color": "#ffffff",
          "text-halo-color": "rgba(0, 0, 0, 0.85)",
          "text-halo-width": 1.25,
          "text-halo-blur": 0.5,
        },
      },
    },
  },

  osOutdoor: {
    id: "osOutdoor",
    label: "OS Outdoor map",
    theme: "light",
    resolveStyle: () => {
      const apiKey = getMapApiToken("os") || "YOUR_OS_API_KEY";
      return `https://api.os.uk/maps/vector/v1/vts/resources/styles?key=${apiKey}&srs=3857`;
    },
    labels: {
      placement: "above-application",
      layerPrefixes: ["Landform/Label", "Populated Place/Label"],
      paint: "provider",
    },
  },
};
```

### Example: adding a raster tile provider (e.g. OS Leisure raster tiles)

When a tile provider supplies raster XYZ or WMTS tiles instead of a vector style JSON endpoint, `resolveStyle` can return a full MapLibre style specification object:

```javascript
export const BASE_MAPS = {
  // ...other base maps
  osLeisureRaster: {
    id: "osLeisureRaster",
    label: "OS Leisure raster map",
    theme: "light",
    resolveStyle: () => {
      const apiKey = getMapApiToken("os") || "YOUR_OS_API_KEY";
      return {
        version: 8,
        sources: {
          "os-raster-tiles": {
            type: "raster",
            tiles: [
              `https://api.os.uk/maps/raster/v1/zxy/Leisure_27700/{z}/{x}/{y}.png?key=${apiKey}`,
            ],
            tileSize: 256,
            attribution: "© Crown copyright and database rights " + new Date().getFullYear() + " Ordnance Survey",
          },
        },
        layers: [
          {
            id: "os-raster-layer",
            type: "raster",
            source: "os-raster-tiles",
            minzoom: 0,
            maxzoom: 20,
          },
        ],
      };
    },
    labels: {
      placement: "below-application",
    },
  },
};
```

### Validating descriptors

[`validateBaseMapDescriptor`](file:///C:/dev/Transport-for-the-North/vis-core/packages/vis-core/src/map/baseMaps.js) verifies that a descriptor contains all mandatory fields:

```javascript
import { validateBaseMapDescriptor } from "vis-core/map";

// Throws a descriptive error if id, theme, or resolveStyle are invalid or missing:
validateBaseMapDescriptor(BASE_MAPS.osOutdoor);
```

## Architecture and transition lifecycle

When a base map switch is triggered, the transition is coordinated by [`useBaseMapTransition.js`](file:///C:/dev/Transport-for-the-North/vis-core/packages/vis-core/src/hooks/useBaseMapTransition.js). The map grid ([`MapGrid.jsx`](../src/Components/MapLayout/MapGrid.jsx)) runs it once for every pane's map, so single-map and side-by-side pages share this coordinator.

### Transition flow

```
User toggles base map / dispatch(SET_BASE_MAP)
                       │
                       ▼
         MapContext updates state.baseMapId
                       │
                       ▼
       useBaseMapTransition coordinator runs
                       │
                       ├── 1. Reads incoming descriptor
                       ├── 2. Resolves style via descriptor.resolveStyle()
                       ├── 3. Calls map.setStyle(styleUrl, { transformStyle })
                       │
                       ▼
           mergeBaseMapStyle pure merge
                       │
                       ├── Preserves active application sources
                       ├── Preserves active application layers
                       ├── Removes old base sources and layers
                       ├── Inserts incoming base sources and layers
                       └── Interleaves label layers according to descriptor.labels.placement
                       │
                       ▼
             MapLibre style.load fires
                       │
                       ├── 1. applyLabelPolicyToMap (applies label paint overrides)
                       ├── 2. applyApplicationTheme (updates boundary lines and colours)
                       ├── 3. restoreMapRuntimeState (replays feature states for choropleths)
                       └── 4. map.triggerRepaint()
```

### Application source and layer preservation

The pure function [`mergeBaseMapStyle.js`](file:///C:/dev/Transport-for-the-North/vis-core/packages/vis-core/src/map/mergeBaseMapStyle.js) separates application layers from base layers.

Base-source ownership is tracked per map instance using a `WeakMap` in [`useBaseMapTransition.js`](file:///C:/dev/Transport-for-the-North/vis-core/packages/vis-core/src/hooks/useBaseMapTransition.js). When switching styles:
1. All sources in `previousStyle.sources` not belonging to the previous base are retained as application sources.
2. All layers in `previousStyle.layers` referencing application sources are retained as application layers.
3. Old base sources and layers are discarded.
4. Incoming base layers and sources are added without touching application layers.

### Post-load runtime restoration

MapLibre resets interactive feature states when a new style loads. To prevent visual flickering or loss of selected zones:
1. Visualisation components register a restorer with the central registry via [`registerMapRestorer`](file:///C:/dev/Transport-for-the-North/vis-core/packages/vis-core/src/map/runtimeRestorationRegistry.js).
2. When `style.load` fires, [`restoreMapRuntimeState`](file:///C:/dev/Transport-for-the-North/vis-core/packages/vis-core/src/map/runtimeRestorationRegistry.js) invokes all registered restorers.
3. Feature hover states, selection states, and choropleth colour states are re-applied before calling `map.triggerRepaint()`.
