# Dynamic selectors

This article outlines how dynamic disabling and mutual exclusivity are implemented across all filter components within the `vis-core` library.

Dynamic filter behaviour is controlled via two configuration properties: `disabledWhen` and `excludeWhenMatches`. These properties are defined within the layer configuration and instruct the user interface on how to react when a parent selector's value changes. In `SelectorSection.jsx`, the component evaluates these properties by reading the current state from the `FilterContext`.

## Disabling selectors

When a filter's `disabledWhen` property evaluates to true (based on operators such as `equals` or `notEquals`), a `disabled` flag is set and passed down. This completely locks the component from user interaction.

### Example configuration

```json
{
  "type": "dropdown",
  "id": "comparatorRun",
  "paramName": "comparatorRunCode",
  "disabledWhen": {
    "paramName": "displayMode",
    "operator": "equals",
    "value": "absolute"
  }
}
```

- **Dropdown**: The underlying `react-select` component receives `isDisabled={true}`.
- **Toggle**: The container is set to `opacity: 0.45` and `pointer-events: none`, preventing interaction with individual buttons or the 'Toggle All' functionality.
- **CheckboxSelector**: Cascades the `disabled` state to native `<input type="checkbox">` elements, sets `cursor: not-allowed`, and blocks the 'Select All' button.
- **Slider**: Disables the native range `<input>`, sets opacity to 0.45, and applies `pointer-events: none`.
- **DateRangeSelector**: Disables both native date inputs and the optional extra toggle checkbox, sets opacity to 0.45, and applies `pointer-events: none`.
- **MapFeatureSelect (and variants)**: The `react-select` component receives `isDisabled={true}`, locking text input and dropdowns. For variants with controls, accompanying buttons (like 'Enable Selector' and 'Rectangle Select') are dynamically disabled alongside the main dropdown.

## Excluding values

When a filter specifies `excludeWhenMatches` (to enforce mutual exclusivity), the parent's current value is extracted and passed down as `excludeValue`. This dynamically removes specific options from the interface.

### Example configuration

```json
{
  "type": "dropdown",
  "id": "comparatorRun",
  "paramName": "comparatorRunCode",
  "excludeWhenMatches": "primaryRunCode"
}
```

- **Dropdown**: Filters its options array to completely remove the matched `excludeValue`.
- **Toggle**: Strips the `excludeValue` from the toggle options, removing the corresponding button from the DOM.
- **CheckboxSelector**: Filters out the `excludeValue` from the rendered list of checkboxes.
- **Slider**: Mutual exclusivity is inapplicable to sliders, so they solely honour the `disabled` state.
- **DateRangeSelector**: Mutual exclusivity is inapplicable to a continuous date range, so it solely honours the `disabled` state. See [Date Range Selector](Date%20Range%20Selector.md).

The target named by `disabledWhen.paramName` or `excludeWhenMatches` can be any parameter of a multi-parameter filter, such as `date_to` of a date range; the value of that parameter is used.

Testing coverage for these behaviours is maintained in `SelectorSection.test.jsx`, which mounts the contexts and verifies that both properties correctly cascade down to every filter type.
