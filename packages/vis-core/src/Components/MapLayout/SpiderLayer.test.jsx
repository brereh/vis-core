/**
 * @file SpiderLayer.test.jsx
 * @description Comprehensive tests for the SpiderLayer React component.
 */

import React from "react";
import { render, waitFor } from "@testing-library/react";
import { SpiderLayer } from "./SpiderLayer";
import { useMapContext } from "hooks";
import {
  ensureSpiderHoverSelectLayers,
  buildSpiderDataOffsetOne,
  collectSourcePoints,
} from "utils/mapSpiders";

// Mock dependencies
jest.mock("hooks/useMapContext", () => ({
  useMapContext: jest.fn(),
}));

jest.mock("utils", () => ({
  getSourceLayer: jest.fn(() => "mock-source-layer"),
}));

jest.mock("utils/mapSpiders", () => ({
  ensureSpiderHoverSelectLayers: jest.fn(),
  buildSpiderDataOffsetOne: jest.fn(),
  collectSourcePoints: jest.fn(),
}));

describe("SpiderLayer Component", () => {
  let mockMap;
  let mockMapContext;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();

    // Create a robust mock map object
    mockMap = {
      getLayer: jest.fn((id) => {
        if (id === "baseLayer") return { type: "circle" };
        return null;
      }),
      getSource: jest.fn(() => null),
      addSource: jest.fn(),
      addLayer: jest.fn(),
      removeLayer: jest.fn(),
      removeSource: jest.fn(),
      moveLayer: jest.fn(),
      on: jest.fn(),
      off: jest.fn(),
      getFilter: jest.fn(() => ["==", "type", "Point"]),
      setFilter: jest.fn(),
      getLayoutProperty: jest.fn(() => "visible"),
      setLayoutProperty: jest.fn(),
      getPaintProperty: jest.fn(() => 1),
      setPaintProperty: jest.fn(),
      getFeatureState: jest.fn(() => ({ hover: true })),
      setFeatureState: jest.fn(),
      style: {}, // Truthy style object to pass cleanup checks
    };

    mockMapContext = {
      state: {},
    };

    useMapContext.mockReturnValue(mockMapContext);

    // Default mock returns for mapSpiders utilities
    collectSourcePoints.mockReturnValue([{ id: 1 }, { id: 2 }]);
    buildSpiderDataOffsetOne.mockReturnValue({
      pointsFc: { type: "FeatureCollection", features: [{ id: 2 }] },
      linksFc: { type: "FeatureCollection", features: [{ id: 2 }] },
      index: { 2: { overlayIds: [], linkIds: [] } },
      excludeIds: [2],
    });
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  /**
   * Tests that the component correctly binds to map events on mount.
   */
  it("should bind map events on mount", () => {
    render(<SpiderLayer baseLayerId="baseLayer" map={mockMap} />);

    expect(mockMap.on).toHaveBeenCalledWith("sourcedata", expect.any(Function));
    expect(mockMap.on).toHaveBeenCalledWith("zoomend", expect.any(Function));
    expect(mockMap.on).toHaveBeenCalledWith("idle", expect.any(Function));
    expect(mockMap.on).toHaveBeenCalledWith("styledata", expect.any(Function));
  });

  /**
   * Tests the debounced rebuild process triggered by map events.
   */
  it("should trigger rebuild and mirror properties on sourcedata event", async () => {
    render(<SpiderLayer baseLayerId="baseLayer" map={mockMap} />);

    // Extract the sourcedata callback
    const sourceDataCallback = mockMap.on.mock.calls.find(
      (call) => call[0] === "sourcedata"
    )[1];

    // Simulate sourcedata event
    sourceDataCallback({ sourceId: "baseLayer", isSourceLoaded: true });

    // Fast-forward the 100ms debounce timer
    jest.advanceTimersByTime(100);

    await waitFor(() => {
      // Verify spider data was built
      expect(collectSourcePoints).toHaveBeenCalledWith(mockMap, "baseLayer");
      expect(buildSpiderDataOffsetOne).toHaveBeenCalled();

      // Verify sources and layers were added
      expect(mockMap.addSource).toHaveBeenCalledWith("baseLayer-spider-src", expect.any(Object));
      expect(mockMap.addSource).toHaveBeenCalledWith("baseLayer-spider-links-src", expect.any(Object));
      expect(mockMap.addLayer).toHaveBeenCalledWith(expect.objectContaining({ id: "baseLayer-spider-links" }));
      expect(mockMap.addLayer).toHaveBeenCalledWith(expect.objectContaining({ id: "baseLayer-spider" }));

      // Verify duplicate exclusion filter was applied
      expect(mockMap.setFilter).toHaveBeenCalledWith("baseLayer", [
        "all",
        ["==", "type", "Point"],
        ["!", ["in", ["get", "id"], ["literal", [2]]]],
      ]);

      // Verify feature state was copied
      expect(mockMap.setFeatureState).toHaveBeenCalledWith(
        { source: "baseLayer-spider-src", id: 2 },
        { hover: true }
      );
    });
  });

  /**
   * Tests the cleanup function returned by useEffect.
   */
  it("should clean up layers, sources, and events on unmount", () => {
    // Setup mock to pretend the base layer AND spider layers exist
    mockMap.getLayer.mockImplementation((id) => {
      // This prevents the early return in useEffect
      if (id === "baseLayer") return { type: "circle" }; 
      if (id.includes("spider")) return {};
      return null;
    });
    
    mockMap.getSource.mockImplementation((id) => id.includes("spider"));

    const { unmount } = render(<SpiderLayer baseLayerId="baseLayer" map={mockMap} />);

    unmount();

    // Verify event listeners are removed
    expect(mockMap.off).toHaveBeenCalledWith("sourcedata", expect.any(Function));
    expect(mockMap.off).toHaveBeenCalledWith("zoomend", expect.any(Function));
    expect(mockMap.off).toHaveBeenCalledWith("idle", expect.any(Function));
    expect(mockMap.off).toHaveBeenCalledWith("styledata", expect.any(Function));

    // Verify original filter is restored
    expect(mockMap.setFilter).toHaveBeenCalledWith("baseLayer", ["==", "type", "Point"]);

    // Verify layers and sources are removed
    expect(mockMap.removeLayer).toHaveBeenCalledWith("baseLayer-spider");
    expect(mockMap.removeSource).toHaveBeenCalledWith("baseLayer-spider-src");
    expect(mockMap.removeLayer).toHaveBeenCalledWith("baseLayer-spider-links");
    expect(mockMap.removeSource).toHaveBeenCalledWith("baseLayer-spider-links-src");
    expect(mockMap.removeLayer).toHaveBeenCalledWith("baseLayer-spider-hover");
    expect(mockMap.removeLayer).toHaveBeenCalledWith("baseLayer-spider-select");

    // Verify index is deleted
    expect(mockMap.__spiderIndex).toBeUndefined();
  });

  /**
   * Tests early return if the base layer does not exist or is not a circle type.
   */
  it("should do nothing if base layer is missing or not a circle", () => {
    mockMap.getLayer.mockReturnValue(null); // Layer doesn't exist

    render(<SpiderLayer baseLayerId="missingLayer" map={mockMap} />);

    expect(mockMap.on).not.toHaveBeenCalled();
  });
});
