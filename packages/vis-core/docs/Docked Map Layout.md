# Docked Map Layout

By default a `MapLayout` page shows the filter sidebar as a collapsible overlay on the left of the map, and the callout cards for a selected feature as slide-over panels on the right.

The docked layout replaces both with fixed columns:

| Column | Width | Contents |
| --- | --- | --- |
| Left: filters (`<aside aria-label="Filters">`) | 420 px | Page title and description, then the filters as an always-open labelled section, then any download section. "About this visualisation", "Glossary", "Map layer control", any `additionalMapLayoutAccordionSections` and "Legal" stay as accordion entries underneath. There is no collapse toggle. |
| Middle: map | The remaining width | The map and its legend (bottom left). MapLibre is resized whenever its container changes size, so the canvas is never clipped or offset. |
| Right: selected feature (`<aside aria-label="Selected feature">`) | 460 px | The callout cards for the selected feature, always open and full width, with no ">" toggle or slide animation. With nothing selected it shows the page's prompt text. |

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
| `dockedPrompt` | page `config` | `"Click a feature on the map to see its summary"` | Text in the right-hand column while nothing is selected. |
| `description` | page (next to `pageName`) | unset | Short description under the title in the left-hand column. |

Only `MapLayout` pages dock. `DualMapLayout` pages keep the overlay layout.

## Smaller screens

The docked layout applies at viewport widths of 1100 px and above (`DOCKED_LAYOUT_MIN_WIDTH`). Below that the page falls back to the default overlay sidebar and slide-over cards, and the mobile layout (`MobileBar`, at 900 px and below) is unchanged.

## Accessibility

- Both columns are `aside` landmarks, labelled "Filters" and "Selected feature".
- When a feature's summary appears in the right-hand column, a polite live region (`role="status"`, `aria-live="polite"`) announces it. Focus stays on the map, so keyboard users can keep exploring it.
- `MapLayout.docked.test.jsx` includes a jest-axe check of the docked layout.

## Styling

The columns use the existing CSS variables (`--palette-white`, `--palette-mid-grey`, `--palette-grey`, `--text-icon`), so they follow the app's branding tokens. See [Branding Token Usage Guide](./Branding%20Token%20Usage%20Guide.md).
