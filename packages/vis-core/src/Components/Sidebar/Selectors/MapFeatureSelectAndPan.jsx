import React from 'react';
import { useMapContext } from "hooks/useMapContext";
import { BaseMapFeatureSelect, getFeatureLookupPath } from './MapFeatureSelect';
import { api } from 'services';
import { actionTypes } from 'reducers/mapReducer';

/**
 * MapFeatureSelectAndPan component extends the base component to add
 * functionality for panning to a single feature on select and handling its geometry.
 *
 * @component
 * @param {Object} props - The component props.
 * @returns {JSX.Element} The rendered MapFeatureSelectAndPan component.
 */
export const MapFeatureSelectAndPan = ({ filter, onChange, ...props }) => {
  const { state: mapState, dispatch: mapDispatch } = useMapContext();

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
  const layerPath = getFeatureLookupPath(layer, filter?.panes?.[0]);

  /**
   * Handles the change in selected options from the dropdown.
   * Fetches geometry and dispatches actions for the selected feature.
   *
   * @param {Object} option - The selected option from the dropdown.
   */
  const handleSelectionChange = async (filter, option) => {
    // Clear action: react-select passes null
    if (!option) {
      onChange?.(filter, null);        // tell parent it was cleared
      return;
    }

    // Single-select safety
    const id = option.value;
    if (!id) {
      onChange?.(filter, null);
      return;
    }

    const { bounds, centroid } =
      await api.geodataService.getFeatureGeometry(layerPath, id);

    mapDispatch({
      type: actionTypes.SET_BOUNDS_AND_CENTROID,
      payload: { 
        bounds, 
        centroid,
        featureName: option.label,
        layerMetadata: layer.metadata
      },
    });

    onChange?.(filter, id);
  };

  return (
    <BaseMapFeatureSelect
      {...props}
      filter={filter}
      onChange={handleSelectionChange}
      isMulti={false}
      placeholder="Search and zoom to a map feature"
    />
  );
};