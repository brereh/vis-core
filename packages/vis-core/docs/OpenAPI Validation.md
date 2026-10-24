# OpenAPI (Swagger) parameter validation

This document explains the OpenAPI/Swagger parameter validation included in **vis-core**. It is designed to catch configuration mistakes early (especially missing `paramName` coverage for API parameters) when an application starts.

## What problem this solves

Pages typically define:

- Filters (each with a `paramName`)
- Visualisations that call API routes (`dataPath`)
- Optional download endpoints (`downloadPath`)

If an endpoint requires parameters (query or path parameters) and the page does not provide them (via filters, defaults, or hard-coded values), the visualisation may never fetch, may error, or may behave inconsistently.

This validation checks your app configuration against the OpenAPI schema you already fetch and logs issues in the browser console.

## Where it runs

The validation runs **once per page load** when the vis-core `Navbar` component mounts.

- It only runs when `appContext.apiSchema` is present.
- It only runs when `appContext.appPages` is a non-empty array.
- It performs **no network calls** (it uses the already-loaded OpenAPI schema).
- It does **not** block the app. It only logs to the console.

If an application does not render `Navbar`, you can still run the check manually by calling `validateAppConfigAgainstOpenApi(appConfig, apiSchema)`.

## What it checks

For every page in `appConfig.appPages`, the validator inspects:

1. Page filters: `page.config.filters` (and download filters, if present)
2. Visualisation endpoints: `page.config.visualisations[*].dataPath`
3. Download endpoint: `page.config.additionalFeatures.download.downloadPath` (if present)

For each endpoint, it checks the OpenAPI schema for that route and ensures every required parameter has a source.

## What counts as “covered” for a required parameter

A required OpenAPI parameter is considered satisfied if **any** of the following are true:

- A page filter exists with `filter.paramName === <parameter name>`
- A multi-parameter filter sets it: each entry of an array `paramName`, and `extraToggle.paramName`, counts (see [Date Range Selector](Date%20Range%20Selector.md))
- The OpenAPI parameter has a default in the schema (e.g. `schema.default`)
- The parameter is hard-coded in the configured URL (e.g. `/api/foo?dataset_id=123`)
- The parameter is excluded by design (tile placeholders `x`, `y`, `z` are excluded by default)

## Required parameters: how “required” is interpreted

The validator mirrors the existing `MapContext` behaviour:

- **Path parameters** are treated as required (as per the OpenAPI spec).
- **Query parameters** are required when OpenAPI marks them `required: true`.
- If an operation defines **no required parameters at all**, the framework treats **all** params as required. The validator mirrors that behaviour.

This means the validation results should match what the runtime expects.

## Output: what you’ll see in the console

When issues exist, vis-core prints a collapsed console group:

`[vis-core] OpenAPI validation: <n> error(s), <m> warning(s)`

Then:

- Warnings are logged via `console.warn(...)`
- Errors are logged via `console.error(...)`

When there are **no** errors or warnings, vis-core logs a single info message:

`[vis-core] OpenAPI validation complete (no issues)`

### Warning: missing schema path

**Type:** `missing_schema_path`

This means the configured route was not found in `apiSchema.paths`.

Common causes:

- The configured `dataPath` / `downloadPath` does not exactly match the OpenAPI path key.
- The API route exists but uses a different prefix.
- You are pointing at a Swagger file that is out of date.

### Error: missing `paramName`

**Type:** `missing_paramName`

This means the OpenAPI schema says the endpoint needs a required parameter, but the page has no filter providing it (and there is no default / hard-coded value).

Common fixes:

- Add a filter to `page.config.filters` with `paramName` matching the OpenAPI parameter name.
- Ensure the filter has the correct actions to update query params.
- If the parameter is meant to be fixed, hard-code it in the configured URL.
- If the parameter is genuinely optional, update the OpenAPI schema so it is not marked required.

## How to fix a typical missing-`paramName` error

If you see an error for a required query param (for example `timePeriod`):

1. Check the endpoint’s OpenAPI definition.
2. Find the parameter name under `parameters`.
3. Add or update a filter so it includes `paramName: "timePeriod"`.
4. Ensure the page includes that selector in `page.config.filters` (or download filters where relevant).

## API / usage (manual)

The utility is exported from `vis-core/utils`.

- `validateAppConfigAgainstOpenApi(appConfig, apiSchema, options?)`

Options:

- `excludedParams: string[]` – override the default excluded params (defaults to `['x','y','z']`).

Return value:

- `{ errors: Array, warnings: Array }`

Each item contains useful context such as:

- `pageName`
- `route`
- `location` (`query` or `path`, for missing-`paramName` errors)
- `paramName` (for missing-`paramName` errors)
- `kind` (`visualisation` or `download`)

## Performance notes

The validation is intentionally lightweight:

- Complexity is roughly proportional to the number of pages × endpoints × parameters.
- It runs once per app load.
- It does not fetch anything; it reuses the already fetched OpenAPI schema.

In practice, this should have negligible impact compared with normal app initialisation work (rendering, loading map libraries, etc.).

## Implementation locations (for maintainers)

- Utility: `src/utils/openApiValidation.js`
- Export: `src/utils/index.js`
- Runner (one-shot on boot): `src/Components/Navbar/Navbar.jsx`