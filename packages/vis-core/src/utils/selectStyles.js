import React, { useMemo } from "react";
import { useTheme } from "styled-components";
import { components } from "react-select";

/**
 * Shared react-select component overrides.
 * Adds native browser tooltip support for truncated multi-value chips.
 */
export const selectComponents = {
  MultiValueLabel: (props) => {
    const label =
      typeof props.data?.label === "string"
        ? props.data.label
        : typeof props.children === "string"
          ? props.children
          : "";

    return React.createElement(components.MultiValueLabel, {
      ...props,
      innerProps: {
        ...props.innerProps,
        title: label,
      },
    });
  },
};

/**
 * makeSelectStyles
 * Returns a react-select styles object using the app theme (ThemeProvider).
 * Intended for regular dropdowns (e.g., top filter bar).
 *
 * @param {object} theme - Theme object from styled-components (ThemeProvider).
 * @param {object} [opts] - Optional overrides.
 * @param {number} [opts.minHeight=28] - Control min height of the select.
 * @param {string} [opts.fontSize='0.85rem'] - Base font size.
 * @param {string} [opts.borderColor='#ddd'] - Default control border color.
 * @param {number} [opts.zIndex=9999] - z-index for menuPortal.
 * @param {boolean} [opts.wrapValues=false] - Wrap long selected values instead of truncating them.
 * @returns {Record<string, Function>} react-select styles object.
 */
export function makeSelectStyles(theme, opts = {}) {
  const {
    minHeight = 28,
    fontSize = "0.85rem",
    borderColor,
    zIndex = 9999,
    wrapValues = false,
  } = opts;
  // Narrow columns: let selected values wrap onto more lines instead of being cut off.
  const wrap = wrapValues
    ? { whiteSpace: "normal", overflow: "visible", textOverflow: "clip", overflowWrap: "anywhere" }
    : {};
  const isLegacyFont = (font) =>
    typeof font === "string" && font.includes("Hanken Grotesk");

  const fontFamily =
    (theme?.standardFontFamily && !isLegacyFont(theme.standardFontFamily)
      ? theme.standardFontFamily
      : null) || "var(--font-family-base)";
  const textColor = theme?.colors?.text || "var(--text-icon)";
  // Prioritize brand theme primary color, avoiding legacy activeBg purple (#7317de)
  const primaryColor =
    theme?.colors?.primary ||
    (theme?.primary && theme.primary !== "#7317de" && theme.primary !== "#7317DE" ? theme.primary : null) ||
    "var(--palette-navy, #0d0f3d)";
  const defaultBorder = borderColor || theme?.colors?.border || "var(--palette-grey, #d1d5db)";

  return {
    menuPortal: (base) => ({ ...base, zIndex }),
    control: (base, state) => ({
      ...base,
      fontFamily,
      color: textColor,
      minHeight,
      borderRadius: theme?.borderRadius || "4px",
      borderColor: state.isFocused ? primaryColor : defaultBorder,
      boxShadow: state.isFocused ? `0 0 0 1px ${primaryColor}` : "none",
      position: "relative",
      zIndex: state.isFocused ? 3 : 1,
      "&:hover": {
        borderColor: primaryColor,
        zIndex: 2,
      },
      textAlign: "left",
    }),
    valueContainer: (base) => ({
      ...base,
      fontFamily,
      color: textColor,
      padding: "2px 6px",
      fontSize,
      textAlign: "left",
    }),
    indicatorsContainer: (base) => ({
      ...base,
      padding: "2px 4px",
    }),
    input: (base) => ({
      ...base,
      fontFamily,
      color: textColor,
      fontSize,
      margin: 0,
      padding: 0,
    }),
    singleValue: (base) => ({
      ...base,
      fontFamily,
      color: textColor,
      fontSize,
      ...wrap,
    }),
    placeholder: (base) => ({
      ...base,
      fontFamily,
      color: textColor,
      fontSize,
    }),
    multiValue: (base) => ({
      ...base,
      fontFamily,
      ...(wrapValues && { maxWidth: "100%" }),
    }),
    multiValueLabel: (base) => ({
      ...base,
      fontFamily,
      ...wrap,
    }),
    menu: (base) => ({
      ...base,
      fontFamily,
    }),
    menuList: (base) => ({
      ...base,
      fontFamily,
    }),
    option: (styles, { isFocused, isSelected }) => ({
      ...styles,
      fontFamily,
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      padding: "10px",
      fontSize,
      backgroundColor: isSelected
        ? primaryColor
        : isFocused
        ? (theme?.colors?.muted || "var(--palette-mid-grey, #f0f0f7)")
        : (theme?.colors?.surface || "var(--palette-white, #ffffff)"),
      color: isSelected ? "var(--palette-white, #ffffff)" : textColor,
      cursor: "pointer",
      ":active": {
        ...styles[":active"],
        backgroundColor: primaryColor,
        color: "var(--palette-white, #ffffff)",
      },
    }),
  };
}

/**
 * useCompactSelectStyles
 * Hook returning compact styles for react-select (ideal for table-head filters).
 * Uses ThemeProvider’s theme via useTheme().
 *
 * @param {object} [opts] - Optional overrides.
 * @param {number} [opts.minHeight=24] - Compact control height.
 * @param {string} [opts.fontSize='0.8rem'] - Compact font size.
 * @param {string} [opts.borderColor='#ddd'] - Control border color.
 * @param {number} [opts.zIndex=9999] - z-index for menuPortal.
 * @returns {Record<string, Function>} react-select styles object.
 */
export function useCompactSelectStyles(opts = {}) {
  const theme = useTheme();

  return useMemo(() => {
    const base = makeSelectStyles(theme, {
      minHeight: opts.minHeight ?? 24,
      fontSize: opts.fontSize ?? "0.8rem",
      borderColor: opts.borderColor ?? theme?.colors?.border ?? "#d1d5db",
      zIndex: opts.zIndex ?? 9999,
    });

    return {
      ...base,
      control: (controlBase, state) => ({
        ...base.control(controlBase, state),
        paddingLeft: 0,
      }),
      valueContainer: (vcBase) => ({
        ...base.valueContainer(vcBase),
        padding: 0,
        overflow: "hidden",
        minWidth: 0,
      }),
      indicatorsContainer: (indBase) => ({
        ...base.indicatorsContainer(indBase),
        padding: "0 2px",
        gap: 2,
      }),
      input: (inBase) => ({
        ...base.input(inBase),
        margin: 0,
        padding: 0,
      }),
    };
  }, [theme, opts.minHeight, opts.fontSize, opts.borderColor, opts.zIndex]);
}