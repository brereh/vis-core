# Metadata Driven Filters Documentation

Filters in `vis-core` can be driven by metadata tables fetched at runtime. This allows dropdowns and selectors to be populated dynamically based on data available in the system.

## Filter Configuration (`values` block)

When defining a filter that uses a metadata table, the `values` object within the filter configuration provides the mapping between the tabular data and the dropdown options.

### Properties

- `source`: Must be set to `"metadataTable"`.
- `metadataTableName`: The name of the metadata table configured in `pageContext.config.metadataTables`.
- `displayColumn`: The column in the metadata table containing the label to display in the dropdown.
- `paramColumn`: The column containing the underlying value passed to the filter state.
- `legendSubtitleTextColumn` (optional): A column containing subtitle text for the legend when this option is selected.
- `infoOnHoverColumn` (optional): A column containing tooltip text to display on hover.
- `infoBelowOnChangeColumn` (optional): A column containing informational text to display below the selector.
- `sort` (optional): Defines the sorting order. Accepts `"ascending"` or `"descending"`. If omitted, options will remain in the order they appear in the original metadata table.
- `sortColumn` (optional): The column containing values to use for sorting (e.g., an index or priority column). If defined alongside `sort`, the dropdown options will be ordered according to this column. If omitted, sorting defaults to the text in `displayColumn`.
- `where` (optional): An array of condition objects to filter the rows before populating options.
- `exclude` (optional): An array of `paramValue`s to exclude from the dropdown.

### Example Configuration

```json
{
  "filterName": "Select Local Authority",
  "paramName": "local_authority",
  "type": "dropdown",
  "values": {
    "source": "metadataTable",
    "metadataTableName": "authorities_metadata",
    "displayColumn": "authority_name",
    "paramColumn": "authority_id",
    "sortColumn": "display_order",
    "sort": "ascending"
  }
}
```

### Sorting Behavior

1. **Original Table Order**: If `sort` is **omitted**, the dropdown will populate in the exact order the rows appear in the metadata table (deduplicated).
2. **Alphabetical/Numeric Sort**: If `sort` is set to `"ascending"` or `"descending"` and `sortColumn` is **omitted**, the options will be sorted alphabetically/numerically by their `displayColumn` text.
3. **Custom Column Sort**: If both `sort` and `sortColumn` are provided, the options will be sorted based on the numeric or text values in the `sortColumn`.

## Date range bounds

A `dateRange` filter reads its `min` and `max` from a metadata table instead of building options. Set `column` (or `minColumn` and `maxColumn`) in its `values` block; `where` is applied first. See [Date Range Selector](Date%20Range%20Selector.md).
