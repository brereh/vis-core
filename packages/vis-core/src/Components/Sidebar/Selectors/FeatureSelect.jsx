import React, { useState, useEffect, useMemo } from 'react';
import Select, { components } from 'react-select';
import styled, { useTheme } from 'styled-components';
import { useLayerFeatureMetadata } from 'hooks/useLayerFeatureMetadata';
import { makeSelectStyles, selectComponents } from 'utils/selectStyles';
import { useDockedSelectOptions } from "./useDockedSelectOptions";

// Styled components
const Container = styled.div`
  margin-bottom: 10px;
`;

// Custom ValueContainer to display count of selected features
export const CustomValueContainer = ({ children, ...props }) => {
  const MAX_DISPLAY_COUNT = 100;
  const { getValue } = props;
  const selectedValues = getValue();

  let displayValue = children;

  if (selectedValues.length > MAX_DISPLAY_COUNT) {
    displayValue = `${selectedValues.length} features selected`;
  }

  return (
    <components.ValueContainer {...props}>
      {displayValue}
    </components.ValueContainer>
  );
};

/**
 * FeatureSelect component provides a dropdown to select features from a map layer.
 *
 * @component
 * @param {Object} props - The component props.
 * @param {string} props.layerPath - The path to fetch feature metadata.
 * @param {Array} props.value - The selected feature values.
 * @param {Function} props.onChange - Function to call when the selected features change.
 * @param {boolean} props.isMulti - Whether multiple selections are allowed.
 * @param {string} props.placeholder - Placeholder text for the select input.
 * @param {boolean} props.isClearable - Whether the select input can be cleared.
 * @returns {JSX.Element} The rendered FeatureSelect component.
 */
export const FeatureSelect = ({ layerPath, value, onChange, isMulti = false, placeholder, isClearable = false }) => {
  const theme = useTheme();
  const dockedSelectOptions = useDockedSelectOptions();
  const selectStyles = useMemo(() => {
    const base = makeSelectStyles(theme, dockedSelectOptions);
    return {
      ...base,
      valueContainer: (provided) => ({
        ...base.valueContainer(provided),
        maxHeight: '10rem',
        overflowY: 'auto',
      }),
      menuList: (provided) => ({
        ...provided,
        maxHeight: '10rem',
        overflowY: 'auto',
      }),
      clearIndicator: (provided) => ({
        ...provided,
        alignSelf: 'flex-start',
      }),
    };
  }, [theme, dockedSelectOptions]);

  const { options, isLoading, handleInputChange, handleMenuOpen, handleMenuScrollToBottom } = useLayerFeatureMetadata(layerPath);
  const [noOptionsMessage, setNoOptionsMessage] = useState('No features found');

  useEffect(() => {
    let timer;
    if (isLoading) {
      setNoOptionsMessage('Searching...');
    } else {
      timer = setTimeout(() => {
        setNoOptionsMessage('No features found');
      }, 300);
    }

    return () => clearTimeout(timer);
  }, [isLoading]);

  return (
    <Container>
      <Select
        isMulti={isMulti}
        isClearable={isClearable}
        options={options}
        value={value}
        onChange={onChange}
        onInputChange={handleInputChange}
        placeholder={placeholder}
        isLoading={isLoading}
        noOptionsMessage={() => noOptionsMessage}
        onMenuOpen={handleMenuOpen}
        components={{ ...selectComponents, ValueContainer: CustomValueContainer }}
        styles={selectStyles}
        menuPortalTarget={document.body}
        menuPosition="fixed"
        onMenuScrollToBottom={handleMenuScrollToBottom}
      />
    </Container>
  );
};