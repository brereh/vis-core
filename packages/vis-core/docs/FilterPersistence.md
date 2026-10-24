# Filter State Persistence Implementation

## Overview

This feature allows specific filters to persist their selected values across page navigation using browser localStorage. When a user navigates between pages, filters marked with `persistState: true` will automatically restore their previous selections, improving user experience by maintaining context.

## Implementation Details

### Core Utilities

**Location:** `vis-core/packages/vis-core/src/utils/filterPersistence.js`

The filter persistence utility provides the following functions:

#### `saveFilterState(filter, value)`
Saves a filter's value to localStorage when the filter has `persistState: true`.
- **Parameters:**
  - `filter` - The filter configuration object
  - `value` - The value to persist
- **Returns:** `boolean` - Success status
- **Storage Key Format:** `filter_state_{filterName}_{paramName}`

#### `loadFilterState(filter)`
Retrieves a filter's persisted value from localStorage.
- **Parameters:**
  - `filter` - The filter configuration object
- **Returns:** `any|null` - The persisted value or null if not found

#### `isPersistedValueValid(filter, persistedValue)`
Validates that a persisted value is still valid for the current filter options. This prevents "No data available" scenarios when switching between pages.
- **Parameters:**
  - `filter` - The filter configuration object
  - `persistedValue` - The value loaded from localStorage
- **Returns:** `boolean` - True if the value is valid

#### `getInitialFilterValue(filter)`
Gets the initial value for a filter, prioritizing valid persisted state over defaults.
- **Parameters:**
  - `filter` - The filter configuration object
- **Returns:** `any` - The initial value to use

**Priority Order:**
1. Valid persisted value from localStorage (if `persistState: true`)
2. Default value from filter configuration
3. First option value

#### Utility Functions
- `clearFilterState(filter)` - Clears a specific filter's persisted state
- `clearAllFilterStates()` - Clears all persisted filter states
- `generateFilterStorageKey(filterName, paramName)` - Generates unique storage key

### Integration Points

#### FilterContext (`contexts/FilterContext.jsx`)
The filter context reducer was modified to save to localStorage when filter values change:

```javascript
case filterActionTypes.SET_FILTER_VALUE: {
  const { filterId, value, filter } = action.payload;
  
  // ... existing logic ...
  
  // Save to localStorage if filter has persistState enabled
  if (filter && filter.persistState) {
    saveFilterState(filter, parsedValue);
  }
  
  return {
    ...state,
    [filterId]: parsedValue,
  };
}
```

**Important:** The filter object must be passed in the payload for persistence to work.

#### MapContext (`contexts/MapContext.jsx`)
Filter initialization in MapContext was updated to use the persistence utility:

```javascript
import { getInitialFilterValue } from "utils";

// In the filter initialization logic:
filterState[filterWithId.id] = getInitialFilterValue(filterWithId);
```

This ensures that filters initialized in MapContext also respect persisted state instead of always applying `shouldInitialSelectAllInMultiSelect` defaults.

#### MapLayout (`Components/MapLayout/MapLayout.jsx`)
Filter initialization was updated to check for persisted state:

```javascript
useEffect(() => {
  if (!initializedRef.current && state.pageIsReady) {
    state.filters.forEach((filter) => {
      filter.actions.forEach((actionObj) => {
        // Use getInitialFilterValue to get persisted state or default value
        let defaultValue = getInitialFilterValue(filter);
        
        // ... rest of initialization ...
      });
    });
  }
}, [dispatch, state.pageIsReady, state.filters, state.visualisations]);
```

The `handleFilterChange` function passes the filter object to enable persistence:

```javascript
const handleFilterChange = (filter, value) => {
  filterDispatch({
    type: 'SET_FILTER_VALUE',
    payload: { filterId: filter.id, value, filter },
  });
};
```

#### Dropdown Component (`Components/Sidebar/Selectors/Dropdown.jsx`)
The Dropdown component was updated to prevent the "select all" behavior from overriding persisted state:

```javascript
// Don't override persisted state with "select all" behavior
const hasPersistState = filter.persistState === true;

// Only fallback to "all visible" if the filter doesn't have persistState
if (current.length > 0 && next.length === 0 && shouldFallbackToAll && !hasPersistState) {
  const allVisible = visibleOptions.map((o) => o.value);
  setIsAllSelected(true);
  onChange(filter, allVisible);
}
```

This ensures that when a filter has `persistState: true`, the multi-select behavior won't automatically select all values, allowing the persisted selection to remain intact.

## Usage

### Enabling Persistence for a Filter

To enable persistence for any filter, simply add `persistState: true` to the filter definition:

```javascript
const railPeriodSelector = {
  filterName: "Rail Period Selector",
  paramName: "railPeriod",
  target: "api",
  actions: [
    { action: "UPDATE_QUERY_PARAMS" },
  ],
  type: "dropdown",
  persistState: true,  // <-- Add this property
  values: {
    source: "local",
    values: [
      { displayValue: "2025/P05", paramValue: "2025/P05" },
      { displayValue: "2025/P06", paramValue: "2025/P06" },
      // ... more values
    ],
  },
};
```

## Validation and Safety

### Automatic Validation

The system includes built-in validation to prevent issues when persisted values are no longer valid:

#### Single-Select Filters
- Checks if the persisted value exists in the current filter's options
- Falls back to default if the persisted value is not found

#### Multi-Select Filters
- Filters the persisted array to only include values that exist in current options
- If no valid values remain, falls back to defaults
- If some valid values exist, uses only those valid values

### Example Validation Scenario

**Scenario:** User selects Rail Period "2025/P05" on Page A, then navigates to Page B which only has periods "2025/P06" and "2025/P07".

**Result:** The persisted value "2025/P05" is detected as invalid, and the system falls back to "2025/P06" (first available option).

