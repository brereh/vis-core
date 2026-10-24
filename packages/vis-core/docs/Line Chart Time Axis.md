# Line chart time axis, gaps and bands

`ChartRenderer`'s `line` and `multiple_line` chart types accept optional config for time-based data: a true time axis, breaks where data is missing, shaded bands and hatched gaps. Every option is optional. A config without them renders exactly as before.

## Options

| Option | Applies to | Default | Behaviour |
| --- | --- | --- | --- |
| `xAxis.type` | both | category axis | `"time"` places points by time instead of by index. |
| `xAxis.format` | both | `"HH:mm"` (or `"DD/MM HH:mm"` for spans over a day) | Tick label format. Tokens: `YYYY`, `MM`, `DD`, `HH`, `mm`, `ss`. |
| `xAxis.tickInterval` | both | chosen to give about 8 ticks | Tick spacing, for example `"15m"`, `"1h"`, `"3h"`, `"1d"`. Ticks are aligned to midnight. |
| `xAxis.domain` | both | data extent | `[from, to]` in the same form as the x values, for example `["00:00", "24:00"]`. |
| `xAxis.tooltipFormat` | both | `"HH:mm"` for clock times, `"DD/MM/YYYY HH:mm"` for datetimes | Format of the time shown in the tooltip and the hidden range list. |
| `xAxis.utc` | both | `false` | Read ISO datetimes in UTC rather than the browser's local time. Clock times are always treated as offsets from midnight. |
| `xKey` | both | `"time"` for `line` on a time axis; `"label"` for `multiple_line` | Field holding the x value. `line` falls back to `label`, then `year`. |
| `connectNulls` | both | `false` for `line`, `true` for `multiple_line` (unchanged) | When `false`, a `null` value breaks the line. Missing values are never drawn as zero. |
| `bands` | both | none | `[{ from, to, label, tone }]`. Shaded areas behind the lines, labelled above the plot. `tone` is `accent`, `muted` or `warning`. |
| `gaps` | both | none | `[{ from, to, label }]`. Hatched areas marking missing data, labelled above the plot, using the `warning` token. |
| `columns[].colour` / `series[].colour` | `multiple_line` | palette | Series colour: a theme token name (`primary`, `accent`, `warning`, …), a brand palette name (`navy`, `teal`, …) or any CSS colour. `series` is an alias for `columns`. `color` still works. |
| `series[0].colour`, `series[1].colour` | `line` | brand primary, grey | Primary and comparator line colours. `lineColor` and `comparatorColor` still work and take precedence. |

X values on a time axis can be `"HH:mm"` or `"HH:mm:ss"` strings (`"24:00"` is allowed), ISO dates or datetimes, epoch milliseconds or `Date` objects. Rows whose x value cannot be parsed are left out. On a category axis, `bands` and `gaps` use the category values directly, for example `{ from: "2028", to: "2030" }`.

## Example: 15-minute traffic profile

```js
{
  type: "multiple_line",
  title: "15-minute profile, neutral weekday average",
  y_axis_title: "Vehicles per 15 minutes",
  height: 300,
  xKey: "label",
  columns: [
    { key: "westbound", label: "Westbound", colour: "primary" },
    { key: "eastbound", label: "Eastbound", colour: "#00857a" },
  ],
  xAxis: { type: "time", format: "HH:mm", tickInterval: "3h", domain: ["00:00", "24:00"] },
  connectNulls: false,
  bands: [
    { from: "08:00", to: "09:00", label: "AM peak", tone: "accent" },
    { from: "17:00", to: "18:00", label: "PM peak", tone: "accent" },
  ],
  gaps: [{ from: "10:00", to: "14:00", label: "Counter fault" }],
}
```

With data such as:

```js
[
  { label: "00:00", westbound: 12, eastbound: 10 },
  { label: "00:15", westbound: 11, eastbound: null }, // breaks the eastbound line
  // ...
]
```

## Theme tokens

- Band fills use `theme.colors.accent`, `theme.colors.muted` or `theme.colors.warning`, at reduced opacity.
- Band labels use `theme.colors.text`. Gap hatching, outlines and labels use `theme.colors.warning`.
- `warning` is a new token (`brandTokens.palette.warning`, `#b45309`). It has a contrast ratio of about 5:1 against white.
- The brand accent teal is light. Use it for bands, not for a line on a white background, where it falls below the 3:1 contrast that graphical objects need.

## Accessibility

- When any of these options are used, the chart region takes its accessible name from `config.title` (or `config.ariaLabel` if set). Charts without them keep the existing generic name.
- Bands and gaps are listed in a visually hidden list ("Highlighted ranges") that the chart region references with `aria-describedby`, for example "Shaded band: AM peak, 08:00 to 09:00" and "Missing data: Counter fault, 10:00 to 14:00".
- When bands or gaps have labels, the legend moves below the chart so the labels have room above the plot.
