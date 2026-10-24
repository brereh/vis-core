# Date range selector

The `dateRange` filter type renders two labelled native date inputs ("From" and "To") in the sidebar, with an optional checkbox for a related boolean parameter. It sends two API parameters, one per date, as ISO `YYYY-MM-DD` strings.

## Configuration

```js
{
  filterName: "Survey dates",
  type: "dateRange",
  paramName: ["date_from", "date_to"],
  min: "2025-10-06",
  max: "2025-10-19",
  defaultValue: ["min", "max"],
  locale: "en-GB",
  extraToggle: { paramName: "include_excluded", label: "Include excluded days", defaultValue: false },
  visualisations: ["Counts"],
  actions: [{ action: "UPDATE_QUERY_PARAMS" }],
}
```

| Property | Required | Description |
| --- | --- | --- |
| `paramName` | Yes | An array of two parameter names: the start date, then the end date. Names are not fixed, so any API naming works. |
| `min`, `max` | No | The earliest and latest selectable ISO dates. Chosen dates are clamped to them. |
| `values` | No | Reads `min` and `max` from a metadata table instead (see below). |
| `defaultValue` | No | `[from, to]`. Each entry is an ISO date or the keyword `"min"` or `"max"`. Defaults to `["min", "max"]`. |
| `locale` | No | A BCP 47 locale, such as `en-GB`. Used for the dates in the hint and error text, and set as the inputs' `lang`. Defaults to the browser's locale. |
| `labels` | No | `{ from, to }` input labels. Default to "From" and "To". |
| `extraToggle` | No | `{ paramName, label, defaultValue }`. Adds a checkbox that sets a boolean parameter. |
| `persistState`, `disabledWhen`, `info` | No | Work as for other selectors. |

The filter value held in `FilterContext` is `[from, to]`, or `[from, to, toggle]` with an `extraToggle`. `UPDATE_QUERY_PARAMS`, `UPDATE_PATH_PARAMS`, their dual-map variants and `UPDATE_PARAMETERISED_LAYER` set each parameter from its position in the value. The sidebar's CSV and shapefile downloads send every parameter too.

### Metadata-driven bounds

```js
values: {
  source: "metadataTable",
  metadataTableName: "survey_days",
  column: "survey_date",            // or minColumn / maxColumn
  where: [{ column: "is_counted", operator: "equals", values: true }],
}
```

The earliest value of `minColumn` (or `column`) becomes `min` and the latest value of `maxColumn` (or `column`) becomes `max`. ISO date-time strings are cut to their date. A static `min` or `max` is kept if the table provides no date. If neither gives both bounds, the filter is reported as an empty metadata filter.

## Behaviour

- **Validation.** If "From" is after "To", or either date is cleared, nothing is sent. An inline error, such as `"From" date (15/10/2025) must be on or before "To" date (10/10/2025).`, is shown in a `role="alert"` region, and both inputs get `aria-invalid="true"` and an `aria-describedby` link to it.
- **Clamping.** A date outside `min`/`max` is moved to the nearest bound, in the input and in the value sent.
- **Display.** The browser draws native date inputs in its own locale. Every date vis-core writes itself (the "Available … to …" hint and the error text) uses `locale`. API values are always ISO.
- **Extra toggle.** Ticking the checkbox sends the current dates with the new boolean value.
- **Dynamic selectors.** `disabledWhen` disables both inputs and the checkbox. `excludeWhenMatches` does not apply to a continuous range and is ignored, as for sliders.
- **Persistence.** With `persistState: true`, the whole value is stored. On restore it is clamped to the current bounds, and an invalid range falls back to the default.

## OpenAPI validation

Every entry of an array `paramName`, and `extraToggle.paramName`, counts as provided by the filter, so required `date_from`, `date_to` and `include_excluded` parameters are not reported as missing.

## Other multi-parameter filters

The parameter handling lives in `utils/filterParams.js` (`getFilterParamNames`, `filterHasParam`, `expandFilterParamValues`) and is not specific to dates. Filters with a single string `paramName` behave exactly as before.
