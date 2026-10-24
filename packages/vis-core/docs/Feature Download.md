# Feature download

A download button for one feature's data, for example a site's CSV from its callout card or detail page. It downloads with the current filters, carries the user's Bearer token, and is hidden from users whose role cannot download.

## Callout card config

Add `download` to a `calloutCard` visualisation:

```js
{
  name: "Site summary",
  type: "calloutCard",
  dataPath: "/api/counts/atc/sites/{id}/summary",
  // ...
  download: {
    path: "/api/download/counts/atc/sites/{id}", // required
    includeFilters: true,                        // default true
    label: "Site CSV",                           // default "Download CSV"
    requiredRoles: ["{app}_admin", "{app}_user"],// optional
    method: "GET",                               // "GET" (default) or "POST"
    queryParams: { format: "csv" },              // optional fixed params
  },
}
```

| Option | Behaviour |
| --- | --- |
| `path` | API path. Each `{name}` placeholder is filled, URL-encoded, from the selected feature: the card's path params (such as `id`), then the card data (including `mainValues`), then the card's query params. If a placeholder has no value, the button is disabled and its tooltip names the missing value. |
| `includeFilters` | Appends the card's current query params (the filter values the card was fetched with) to the request. Empty values are dropped. For `POST`, the params go in the JSON body. |
| `label` | Button text. |
| `requiredRoles` | Roles allowed to download. `{app}` is replaced by the lower-cased app name (`VITE_APP_NAME`). Matching is case-insensitive and reads the roles claim from the signed-in user's token. The button is hidden when the user holds none of them, including when signed out. Leave it out to show the button to everyone. Cross-app roles such as `all_admin` are not implied; list them if they should download. |
| `method` | HTTP method. |
| `queryParams` | Fixed params sent with every download. Filter values win on a clash. |

Hiding the button is a convenience, not access control: the API must still check download permission for each request.

## Behaviour

- The request goes through `api.downloadService.downloadFile`, so it sends `Authorization: Bearer <token>` and is checked against the GET size limit.
- The file is named from the response's `Content-Disposition` header (`filename*=UTF-8''…` is preferred over `filename=`). Without one, the existing type-based default applies (`downloads.csv` and so on).
- While the download runs, the button reads "Downloading…", is disabled and has `aria-busy="true"`.
- On success, an info toast names the file. On failure, an error toast explains why. A `403` reads "Download not permitted: you do not have permission to download this data." followed by the API's `detail`, `message` or `title` if it sent one.

`downloadFile` now resolves with `{ filename }`, and its errors carry `status` and `detail`. The error message is unchanged.

## Custom pages

`FeatureDownloadButton` is exported from `Components` for detail views and custom pages:

```jsx
import { FeatureDownloadButton } from "@transport-for-the-north/vis-core/Components";

<FeatureDownloadButton
  download={{ path: "/api/download/counts/atc/sites/{id}", label: "Site CSV", requiredRoles: ["{app}_user"] }}
  values={{ id: siteId }}
  filters={{ time_period: "24h", day_type: "neutral" }}
/>
```

| Prop | Purpose |
| --- | --- |
| `download` | The config above. |
| `values` | Values for path placeholders. |
| `filters` | Current filter params, keyed by API param name. |
| `appName` | App name for `{app}`. Defaults to `VITE_APP_NAME`. |
| `color` | Optional colour override; otherwise `theme.colors.primary`. |

Toasts need the `ToastProvider` that `BaseApp` already provides. Without it, the download still works with no toasts.

## Download metadata path

The sidebar download section and the map filters resolve `values.source: "api"` filter options by posting `{ dataPath }` to a metadata endpoint. It was fixed at TAME's `/api/tame/mvdata`. Set `downloadMetadataPath` in the page config, or in the app config for every page, to use another endpoint. Page config wins over app config, and the default is still `/api/tame/mvdata`, so TAME apps behave as before.
