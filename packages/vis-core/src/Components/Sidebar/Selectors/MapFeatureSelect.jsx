import React, { useEffect, useState, useRef, useCallback } from 'react';
import { resolveFilterPanes } from "../../../map/resolveFilterPanes";
import { selectDrawPaneId, selectMapGrid, selectPaneMap } from "../../../reducers/mapSelectors";
import styled from 'styled-components';
import { FaMousePointer, FaDrawPolygon } from 'react-icons/fa';
import { useMapContext } from "hooks/useMapContext";
import { useFeatureSelect } from "hooks/useFeatureSelect";
import { FeatureSelect } from './FeatureSelect'; 
import { darken } from "polished";
import { isEqual } from 'lodash';

// Styled components
const Container = styled.div`
  margin-bottom: 10px;
`;

const SelectionModeContainer = styled.div`
  margin-top: 10px;
  display: flex;
  align-items: center;
`;

const StyledToggle = styled.div`
  display: flex;
  border: 1px solid ${(props) => (props.enabled ? 'black' : '#ccc')};
  border-radius: 5px;
  flex-grow: 1;
`;

const ModeButton = styled.button`
  cursor: pointer;
  padding: 5px 2px;
  background-color: ${(props) => (props.selected ? props.$bgColor : 'white')};
  color: ${(props) => (props.selected ? 'white' : 'black')};
  border: none;
  border-radius: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: var(--font-family-base);
  width: 50%;
  opacity: ${(props) => (props.disabled ? 0.5 : 1)};
  pointer-events: ${(props) => (props.disabled ? 'none' : 'auto')};

  &:hover {
    background-color: ${(props) => (props.selected ? darken(0.1, props.$bgColor) : 'white')};
    color: ${(props) => (props.selected ? 'white' : 'black')};
  }

  svg {
    margin-right: 5px;
  }

  &:first-child {
    border-radius: 5px 0 0 5px;
  }

  &:last-child {
    border-radius: 0 5px 5px 0;
  }
`;

const EnableSelectButton = styled.button`
  cursor: pointer;
  padding: 5px 10px;
  background-color: ${(props) => (props.enabled ? props.$bgColor : 'white')};
  color: ${(props) => (props.enabled ? 'white' : 'black')};
  border: 1px solid ${(props) => (props.enabled ? 'black' : '#ccc')};
  border-radius: 4px;
  margin-right: 10px;
  font-family: var(--font-family-base);

  &:hover {
    background-color: ${(props) => (props.enabled ? darken(0.1, props.$bgColor) : 'white')};
    color: ${(props) => (props.enabled ? 'white' : 'black')};
  }
`;

/**
 * The map pane a feature-select filter targets. Filters from the page's sidebar carry their
 * resolved `panes`; others (such as download-section filters) are resolved here, with the
 * same rules.
 *
 * @param {Object} filter
 * @param {Object} mapState
 * @returns {string|undefined}
 */
export const filterTargetPane = (filter, mapState) =>
  (filter?.panes ?? (filter ? resolveFilterPanes(filter, selectMapGrid(mapState)).panes : []))[0];

/**
 * Gets the path to look up a layer's features. For a layer with a path per map pane, uses
 * the target pane's path, or another pane's whose params are all set if the target's aren't.
 *
 * @param {Object} layer - The layer from mapState.
 * @param {string} [targetPane] - The pane the filter targets; defaults to the first pane.
 * @returns {string|undefined} The feature lookup path.
 */
export const getFeatureLookupPath = (layer, targetPane) => {
  if (layer?.metadata?.path) return layer.metadata.path;
  if (layer?.panePaths) {
    const paneIds = Object.keys(layer.panePaths);
    const pane = paneIds.includes(targetPane) ? targetPane : paneIds[0];
    const isComplete = (id) => !layer.paneMissingParams?.[id]?.length;
    if (isComplete(pane)) return layer.panePaths[pane];
    const complete = paneIds.find(isComplete);
    return layer.panePaths[complete ?? pane];
  }
  return layer?.path;
};

/**
 * BaseMapFeatureSelect component provides the core functionality for selecting map features.
 * It can optionally render controls for selection mode and enabling/disabling selection.
 *
 * @component
 * @param {Object} props - The component props.
 * @param {string|number} props.key - Unique key for the component.
 * @param {Object} props.filter - The filter object containing filter details.
 * @param {Array} props.value - The selected feature values.
 * @param {Function} props.onChange - Function to call when the selected features change.
 * @param {boolean} props.showControls - Whether to show selection mode controls.
 * @returns {JSX.Element} The rendered BaseMapFeatureSelect component.
 */
