import { getMapApiToken } from './runtime'; 
export const mapStyles = {
  geoapifyPositron: () => `https://maps.geoapify.com/v1/styles/positron/style.json?apiKey=${getMapApiToken()}`,

  osMapsApiRaster: () => ({
    version: 8,
    glyphs: "https://orangemug.github.io/font-glyphs/glyphs/{fontstack}/{range}.pbf",
    sources: {
      "raster-tiles": {
        type: "raster",
        tiles: [
          `https://api.os.uk/maps/raster/v1/zxy/Light_3857/{z}/{x}/{y}.png?key=${getMapApiToken()}`,
        ],
        tileSize: 256,
      },
    },
    layers: [
      {
        id: "os-maps-zxy",
        type: "raster",
        source: "raster-tiles",
      },
    ],
  }),

  osVectorTileApiOpenGreyscale:
    "https://raw.githubusercontent.com/Transport-for-the-North/OS-Vector-Tile-API-Stylesheets/refs/heads/main/OS_VTS_3857_Open_Light.json",
};

export const getDefaultMapStyle = () => mapStyles.geoapifyPositron();
// Replace the direct export with a function
export const defaultMapStyle = getDefaultMapStyle;
export const defaultMapCentre = [-2.2, 54.2];
export const defaultMapZoom = 7.5;

export const CARD_CONSTANTS = {
  CARD_WIDTH: 300,
  TOGGLE_BUTTON_WIDTH: 40,
  TOGGLE_BUTTON_HEIGHT: 30,
  PADDING: 10,
}

export const brandTokens = {
  palette: {
    navy: '#0d0f3d',
    teal: '#00dec6',
    paleTeal: '#e4f6f6',
    white: '#ffffff',
    grey: '#c2c2d0',
    midGrey: '#efeff7',
    paleGrey: '#f7f7fb',
    bottomGrey: '#e5e7eb',
    textIcon: '#0d0f3d',
    // Status tones for warnings and errors; both meet 4.5:1 contrast on white.
    warning: '#b45309',
    danger: '#b42318',
  },
  radii: {
    xxs: '6px',
    xs: '8px',
    sm: '16px',
    lg: '20px',
    pillLg: '50px',
    pillSm: '25px',
  },
  fonts: {
    base: '"Korto", "Open Sans", "Segoe UI", Arial, sans-serif',
    nav: '"Open Sans", "Segoe UI", Arial, sans-serif',
  },
};

export const brandThemeDefaults = {
  primary: brandTokens.palette.navy,
  activeBg: brandTokens.palette.navy,
  activeNavColour: brandTokens.palette.navy,
  navText: brandTokens.palette.textIcon,
  activeNavText: brandTokens.palette.white,
  navbarBg: brandTokens.palette.white,
  standardFontFamily: brandTokens.fonts.base,
  navFontFamily: brandTokens.fonts.nav,
  borderRadius: brandTokens.radii.xs,
  colors: {
    primary: brandTokens.palette.navy,
    accent: brandTokens.palette.teal,
    text: brandTokens.palette.textIcon,
    textMuted: brandTokens.palette.grey,
    surface: brandTokens.palette.white,
    muted: brandTokens.palette.midGrey,
    border: brandTokens.palette.grey,
    navBorder: brandTokens.palette.bottomGrey,
    warning: brandTokens.palette.warning,
    danger: brandTokens.palette.danger,
  },
  mq: {
    mobile: '(max-width: 900px)',
    desktopUp: '(min-width: 901px)',
  },
};

export const mergeThemeWithBrandDefaults = (theme) => {
  if (!theme) return brandThemeDefaults;

  return {
    ...brandThemeDefaults,
    ...theme,
    colors: {
      ...brandThemeDefaults.colors,
      ...(theme.colors || {}),
    },
    mq: {
      ...brandThemeDefaults.mq,
      ...(theme.mq || {}),
    },
  };
};

export const defaultBgColour = brandTokens.palette.navy;

export const defaultMapColourMapper = {
  'diverging': { value: 'BrBG', label: 'BrBG' },
  'continuous': { value: 'YlGnBu', label: 'YlGnBu' },
  'categorical': { value: 'Accent', lable: 'Accent'}
}

export const REQUEST_CONFIG = {
  MAX_GET_REQUEST_SIZE: 8 * 1024, // 8KB
  ERROR_MESSAGES: {
    REQUEST_TOO_LARGE: (size) => 
      `Your filter selection creates a request that's too large (${(size / 1024).toFixed(2)}KB). Please reduce the number of selected items or use fewer filters.`
  }
};

// Default endpoint used to resolve `values.source: 'api'` filter options (TAME's metadata view).
// Apps can override it with `downloadMetadataPath` in page or app config.
export const DEFAULT_DOWNLOAD_METADATA_PATH = "/api/tame/mvdata";

// Default opacity used for map layers when not explicitly provided via config
export const DEFAULT_LAYER_OPACITY = 0.65;