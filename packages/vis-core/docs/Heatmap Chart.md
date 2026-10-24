# Heatmap chart

The `heatmap` chart type in `ChartRenderer` draws any row-by-column matrix as a grid of coloured cells, using a sequential colour scale. A typical use is one row per day and one cell per hour, coloured by flow.

It is rendered as SVG, scales to the width of its container, and scrolls horizontally inside its own box when the container is too narrow. Row labels stay in view while scrolling.

## Configuration

```js
{
  type: "heatmap",
  title: "Every hour of the survey",
  rowKey: "date", rowLabel: "date_label",
  columnKey: "hour", columnLabels: { every: 3, format: "HH:00" },
  valueKey: "value",
  missingKey: "is_missing",
  rowMarkers: [
    { key: "is_excluded", tone: "danger", symbol: "✕", strike: true },
    { key: "is_flagged", tone: "warning", symbol: "!" },
  ],
  colourScheme: "sequential",
  legend: { minLabel: "Fewer", maxLabel: "More vehicles per hour" },
  onRowSelect: "day",
}
```

Data is a flat array with one object per cell:

```js
[
  { date: "2025-10-06", date_label: "Mon 6 Oct", hour: 0, value: 92, is_missing: false },
  { date: "2025-10-06", date_label: "Mon 6 Oct", hour: 1, value: 61, is_missing: false },
  // ...
]
```

| Key | Required | Description |
| --- | --- | --- |
| `rowKey` | Yes | Field that identifies a row. Rows appear in the order they first occur in the data. |
| `rowLabel` | No | Field holding the row's display label. Defaults to the `rowKey` value. |
| `rowHeader` | No | Heading for the row column in the table view. Defaults to a readable form of `rowLabel`. |
| `columnKey` | Yes | Field that identifies a column. Numeric columns are sorted numerically; others keep the order they first occur in. |
| `columns` | No | Explicit column order, as an array of `columnKey` values. |
| `columnLabels.every` | No | Show a column label on every _n_th column. Defaults to `1`. The table view always labels every column. |
| `columnLabels.format` | No | A pattern such as `"HH:00"` (`HH` is the value padded to two digits, `H` is the value as is) or a function `(value) => string`. |
| `columnLabels.key` | No | Field to take column labels from instead of formatting the column value. |
| `cellLabelKey` | No | Field with a per-cell label for tooltips, for example a clock time that differs from the column label on clock-change days. |
| `valueKey` | No | Field holding the value. Defaults to `value`. |
| `missingKey` | No | Field that marks a cell as having no data. Cells whose value is empty or not a number are also treated as missing. |
| `rowMarkers` | No | Flags shown at the end of a row. See below. |
| `colourScheme` | No | `"sequential"` (default), a ColorBrewer scheme name known to chroma-js (for example `"Blues"`, `"YlGnBu"`), or an array of colours. |
| `legend.steps` | No | Number of colour classes. Defaults to `6`. |
| `legend.minLabel`, `legend.maxLabel` | No | Text at each end of the legend. Default to the lowest and highest value. |
| `legend.missingLabel` | No | Legend text for missing cells. Defaults to `"No data"`. |
| `valueFormatter` | No | Name of a function in the `formatters` passed to `ChartRenderer`. Defaults to a thousands-separated number. |
| `units` | No | Appended to values in tooltips and the table. |
| `cellHeight`, `minCellWidth` | No | Cell size in pixels. Default to `20` and `14`. |
| `onRowSelect` | No | Makes rows selectable. A string names a filter (or filter state key) to set; a function is called with `(rowKey, row)`. |

### Rows of different lengths

Rows do not need the same columns. A row with no entry for a column leaves that cell empty, which is different from a missing cell (an entry flagged as missing, which is hatched).

A column key must be unique within a row. If two records in a row share a column key, only the last is shown, and a warning is logged in development.

Column labels come from the first row that has the column (or from `columnLabels.format`). Tooltips and the table use `cellLabelKey` when it is set, so each cell can show its own label.

#### Clock-change days

For hourly data, key columns on an elapsed-hour index, not on the clock time. On the day the clocks go back, one clock hour occurs twice, so a clock-time key would repeat and one hour would be lost. Use the clock-time field for labels instead:

```js
{
  columnKey: "hour_index",                                   // 0–22, 0–23 or 0–24
  columnLabels: { every: 3, key: "hour_start" },             // header labels
  cellLabelKey: "hour_start",                                // tooltip label per cell
}
```

The grid then has as many columns as the longest day. Shorter days leave their last cells blank. On those days, cells after the change sit under the labels of a normal day, so the tooltip shows the true clock time.

### Row markers

Each marker is `{ key, tone, symbol, strike, label }`:

- `key`: a row is marked if any of its records has a truthy value for this field.
- `tone`: `"danger"` (or `"error"`), `"warning"`, `"accent"`, `"primary"`, or a colour. Tones come from the theme (`theme.colors.danger`, `theme.colors.warning`, `theme.colors.accent`, `theme.colors.primary`).
- `symbol`: text drawn at the end of the row. Defaults to `•`.
- `strike`: strike through the row label in the marker's tone.
- `label`: name used in the legend, the table's Notes column and the row label's accessible name. Defaults to a readable form of `key` (`is_excluded` becomes "Excluded").

The first marker on a row also outlines the row in its tone.

### Colours

The default `"sequential"` scale runs from `theme.colors.muted` to `theme.colors.primary`, so it follows an app's theme. Missing cells use a hatched pattern based on `theme.colors.danger`.

## Selecting rows

When `onRowSelect` is set, each row label is a button and clicking a cell also selects its row. The selected row is outlined in the primary colour and its label is shown as pressed.

- Arrow up and arrow down move between rows; Home and End jump to the first and last row. Enter or Space selects the focused row. Only one row button is in the tab order at a time.
- If `onRowSelect` is a string, selecting a row works the same way as clicking a map feature: it dispatches `SET_FILTER_VALUE` for that filter id through `FilterContext`, then runs the filter's configured `actions` through `MapContext` when a filter with that id exists there.
- The selected row follows the filter's value in `FilterContext`, so a selection made elsewhere (for example in a dropdown) is shown on the heatmap.

## Accessibility

- A **Show as table** toggle switches to a data table with every value, "No data" for missing cells and a Notes column for markers.
- Colour is never the only signal: missing cells are hatched, markers use symbols, and struck-through labels also carry the marker name for screen readers.
- Cell tooltips show the row, column and value on hover. They are mouse-only: individual cells are not focusable, and the chart is exposed to assistive technology as a single image. **Show as table** is how keyboard and screen-reader users read cell values.
