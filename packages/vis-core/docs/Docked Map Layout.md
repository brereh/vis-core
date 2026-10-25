# Docked Map Layout

By default a `MapLayout` page shows the filter sidebar as a collapsible overlay on the left of the map, and the callout cards for a selected feature as slide-over panels on the right.

The docked layout replaces both with fixed columns:

| Column | Width | Contents |
| --- | --- | --- |
| Left: filters (`<aside aria-label="Filters">`) | 320 px (`dockedFilterWidth`) | Page title and description, then the filters as an always-open labelled section, then any download section. The teal map-click hints that `type: "map"` filters show in the overlay sidebar are left out, because the right-hand column's prompt already says the same; overlay and mobile layouts keep them. "About this visualisation", "Glossary", "Map layer control", any `additionalMapLayoutAccordionSections` and "Legal" stay as accordion entries underneath. There is no collapse toggle. |
| Middle: map | The remaining width | The map, with its legend bottom-left and the zoom and compass control moved to the top-left so the two don't overlap (the default layout keeps the control bottom-left). The control moves back if the window narrows below the docked breakpoint. MapLibre is resized whenever its container changes size, so the canvas is never clipped or offset. |
| Right: selected feature (`<aside aria-label="Selected feature">`) | 360 px (`dockedSelectionWidth`) | The callout cards for the selected feature, always open and full width, with no ">" toggle or slide animation. With nothing selected it shows the page's prompt text. |

The docked layout is opt-in. With no `layout` set, pages render exactly as before.

## Turning it on

For one page, set `layout` in the page `config`:

```js
{
  pageName: "Traffic counts",
  type: "MapLayout",
  description: "Hourly counts at permanent and temporary sites.",
  config: {
    layout: "docked",
    dockedPrompt: "Click a site on the map to see its summary",
    layers: [/* ... */],
    visualisations: [/* ... */],
    filters: [/* ... */],
  },
}
```

For every map page in an app, set `defaultMapLayout` on the app config (the value passed to `AppContext`). A page's own `config.layout` takes precedence, so a page can opt back out with `layout: "overlay"` (any value other than `"docked"`).

```js
const appConfig = {
  // ...
  defaultMapLayout: "docked",
};
```

| Key | Where | Default | Effect |
| --- | --- | --- | --- |
| `layout` | page `config` | unset | `"docked"` turns the docked layout on for the page. |
| `defaultMapLayout` | app config | unset | App-wide default for `layout`. |
| `dockedFilterWidth` | page `config` | `320` | Width of the filters column. A number is pixels; a string is any CSS width (`"22rem"`). |
| `dockedSelectionWidth` | page `config` | `360` | Width of the selected-feature column, as above. |
| `defaultDockedFilterWidth` | app config | unset | App-wide default for `dockedFilterWidth`. |
| `defaultDockedSelectionWidth` | app config | unset | App-wide default for `dockedSelectionWidth`. |
| `dockedPrompt` | page `config` | `"Click a feature on the map to see its summary"` | Text in the right-hand column while nothing is selected. |
| `description` | page (next to `pageName`) | unset | Short description under the title in the left-hand column. |

Only `MapLayout` pages dock. `DualMapLayout` pages keep the overlay layout, and so do pages with any `cardType: "fullscreen"` callout card, because that card covers the whole map area and can't sit inside the right-hand column.

## Density

The docked columns are denser than the overlay sidebar and cards. These sizes apply in the docked layout only; the overlay and mobile layouts are unchanged.

- **Filters column:** 12 px padding; 14 px body text; 18 px page title; 14 px description; 32 px dropdown controls; accordion rows ("About this visualisation", "Glossary", "Map layer control", "Legal") 36 px tall with 14 px text. Selector labels (14 px) and the 10 px gap between selectors are the sidebar's existing sizes.
- **Selected-feature column:** 12 px padding, and cards full width with 12 px padding. Card titles (16 px) and body text (about 13.6 px) keep the cards' existing sizes. Charts without their own `height` or `barHeight` are 200 px tall (`COMPACT_CHART_HEIGHT`) instead of 220–225 px, and their axis, unit and legend text is at least 11 px.
- Colours come from the existing tokens (`--text-icon` for text), focus outlines are unchanged, and interactive targets stay at least 24×24 px.

## Smaller screens

The docked layout applies at viewport widths of 1100 px and above (`DOCKED_LAYOUT_MIN_WIDTH`). Below that the page falls back to the default overlay sidebar and slide-over cards, and the mobile layout (`MobileBar`, at 900 px and below) is unchanged.

## Accessibility

- Both columns are `aside` landmarks, labelled "Filters" and "Selected feature".
- A polite live region (`role="status"`, `aria-live="polite"`) in the right-hand column announces what it shows: the card name and the selected feature's id from the card's path params (for example "Showing Site summary for 1234"), again whenever the selection changes, and "Selection cleared" when it empties. Focus stays on the map, so keyboard users can keep exploring it.
- `MapLayout.docked.test.jsx` includes a jest-axe check of the docked layout.

## Styling

The columns use the existing CSS variables (`--palette-white`, `--palette-mid-grey`, `--palette-grey`, `--text-icon`), so they follow the app's branding tokens. See [Branding Token Usage Guide](./Branding%20Token%20Usage%20Guide.md).
