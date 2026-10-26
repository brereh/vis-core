import React, { useState, useCallback, useEffect } from "react";
import styled from "styled-components";
import { MapLayout } from "Components/MapLayout/MapLayout";
import { IFrameEmbedPage } from "Components/IFrameEmbedPage/IFrameEmbedPage";
import { DynamicForm } from "Components/DynamicForm/DynamicForm";
import { CoordinatePreviewMap } from "Components/CoordinatePreviewMap/CoordinatePreviewMap";
import { TableLayout } from "Components/TableLayout/TableLayout";
import { SVGGalleryManager } from "Components/SvgGalleryManager/SvgGalleryManager";
import { DirectoryScorecardsPage } from "Components/DirectoryScorecardsPage/DirectoryScorecardsPage";
import { FilterProvider, MapProvider, PageContext } from "contexts";
import { bngToWgs84 } from "utils/coordinates";

const FormPageWrapper = styled.div`
  display: flex;
  height: ${props => props.$centered ? 'auto' : 'calc(100vh - var(--app-navbar-height, 75px) - var(--app-statusbar-height, 0px))'};
  min-height: calc(100vh - var(--app-navbar-height, 75px) - var(--app-statusbar-height, 0px));
  overflow: ${props => props.$centered ? 'auto' : 'hidden'};
  justify-content: ${props => props.$centered ? 'center' : 'flex-start'};
  align-items: ${props => props.$centered ? 'flex-start' : 'stretch'};
  background: ${props => props.$centered ? '#fafafa' : 'transparent'};
  
  @media (max-width: 1024px) {
    flex-direction: column;
    height: auto;
    min-height: calc(100vh - var(--app-navbar-height, 75px) - var(--app-statusbar-height, 0px));
    justify-content: flex-start;
  }
`;

const FormPageContainer = styled.div`
  display: flex;
  flex-direction: column;
  padding: 32px;
  width: ${props => props.$centered ? '640px' : '480px'};
  min-width: ${props => props.$centered ? '400px' : '400px'};
  max-width: ${props => props.$centered ? '720px' : '520px'};
  background: ${props => props.$centered ? '#fff' : '#fafafa'};
  border-right: ${props => props.$centered ? 'none' : '1px solid #e5e5e5'};
  border-radius: ${props => props.$centered ? '12px' : '0'};
  box-shadow: ${props => props.$centered ? '0 4px 20px rgba(0, 0, 0, 0.08)' : 'none'};
  margin: ${props => props.$centered ? '32px 0' : '0'};
  overflow-y: ${props => props.$centered ? 'visible' : 'auto'};
  flex-shrink: 0;
  
  @media (max-width: 1024px) {
    width: 100%;
    max-width: 100%;
    min-width: 0;
    border-right: none;
    border-bottom: ${props => props.$centered ? 'none' : '1px solid #e5e5e5'};
    border-radius: ${props => props.$centered ? '0' : '0'};
    box-shadow: none;
    margin: 0;
    overflow-y: visible;
    flex-shrink: 1;
  }
`;

const MapPreviewContainer = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: 24px;
  background: #fff;
  min-width: 0;
  overflow: hidden;
  
  @media (max-width: 1024px) {
    min-height: 350px;
    flex: none;
  }
`;

const MapPreviewTitle = styled.h2`
  font-size: 1rem;
  font-weight: 600;
  color: #444;
  margin: 0 0 12px 0;
  flex-shrink: 0;
`;

const MapPreviewWrapper = styled.div`
  flex: 1;
  border-radius: 8px;
  overflow: hidden;
  min-height: 0;
`;

const InlineMapPreview = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 4px 0 8px 0;
`;

const FormPageTitle = styled.h1`
  font-size: 1.5rem;
  font-weight: 600;
  color: #222;
  margin: 0 0 8px 0;
`;

const FormPageDescription = styled.p`
  font-size: 0.95rem;
  color: #555;
  margin: 0 0 24px 0;
  line-height: 1.5;
`;

/**
 * Last easting/northing or lat/lng field in form order — used to place the inline map.
 */
