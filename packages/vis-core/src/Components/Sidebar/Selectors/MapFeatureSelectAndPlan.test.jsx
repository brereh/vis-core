import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MapFeatureSelectAndPan } from ".";
import { MapContext } from "contexts";
import { actionTypes } from "reducers/mapReducer";
import { api } from "services";

jest.mock("./MapFeatureSelect.jsx", () => ({
  getFeatureLookupPath: jest.requireActual("./MapFeatureSelect.jsx").getFeatureLookupPath,
  filterTargetPane: jest.requireActual("./MapFeatureSelect.jsx").filterTargetPane,
  BaseMapFeatureSelect: ({ filter, onChange }) => {
    return (
      <>
        <div>filter: {JSON.stringify(filter)}</div>
        <button
          data-testid="button"
          onClick={() => onChange(filter, { value: "feature-123" })}
        />
      </>
    );
  },
}));
jest.mock("services", () => ({
  api: {
    geodataService: {
      getFeatureGeometry: jest.fn(),
    },
  },
}));
jest.mock("maplibre-gl", () => ({
  Map: jest.fn(() => ({
    on: jest.fn(),
    off: jest.fn(),
    remove: jest.fn(),
    addLayer: jest.fn(),
    setStyle: jest.fn(),
    flyTo: jest.fn(),
  })),
}));

describe("MapFeatureSelectAndPan component test", () => {
  it("Basic use", async () => {
    api.geodataService.getFeatureGeometry.mockResolvedValue({
      bounds: [[0, 0], [1, 1]],
      centroid: [0.5, 0.5],
    });

    const dispatch = jest.fn();
    const mockState = {
      visualisations: {},
      filters: [],
      layers: {
        layerA: { path: "/fake/path" },
      },
      currentZoom: 10,
    };

    const fakeOnChange = jest.fn();
    const props = {
      filter: {
        filterName: "myFilter",
        layer: "layerA",
        multiSelect: { multiSelect: "multiSelect" },
      },
      onChange: fakeOnChange,
    };

    render(
      <MapContext.Provider value={{ state: mockState, dispatch }}>
        <MapFeatureSelectAndPan {...props} />
      </MapContext.Provider>
    );

    const button = screen.getByTestId("button");
    expect(button).toBeInTheDocument();
    await userEvent.click(button);

    await waitFor(() => {
      expect(api.geodataService.getFeatureGeometry).toHaveBeenCalledWith(
        "/fake/path",
        "feature-123"
      );
    });

    expect(dispatch).toHaveBeenCalledWith({
      type: actionTypes.SET_BOUNDS_AND_CENTROID,
      payload: {
        bounds: [[0, 0], [1, 1]],
        centroid: [0.5, 0.5],
      },
    });

    expect(fakeOnChange).toHaveBeenCalledWith(props.filter, "feature-123");
  });
});