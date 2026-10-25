import styled from "styled-components";
import { SelectorLabel } from "./SelectorLabel";
import { useMemo } from "react";
import Select from "react-select";
import makeAnimated from "react-select/animated";
import { useTheme } from "styled-components";
import { makeSelectStyles } from "utils/selectStyles";
import { useDockedSelectOptions } from "./useDockedSelectOptions";

const StyledDropdown = styled.select`
  width: 100%;
  padding: 8px;
  margin-bottom: 10px;
`;

/**
 * Dropdown component for selecting options.
 * @property {Object} filter - The filter object containing values.
 * @property {Array} filter.values - An array of values for the dropdown.
 * @property {string} filter.values[].displayValue - The display value of the option.
 * @property {string} filter.values[].paramValue - The parameter value of the option.
 * @property {Function} onChange - The function called when a new option is selected.
 * @returns {JSX.Element} The Dropdown component.
 */
export const ClassificationDropdown = ({
  classType,
  onChange,
  classification,
}) => {
  const theme = useTheme();
  const dockedSelectOptions = useDockedSelectOptions();
  const selectStyles = useMemo(() => makeSelectStyles(theme, dockedSelectOptions), [theme, dockedSelectOptions]);
  const animatedComponents = makeAnimated();
  const options = useMemo(
    () =>
      Object.keys(classType).map((scheme) => ({
        value: classType[scheme],
        label: scheme,
      })),
    [classType]
  );

  return (
    <div style={{ marginTop: "10px" }}>
      <SelectorLabel
        text="Classification method"
        info={"Select classification method for map data"}
      />
      <Select
        components={animatedComponents}
        options={options}
        value={
          options.find((e) => e.value === classification) || options[0]
        }
        styles={selectStyles}
        menuPlacement="auto"
        menuPortalTarget={document.body}
        onChange={classification => onChange(classification.value)}
      />
    </div>
  );
};