const getMapAnchorFieldId = (fields = [], isBngMode, eastingFieldId, northingFieldId) => {
  const anchorIds = new Set();
  if (isBngMode) {
    if (eastingFieldId) anchorIds.add(eastingFieldId);
    if (northingFieldId) anchorIds.add(northingFieldId);
  } else {
    const coordField = fields.find((f) => f.type === 'coordinates');
    if (coordField?.id) anchorIds.add(coordField.id);
  }
  if (anchorIds.size === 0) return null;
  return [...fields].reverse().find((f) => anchorIds.has(f.id))?.id ?? null;
};

/**
 * FormPageContent - Internal component that manages form state and map preview.
 *
 * Map preview layout is controlled by `pageConfig.config.mapPreviewLayout`:
 * - `'inline'` (default): centred form with the map under the coordinate fields
 * - `'sidebar'`: form on the left, map filling the rest of the page
 */
const FormPageContent = ({ pageConfig }) => {
  const [coordinates, setCoordinates] = useState({ lat: '', lng: '' });
  const [mapClickedCoords, setMapClickedCoords] = useState(null);
  const [bngCoords, setBngCoords] = useState({ easting: '', northing: '' });
  
  // Check if using BNG coordinate system
  const isBngMode = pageConfig.config?.coordinateSystem === 'BNG';
  const formFields = pageConfig.config?.formConfig?.fields || [];
  const eastingFieldId = formFields.find(
    (f) => f.name === 'easting' || f.id === 'easting'
  )?.id;
  const northingFieldId = formFields.find(
    (f) => f.name === 'northing' || f.id === 'northing'
  )?.id;
  const mapAnchorFieldId = getMapAnchorFieldId(
    formFields,
    isBngMode,
    eastingFieldId,
    northingFieldId
  );
  
  const handleCoordinateChange = useCallback((newCoords) => {
    // For regular lat/lng coordinate changes
    if (!isBngMode) {
      setCoordinates(newCoords);
    }
  }, [isBngMode]);
  
  // Handle BNG coordinate changes from form
  const handleBngCoordinateChange = useCallback((fieldId, value) => {
    setBngCoords(prev => {
      const newCoords = { ...prev };
      if (fieldId === eastingFieldId || fieldId === 'easting') {
        newCoords.easting = value;
      } else if (fieldId === northingFieldId || fieldId === 'northing') {
        newCoords.northing = value;
      }
      return newCoords;
    });
  }, [eastingFieldId, northingFieldId]);
  
  // Convert BNG to WGS84 when BNG coordinates change
  useEffect(() => {
    if (!isBngMode) return;
    
    if (bngCoords.easting && bngCoords.northing) {
      const wgs84 = bngToWgs84(bngCoords.easting, bngCoords.northing);
      if (wgs84) {
        setCoordinates(wgs84);
      }
    } else {
      setCoordinates({ lat: '', lng: '' });
    }
  }, [bngCoords.easting, bngCoords.northing, isBngMode]);
  
  const handleMapClick = useCallback((clickedCoords) => {
    // Update coordinates from map click (only when not in BNG mode)
    if (!isBngMode) {
      setMapClickedCoords(clickedCoords);
      setCoordinates(clickedCoords);
    }
  }, [isBngMode]);
  
  // Callback to capture form field changes for BNG mode
  const handleFormFieldChange = useCallback((fieldId, value) => {
    if (isBngMode && (fieldId === eastingFieldId || fieldId === northingFieldId ||
        fieldId === 'easting' || fieldId === 'northing')) {
      handleBngCoordinateChange(fieldId, value);
    }
  }, [isBngMode, eastingFieldId, northingFieldId, handleBngCoordinateChange]);
  
  const showMapPreview = pageConfig.config?.showMapPreview !== false;
  const mapPreviewLayout = pageConfig.config?.mapPreviewLayout === 'sidebar'
    ? 'sidebar'
    : 'inline';
  const isInlineMap = showMapPreview && mapPreviewLayout === 'inline';
  const isSidebarMap = showMapPreview && mapPreviewLayout === 'sidebar';
  const isCentered = !isSidebarMap;
  const enableClickToSelect = !isBngMode && pageConfig.config?.enableClickToSelect !== false;
  const inlineMapHeight = pageConfig.config?.mapPreviewHeight || '280px';
  
  const getMapTitle = () => {
    if (isBngMode) {
      return 'Site Location Preview';
    }
    return 'Location Preview';
  };

  const mapPreview = (
    <CoordinatePreviewMap
      lat={coordinates.lat}
      lng={coordinates.lng}
      height={isInlineMap ? inlineMapHeight : '100%'}
      zoom={pageConfig.config?.mapPreviewZoom || 13}
      markerColor={pageConfig.config?.bgColor || '#dc2626'}
      clickToSelect={enableClickToSelect}
      onMapClick={handleMapClick}
    />
  );

  const inlineMap = (
    <InlineMapPreview data-testid="form-page-map-inline">
      <MapPreviewTitle>{getMapTitle()}</MapPreviewTitle>
      {mapPreview}
    </InlineMapPreview>
  );

  const afterFieldContent = isInlineMap && mapAnchorFieldId
    ? { [mapAnchorFieldId]: inlineMap }
    : undefined;
  
  return (
    <FormPageWrapper $centered={isCentered}>
      <FormPageContainer $centered={isCentered}>
        {pageConfig.pageTitle && (
          <FormPageTitle>{pageConfig.pageTitle}</FormPageTitle>
        )}
        {pageConfig.pageDescription && (
          <FormPageDescription>{pageConfig.pageDescription}</FormPageDescription>
        )}
        <DynamicForm
          config={pageConfig.config.formConfig}
          bgColor={pageConfig.config.bgColor}
          onSubmitSuccess={pageConfig.config.onSubmitSuccess}
          onSubmitError={pageConfig.config.onSubmitError}
          onCoordinateChange={handleCoordinateChange}
          externalCoordinates={mapClickedCoords}
          onFieldChange={handleFormFieldChange}
          afterFieldContent={afterFieldContent}
        />
        {isInlineMap && !mapAnchorFieldId && inlineMap}
      </FormPageContainer>
      {isSidebarMap && (
        <MapPreviewContainer data-testid="form-page-map-sidebar">
          <MapPreviewTitle>{getMapTitle()}</MapPreviewTitle>
          <MapPreviewWrapper>
            {mapPreview}
          </MapPreviewWrapper>
        </MapPreviewContainer>
      )}
    </FormPageWrapper>
  );
};

