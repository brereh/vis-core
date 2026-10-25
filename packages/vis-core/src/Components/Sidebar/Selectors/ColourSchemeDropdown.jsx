import React, { useEffect, useState, useMemo } from 'react';
import chroma from "chroma-js";
import Select from "react-select";
import makeAnimated from "react-select/animated";
import { useMapContext } from "hooks/useMapContext";
import { useTheme } from "styled-components";
import { colorSchemes, colourBlindFriendlySchemes } from "utils";
import { SelectorLabel } from "./SelectorLabel";
import { makeSelectStyles } from "utils/selectStyles";
import { useDockedSelectOptions } from "./useDockedSelectOptions";

/**
 * Dropdown component for selecting color schemes.
 * @property {string} colorStyle - The selected color style.
 * @property {Function} handleColorChange - Function to handle color change.
 * @property {string} layerName - The name of the layer.
 * @returns {JSX.Element} The ColourSchemeDropdown component.
 */
export const ColourSchemeDropdown = ({
  colorStyle,
  handleColorChange,
  layerName,
}) => {
  const theme = useTheme();
  const dockedSelectOptions = useDockedSelectOptions();
  const animatedComponents = makeAnimated();
  const { state } = useMapContext();

  // Retrieve the color scheme for the specific layer
  const layerColorScheme = state?.colorSchemesByLayer?.[layerName];

  /**
   * Custom formatting for option label to include color swatches.
   * The label occupies 30% and the swatches occupy 70%.
   * @property {string} value - The value of the option.
   * @property {string} label - The label of the option.
   * @returns {JSX.Element} The formatted option label.
   */
  const formatOptionLabel = ({ value, label }) => {
  const colors = chroma.brewer[value];
  const isColourBlindFriendly = colourBlindFriendlySchemes.has(value);

  return (
    <div style={{ display: "flex", alignItems: "center", width: "100%" }}>
      {/* Label + flag */}
      <div style={{ width: "30%", paddingRight: "10px", display: "flex", alignItems: "center", gap: 6 }}>
        <span>{label}</span>
        {isColourBlindFriendly && (
          <span
            title="Colour-blind friendly"
            aria-label="Colour-blind friendly"
            style={{ fontSize: "0.9em" }}
          >
            👁️
          </span>
        )}
      </div>

      {/* Swatches */}
      <div style={{ width: "70%", display: "flex" }}>
        {colors.map((color) => (
          <div
            key={color}
            style={{
              backgroundColor: color,
              width: `${100 / colors.length}%`,
              height: "20px",
            }}
          />
        ))}
      </div>
    </div>
  );
  };

  const options = useMemo(
    () =>
      colorSchemes[colorStyle].map((scheme) => ({
        value: scheme,
        label: scheme,
      })),
    [colorStyle]
  );

  // State to keep track of the selected option
  const [selectedOption, setSelectedOption] = useState(null);

  // Update selected option when layerColorScheme changes
  useEffect(() => {
    if (layerColorScheme) {
      const matchingOption = options.find(
        (option) => option.value === layerColorScheme.value
      );
      setSelectedOption(matchingOption || options[0]);
    }
  }, [layerColorScheme, options]);

  return (
    <>
      <SelectorLabel text="Colour scheme" />
      <Select
        id={"colors-" + layerName}
        components={animatedComponents}
        options={options}
        value={selectedOption}
        formatOptionLabel={formatOptionLabel}
        styles={useMemo(() => {
          const base = makeSelectStyles(theme, dockedSelectOptions);
          return {
            ...base,
            option: (provided, state) => ({
              ...base.option(provided, state),
              borderBottom: '1px solid #eee',
              padding: '5px 10px',
            }),
            singleValue: (provided) => ({
              ...provided,
              display: 'flex',
              alignItems: 'center',
            }),
          };
        // eslint-disable-next-line react-hooks/exhaustive-deps
        }, [theme, dockedSelectOptions])}
        menuPlacement="auto"
        menuPortalTarget={document.body} // Use a portal to render the menu
        onChange={(selectedOption) => handleColorChange(selectedOption, layerName)}
      />
      {/* Legend */}
        <div
          style={{
            marginTop: "6px",
            fontSize: "12px",
            color: "#666",
            display: "flex",
            alignItems: "center",
            gap: "8px",
          }}
        >
          <span
            aria-hidden="true"
            style={{ fontSize: "16px", lineHeight: 1 }}
          >
            👁️
          </span>
          <span> = Colour‑blind friendly</span>
        </div>
    </>
  );
};