## Storage Format

Each persisted filter value is stored with metadata:

```json
{
  "value": "2025/P05",
  "timestamp": "2026-01-13T10:30:00.000Z",
  "filterName": "Rail Period Selector",
  "paramName": "railPeriod"
}
```

## Performance Considerations

- **Minimal Impact:** localStorage operations are synchronous but extremely fast
- **Lazy Loading:** Persisted values are only loaded during filter initialization
- **Efficient Storage:** Only filters with `persistState: true` use localStorage
- **No Network Calls:** All persistence is client-side

## Debugging

### Viewing Persisted Filters

To view all persisted filters in the browser console:

```javascript
Object.keys(localStorage)
  .filter(key => key.startsWith('filter_state_'))
  .forEach(key => {
    console.log(key, localStorage.getItem(key));
  });
```

### Debug Logging

The implementation includes comprehensive debug logging to help troubleshoot issues:

**Filter Persistence Utility:**
- `[Filter Persistence] Saved: {key} {value}` - When a value is saved
- `[Filter Persistence] Loaded: {key} {value}` - When a value is loaded
- `[Filter Persistence] No stored value for: {key}` - When no persisted value exists
- `[Filter Persistence] Using persisted value for {filterName}: {value}` - When persisted value is valid
- `[Filter Persistence] Persisted value invalid for {filterName}: {value}` - When validation fails

**Dropdown Component:**
- `[Dropdown {filterName}] Current selection: {array} persistState: {boolean}` - Current state
- `[Dropdown {filterName}] After filtering to visible: {array}` - After validation
- `[Dropdown {filterName}] Pruning invalid selections` - When invalid values are removed
- `[Dropdown {filterName}] All selections invalid, falling back to all` - When fallback triggers

These logs help identify exactly where in the initialization flow values are being set or overridden.

### Clearing Persisted State

To clear all persisted filter states:

```javascript
// From browser console
Object.keys(localStorage)
  .filter(key => key.startsWith('filter_state_'))
  .forEach(key => localStorage.removeItem(key));

// Or programmatically
import { clearAllFilterStates } from 'utils';
clearAllFilterStates();
```

### Testing Persistence

1. Enable persistence on a test filter
2. Change the filter value on one page
3. Navigate to another page with the same filter
4. Verify the filter restores the previous selection
5. Check browser DevTools > Application > Local Storage to see stored values

## Future Enhancements

Potential improvements that could be added:

1. **Expiration Policy:** Add automatic cleanup of old persisted values
2. **Version Control:** Store schema version to handle breaking changes
3. **User Preferences:** Allow users to toggle persistence on/off
4. **Cross-Session Analytics:** Track which filters users persist most
5. **Cloud Sync:** Sync filter preferences across devices (requires backend)

## Technical Notes

### Why filterName + paramName as Key?

Using both `filterName` and `paramName` ensures:
- **Uniqueness:** Prevents collisions between different filters
- **Clarity:** Easy to identify which filter a stored value belongs to
- **Flexibility:** Same paramName can be used in different contexts

### Why Not Use filterId?

Filter IDs are generated dynamically and can change between sessions or page loads, making them unsuitable for persistence keys.

## Troubleshooting

### Persisted Value Not Loading

**Possible Causes:**
1. Missing `persistState: true` in filter definition
2. Missing `filterName` or `paramName` in filter config
3. localStorage disabled in browser
4. Persisted value no longer valid for current filter options
5. Multiple initialization points overriding persisted values (check MapContext and MapLayout)

**Solution:** Check browser console for error messages and verify filter configuration. Look for logs showing:
- `[Filter Persistence] Loaded: ...` - confirms value was retrieved
- `[Filter Persistence] Using persisted value for ...` - confirms value is being used
- `[Dropdown FilterName] Current selection: ...` - shows what the component receives

### Values Persisting When They Shouldn't

**Possible Causes:**
1. Multiple filters sharing the same `filterName` + `paramName` combination
2. `persistState: true` set incorrectly
3. Typo in filter config (e.g., `mutltiSelect` instead of `multiSelect`)

**Solution:** Ensure unique filterName/paramName combinations and verify persistence is intentional. Check for typos in filter configurations.

## Related Files

- **Utility:** `vis-core/packages/vis-core/src/utils/filterPersistence.js`
- **Context:** `vis-core/packages/vis-core/src/contexts/FilterContext.jsx`
- **MapContext:** `vis-core/packages/vis-core/src/contexts/MapContext.jsx`
- **MapLayout:** `vis-core/packages/vis-core/src/Components/MapLayout/MapLayout.jsx`
- **Dropdown:** `vis-core/packages/vis-core/src/Components/Sidebar/Selectors/Dropdown.jsx`
- **Utils Index:** `vis-core/packages/vis-core/src/utils/index.js`

## Testing Checklist

- [x] Filter persists across page navigation
- [x] Invalid persisted values fall back to defaults
- [x] Multi-select filters handle partial validity correctly
- [x] Persistence works with different filter types (dropdown, toggle, slider)
- [x] localStorage errors are handled gracefully
- [x] Filter changes are saved immediately
- [x] Page refresh maintains persisted state
- [x] Clearing browser data removes persisted filters
- [x] `shouldInitialSelectAllInMultiSelect` doesn't override persisted state
- [x] MapContext initialization respects persisted values
- [x] Debug logging helps troubleshoot persistence issues

## Date range filters

`dateRange` filters persist their whole value (`[from, to]`, plus the extra toggle when configured). On restore, `getInitialFilterValue` clamps the persisted dates to the filter's current `min`/`max`. A persisted range that is malformed, or whose `from` ends up after `to`, is discarded in favour of the configured default. See [Date Range Selector](Date%20Range%20Selector.md).