export const BaseMapFeatureSelect = ({ key, filter, value, onChange, showControls, disabled, excludeValue, ...props }) => {
  const { state: mapState } = useMapContext();
  // Select on the pane hosting the draw control (the primary pane unless the page's
  // feature-select filters target another).
  // Until that pane's map is ready, presets fall back to `state.map` (their primary pane, which
  // is the draw pane); a grid waits, so selection never binds to a map without the draw control.
  const map =
    selectPaneMap(mapState, selectDrawPaneId(mapState)) ??
    (selectMapGrid(mapState).preset === "custom" ? null : mapState.map);
  const prevTransformedFeaturesRef = useRef();
  const [isFeatureSelectActive, setFeatureSelectActive] = useState(false);
  const [selectionMode, setSelectionMode] = useState("feature");
  const [selectedOptions, setSelectedOptions] = useState([]);
  const transformedFeatures = useFeatureSelect(
    map,
    filter,
    isFeatureSelectActive,
    setFeatureSelectActive,
    selectionMode,
    selectedOptions
  );
  

  // Check if filter.layer is provided
  if (!filter || !filter.layer) {
    console.error(
      `Error: attempting to instantiate a mapFeatureSelect filter without providing layer property in the filter definition. Filter name is "${filter.filterName}":`
    );
    console.log(filter);
  }

  // Get the layer using filter.layer from mapState
  const layer = mapState.layers[filter.layer];

  // Check if the specified layer exists in mapState
  if (!layer) {
    console.warn(
      `Layer '${filter.layer}' not found in mapState while attempting to instantiate a mapFeatureSelect filter.`
    );
  }

  

  // Ensure layer and its properties are defined
  const layerPath = getFeatureLookupPath(layer, filterTargetPane(filter, mapState));

  /**
   * Handles the change in selected options from the dropdown.
   *
   * @param {Array} options - The selected options from the dropdown.
   */
  const handleSelectionChange = useCallback((options) => {
    setSelectedOptions(options);
    onChange(filter, options);
  }, [filter, onChange]);

  /**
   * Handles the change in selection mode (feature or rectangle).
   *
   * @param {string} mode - The new selection mode.
   */
  const handleSelectionModeChange = (mode) => {
    if (isFeatureSelectActive) {
      setSelectionMode(mode);
    }
  };

  /**
   * Toggles the feature selection enabled state and sets the selection mode.
   */
  const toggleSelectEnabled = () => {
    const newState = !isFeatureSelectActive;
    setFeatureSelectActive(newState);

    // Automatically set the selection mode when enabling the filter
    if (newState) {
      setSelectionMode(selectionMode);
    }
  };

  useEffect(() => {
    if (!isEqual(prevTransformedFeaturesRef.current, transformedFeatures)) {
      prevTransformedFeaturesRef.current = transformedFeatures;
      handleSelectionChange(transformedFeatures);
    }
  }, [transformedFeatures, handleSelectionChange]);

  return (
    <Container key={key} style={{ opacity: disabled ? 0.45 : 1, pointerEvents: disabled ? 'none' : 'auto' }}>
      <FeatureSelect
        layerPath={layerPath}
        value={selectedOptions}
        onChange={handleSelectionChange}
        isMulti={props.isMulti !== undefined ? props.isMulti : filter.multiSelect}
        placeholder={props.placeholder || "Search and select map features..."}
        isClearable
        isDisabled={disabled}
      />

      {showControls && (
        <SelectionModeContainer>
          <EnableSelectButton
            $enabled={isFeatureSelectActive}
            onClick={toggleSelectEnabled}
            $bgColor={props.bgColor}
            disabled={disabled}
          >
            {isFeatureSelectActive ? 'Disable Selector' : 'Enable Selector'}
          </EnableSelectButton>

          <StyledToggle $enabled={isFeatureSelectActive}>
            <ModeButton
              $selected={selectionMode === 'feature'}
              onClick={() => handleSelectionModeChange('feature')}
              disabled={!isFeatureSelectActive || disabled}
              $bgColor={props.bgColor}
            >
              <FaMousePointer />
              Pointer Select
            </ModeButton>
            <ModeButton
              $selected={selectionMode === 'rectangle'}
              onClick={() => handleSelectionModeChange('rectangle')}
              disabled={!isFeatureSelectActive || disabled}
              $bgColor={props.bgColor}
            >
              <FaDrawPolygon />
              Rectangle Select
            </ModeButton>
          </StyledToggle>
        </SelectionModeContainer>
      )}
    </Container>
  );
};

export const MapFeatureSelectWithControls = (props) => (
  <BaseMapFeatureSelect {...props} showControls={true} isMulti />
);  

export const MapFeatureSelect = (props) => (
  <BaseMapFeatureSelect {...props} showControls={false} />
);