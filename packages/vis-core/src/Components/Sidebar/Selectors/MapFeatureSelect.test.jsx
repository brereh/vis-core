import { render, screen, waitFor } from "@testing-library/react";
import { BaseMapFeatureSelect, getFeatureLookupPath } from ".";
import { MapContext } from "contexts";
import userEvent from "@testing-library/user-event";

jest.mock("./FeatureSelect.jsx", () => ({
  FeatureSelect: ({
    layerPath,
    value,
    onChange,
    isMulti,
    placeholder,
    isClearable,
  }) => {
    return (
      <>
        <button
          data-testid="featureSelect-button"
          onClick={() => {
            const mockOptions = ["option1", "option2"];
            onChange(onChange(mockOptions));
          }}
        ></button>
      </>
    );
  },
}));
jest.mock("polished", () => ({
  darken: jest.fn((amount, color) => {
    if (!color) return "#cccccc";
    return color;
  }),
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
const mockState = {
  visualisations: {},
  filters: [],
  layers: {},
  currentZoom: 10,
};

const fakeOnChange = jest.fn();
const defaultTextColor = "rgb(0, 0, 0)";

let props = {
  key: "key",
  filter: {
    layer: { layer: "layer" },
    multiSelect: { multiSelect: "multiSelect" },
  },
  value: "value",
  onChange: fakeOnChange,
  showControls: true,
};

describe("BaseMapFeatureSelect component test", () => {
  beforeEach(() => {
    props = {
      key: "key",
      filter: {
        layer: { layer: "layer" },
        multiSelect: { multiSelect: "multiSelect" },
      },
      value: "value",
      onChange: fakeOnChange,
      showControls: true,
    };
  });

  it("Click on the select, FeatureSelect", async () => {
    render(
      <MapContext.Provider value={{ state: mockState }}>
        <BaseMapFeatureSelect {...props} />
      </MapContext.Provider>
    );
    const button = screen.getByTestId("featureSelect-button");
    expect(button).toBeInTheDocument();
    userEvent.click(button);
    expect(fakeOnChange).toHaveBeenCalled();
  });
  it("showControls at false", async () => {
    props = {
      ...props,
      showControls: false,
    };
    render(
      <MapContext.Provider value={{ state: mockState }}>
        <BaseMapFeatureSelect {...props} />
      </MapContext.Provider>
    );
    expect(screen.queryByText("Rectangle Select")).not.toBeInTheDocument();
    expect(screen.queryByText("Pointer Select")).not.toBeInTheDocument();
    expect(screen.queryByText("Enable Selector")).not.toBeInTheDocument();
    expect(screen.queryByText("Enable Selector")).not.toBeInTheDocument();
  });
  it("Click on Pointer Select and Rectangle Select", async () => {
    const propsWithColor = {
      ...props,
      bgColor: "rgb(255, 0, 0)",
    };

    render(
      <MapContext.Provider value={{ state: mockState }}>
        <BaseMapFeatureSelect {...propsWithColor} />
      </MapContext.Provider>
    );
    const pointerSelect = screen.getByText("Pointer Select");
    const rectangleSelect = screen.getByText("Rectangle Select");
    const enableButton = screen.getByText("Enable Selector");

    expect(pointerSelect).toBeDisabled();
    expect(rectangleSelect).toBeDisabled();

    await userEvent.click(enableButton);

    expect(screen.getByText("Disable Selector")).toBeInTheDocument();
    expect(pointerSelect).not.toBeDisabled();
    expect(rectangleSelect).not.toBeDisabled();

    expect(pointerSelect).toHaveStyle({
      color: defaultTextColor,
    });
    expect(rectangleSelect).toHaveStyle({
      color: defaultTextColor,
    });

    await userEvent.click(rectangleSelect);

    await waitFor(() => {
      expect(rectangleSelect).toHaveStyle({
        color: defaultTextColor,
      });
      expect(pointerSelect).toHaveStyle({
        color: defaultTextColor,
      });
    });

    await userEvent.click(pointerSelect);

    await waitFor(() => {
      expect(pointerSelect).toHaveStyle({
        color: defaultTextColor,
      });
      expect(rectangleSelect).toHaveStyle({
        color: defaultTextColor,
      });
    });
  });
});
describe("getFeatureLookupPath", () => {
  it("defaults to left side path when left has no missing params", () => {
    const layer = {
      panePaths: {
        left: "/api/tiles/left",
        right: "/api/tiles/right",
      },
      paneMissingParams: {
        left: [],
        right: [],
      },
    };
    expect(getFeatureLookupPath(layer)).toBe("/api/tiles/left");
    expect(getFeatureLookupPath(layer, "left")).toBe("/api/tiles/left");
  });

  it("selects right side path when the target pane === 'right' and right has no missing params", () => {
    const layer = {
      panePaths: {
        left: "/api/tiles/left",
        right: "/api/tiles/right",
      },
      paneMissingParams: {
        left: [],
        right: [],
      },
    };
    expect(getFeatureLookupPath(layer, "right")).toBe("/api/tiles/right");
  });

  it("falls back to right side when left side has missing params", () => {
    const layer = {
      panePaths: {
        left: "/api/tiles/left",
        right: "/api/tiles/right",
      },
      paneMissingParams: {
        left: ["year"],
        right: [],
      },
    };
    expect(getFeatureLookupPath(layer, "left")).toBe("/api/tiles/right");
    expect(getFeatureLookupPath(layer)).toBe("/api/tiles/right");
  });

  it("falls back to left side when the target pane is right but right side has missing params", () => {
    const layer = {
      panePaths: {
        left: "/api/tiles/left",
        right: "/api/tiles/right",
      },
      paneMissingParams: {
        left: [],
        right: ["year"],
      },
    };
    expect(getFeatureLookupPath(layer, "right")).toBe("/api/tiles/left");
  });

  it("returns layer.metadata.path if present", () => {
    const layer = {
      metadata: { path: "/api/metadata/tiles" },
      panePaths: { left: "/api/tiles/left", right: "/api/tiles/right" },
    };
    expect(getFeatureLookupPath(layer)).toBe("/api/metadata/tiles");
    expect(getFeatureLookupPath(layer, "right")).toBe("/api/metadata/tiles");
  });

  it("returns layer.path for single-map layers", () => {
    const layer = {
      path: "/api/tiles/single",
    };
    expect(getFeatureLookupPath(layer)).toBe("/api/tiles/single");
    expect(getFeatureLookupPath(layer, "right")).toBe("/api/tiles/single");
  });
});
