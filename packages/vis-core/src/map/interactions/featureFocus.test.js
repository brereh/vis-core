import {
  FEATURE_LABEL_DURATION_MS,
  FEATURE_LABEL_LAYER,
  FEATURE_LABEL_SOURCE,
  focusFeature,
  focusPadding,
  planFeatureFocus,
  showFeatureLabel,
} from "./featureFocus";
import { createFakeMap } from "testing/mapLibreFake";

const square = (minLng, minLat, size) => ({
  type: "Polygon",
  coordinates: [
    [
      [minLng, minLat],
      [minLng + size, minLat],
      [minLng + size, minLat + size],
      [minLng, minLat + size],
      [minLng, minLat],
    ],
  ],
});
const centroid = { type: "Point", coordinates: [-1.5, 53.8] };

describe("focusPadding", () => {
  it.each([
    [0.001, 150],
    [0.02, 120],
    [1, 100],
  ])("span %f → %ipx", (span, padding) => {
    expect(focusPadding(span)).toBe(padding);
  });
});

describe("planFeatureFocus", () => {
  it("fits the feature's bounds with defaults", () => {
    expect(planFeatureFocus({ bounds: square(-2, 53, 1), centroid })).toEqual({
      method: "fitBounds",
      bounds: [
        [-2, 53],
        [-1, 54],
      ],
      options: { padding: 100, maxZoom: 14, duration: 1000, linear: false },
    });
  });

  it("uses the layer's zoom-to-feature settings", () => {
    const plan = planFeatureFocus({
      bounds: square(0, 0, 0.001),
      centroid,
      layerMetadata: { zoomToFeatureMaxZoom: 16, zoomToFeatureDuration: 0, zoomToFeatureLinear: true },
    });
    expect(plan.options).toEqual({ padding: 150, maxZoom: 16, duration: 0, linear: true });
  });

  it("pans to the centroid when there are no bounds", () => {
    expect(planFeatureFocus({ centroid, layerMetadata: { zoomToFeatureDuration: 500 } })).toEqual({
      method: "panTo",
      center: [-1.5, 53.8],
      options: { duration: 500 },
    });
  });

  it("does nothing without a centroid", () => {
    expect(planFeatureFocus({ bounds: square(0, 0, 1) })).toBeNull();
    expect(planFeatureFocus()).toBeNull();
  });
});

describe("focusFeature", () => {
  it("applies the plan to the map", () => {
    const map = createFakeMap();
    expect(focusFeature(map, { bounds: square(-2, 53, 1), centroid })).toBe(true);
    expect(map.fitBounds).toHaveBeenCalledWith(
      [
        [-2, 53],
        [-1, 54],
      ],
      expect.objectContaining({ padding: 100 })
    );

    expect(focusFeature(map, { centroid })).toBe(true);
    expect(map.panTo).toHaveBeenCalledWith([-1.5, 53.8], { duration: 1000 });

    expect(focusFeature(map, {})).toBe(false);
  });
});

describe("showFeatureLabel", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it("shows the name at the centroid, then removes it", () => {
    const map = createFakeMap();
    const timeoutRef = { current: null };
    showFeatureLabel(map, { featureName: "Leeds", centroid, timeoutRef });

    expect(map.getSource(FEATURE_LABEL_SOURCE).data.properties.name).toBe("Leeds");
    expect(map.getLayer(FEATURE_LABEL_LAYER)).toBeDefined();

    jest.advanceTimersByTime(FEATURE_LABEL_DURATION_MS);
    expect(map.getLayer(FEATURE_LABEL_LAYER)).toBeUndefined();
    expect(map.getSource(FEATURE_LABEL_SOURCE)).toBeUndefined();
    expect(timeoutRef.current).toBeNull();
  });

  it("replaces a label that is still up, restarting its timer", () => {
    const map = createFakeMap();
    const timeoutRef = { current: null };
    showFeatureLabel(map, { featureName: "Leeds", centroid, timeoutRef });
    jest.advanceTimersByTime(FEATURE_LABEL_DURATION_MS - 1);
    showFeatureLabel(map, { featureName: "York", centroid, timeoutRef });

    jest.advanceTimersByTime(FEATURE_LABEL_DURATION_MS - 1);
    expect(map.getSource(FEATURE_LABEL_SOURCE).data.properties.name).toBe("York");
    jest.advanceTimersByTime(1);
    expect(map.getLayer(FEATURE_LABEL_LAYER)).toBeUndefined();
  });
});
