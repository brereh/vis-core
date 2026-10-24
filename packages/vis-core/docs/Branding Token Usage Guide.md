# Branding Token Usage Guide

## Purpose
Use this guide when building new components/features so all apps in vis-core follow the same branding system and avoid hardcoded values.

## Source of Truth
- Core tokens: `src/defaults.js` (`brandTokens`, `brandThemeDefaults`, `mergeThemeWithBrandDefaults`)
- Global CSS variables and brand fonts: `src/Components/BaseApp/BaseApp.jsx` (`BrandGlobalStyles`)

## Non-Negotiable Rules
1. Never hardcode brand colors in components.
2. Never hardcode brand fonts in components.
3. Prefer token-backed theme values first, CSS variables second.
4. If a reusable value is missing (for example spacing), add a token in `src/defaults.js` instead of duplicating literals across files.

## Key Terms
- Override-friendly: values read from `theme` (for example `theme.colors.primary`, `theme.colors.text`). When an app supplies a different theme, these values update automatically.
- Static fallback: values read from CSS variables in global styles (for example `var(--palette-navy)`, `var(--text-icon)`). These stay fixed unless the app explicitly overrides the CSS variable.
- Theme token: a value from the styled-components theme object (`theme.colors.*`, `theme.borderRadius`, `theme.standardFontFamily`).
- CSS variable path: plain CSS route that uses `var(--...)` values from global styles. Use this when theme access is not available.
- Legacy CSS path: existing plain CSS files/components that cannot directly consume the theme object and therefore use CSS variables.

## Token Map
### Colors
Use from `theme.colors.*`, `theme.*`, or CSS vars:
- Primary/navy (override-friendly): `theme.colors.primary`
- Primary/navy fallback (static/legacy CSS): `var(--palette-navy)`
- Accent/teal (override-friendly): `theme.colors.accent`
- Accent/teal fallback (static/legacy CSS): `var(--palette-teal)`
- Text (override-friendly): `theme.colors.text`
- Text fallback (static/legacy CSS): `var(--text-icon)`
- Muted text (override-friendly): `theme.colors.textMuted`
- Muted text fallback (static/legacy CSS): `var(--palette-grey)`
- Surface (override-friendly): `theme.colors.surface`
- Surface fallback (static/legacy CSS): `var(--palette-white)`
- Muted surface (override-friendly): `theme.colors.muted`
- Muted surface fallback (static/legacy CSS): `var(--palette-mid-grey)`
- Border (override-friendly): `theme.colors.border`
- Border fallback (static/legacy CSS): `var(--palette-grey)`
- Nav border (override-friendly): `theme.colors.navBorder`
- Nav border fallback (static/legacy CSS): `var(--palette-bottom-grey)`
- Warning (override-friendly): `theme.colors.warning` (used by chart gaps and warning bands)
- Warning fallback: `brandTokens.palette.warning`
- Danger/error tone (override-friendly): `theme.colors.danger` (used by heatmap missing cells and error markers)
- Danger fallback: `brandTokens.palette.danger`

### Typography
- Base copy: `theme.standardFontFamily` / `var(--font-family-base)`
- Sans/body: `var(--font-sans)`
- Headings: `Korto` via global styles in `BaseApp`

### Radius
- `theme.borderRadius`
- CSS vars: `--radius-xxs`, `--radius-xs`, `--radius-sm`, `--radius-lg`, `--radius-pill-lg`, `--radius-pill-sm`

### Override Compatibility Note
- If an app overrides theme colors, `theme.colors.*` reflects those overrides automatically (including navy via `theme.colors.primary`).
- In current vis-core setup, CSS vars in `BaseApp` (for example `--palette-navy`, `--palette-teal`, `--text-icon`) are initialized from `brandTokens` and do not automatically follow `theme.colors.*`.
- CSS vars should be treated as fallback/static defaults for plain CSS unless explicitly overridden by the app.
- Protocol: use `theme.colors.*` in styled-components whenever possible; use CSS vars only where theme access is not available.

## Implementation Pattern
### Styled-components (preferred)
```jsx
const Card = styled.section`
  background: ${({ theme }) => theme.colors.surface};
  color: ${({ theme }) => theme.colors.text};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius};
  font-family: ${({ theme }) => theme.standardFontFamily};
`;
```

### CSS Modules/Plain CSS
```css
.feature-card {
  background: var(--palette-white);
  color: var(--text-icon);
  border: 1px solid var(--palette-grey);
  border-radius: var(--radius-xs);
  font-family: var(--font-family-base);
}
```

## Avoid This
```jsx
// Do not do this
color: #7317de;
font-family: Arial;
border-radius: 6px;
```

## Component Checklist (Before PR)
- No hardcoded brand hex values in new/updated files.
- No hardcoded font-family values for branded UI.
- Radius values come from theme/token variables.
- Hover/focus/active states also use tokens.
- Any new shared visual value was added centrally (if reused).

## App Config Protocol
App config may override app-level colors (for example page-specific backgrounds), but component defaults must still come from vis-core tokens.

Priority order in components:
1. Explicit app-config value for page-specific behavior.
2. Theme token (`theme.colors.*`, `theme.*`).
3. vis-core default token fallback.

## Spacing Protocol
Current central spacing tokens are limited. Until a spacing token set is introduced:
1. Reuse existing spacing from nearby components where possible.
2. If the same spacing repeats across features, add tokenized spacing in `src/defaults.js` and expose as CSS vars in `BaseApp`.
3. Avoid random one-off spacing literals spread across multiple files.

## Recommended Follow-up
Create a small spacing scale in `brandTokens` (for example `xs/sm/md/lg`) and expose CSS vars in `BrandGlobalStyles` so future work can remove scattered spacing literals.