/**
 * PageSwitch component dynamically renders different page layouts based on the provided page configuration.
 * It switches between different page types and renders the corresponding components.
 * @component
 * @param {object} pageConfig - The configuration object for the page, containing information about the type of page to render.
 * @property {string} pageConfig.type - The type of page layout to render.
 * @returns {JSX.Element} The rendered PageSwitch component.
 */
export const PageSwitch = ({ pageConfig, customPageComponent = null }) => {

  return (
    <PageContext.Provider value={pageConfig}>
      {(() => {
        switch (pageConfig.type) {
          case "DualMapLayout":
          case "MapLayout":
            return (
              <FilterProvider>
                <MapProvider>
                  <MapLayout />
                </MapProvider>
              </FilterProvider>
            );
          case "IFrameEmbed":
            return <IFrameEmbedPage config={pageConfig.config} />;
          case "FormPage":
            return <FormPageContent pageConfig={pageConfig} />;
          case "CustomPage":
            if (customPageComponent) {
              return customPageComponent;
            }
            return <div>Custom page component not provided</div>;
          case "TableLayout":
            return <TableLayout config={pageConfig.config} />;
          case "DirectoryScorecards":
            return (
              <FilterProvider>
                <DirectoryScorecardsPage/>
              </FilterProvider>
            );
          case "SVGGalleryManager":
            return (
              <FilterProvider>
                <SVGGalleryManager config={pageConfig.config} />
              </FilterProvider>
            );
          // Note: "AdminPage" is intentionally not handled here. BaseApp removes it from
          // appPages and mounts it directly at /admin (via withRoleValidation), so it never
          // flows through PageSwitch.
          default:
            return <div>Nothing</div>;
        }
      })()}
    </PageContext.Provider>
  );
};
