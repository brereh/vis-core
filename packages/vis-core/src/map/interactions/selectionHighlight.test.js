import {
  featureStateTarget,
  highlightSelectedFeature,
  SELECTED_FEATURE_LAYER,
  SELECTED_FEATURE_SOURCE,
} from "./selectionHighlight";
import { createFakeMap, createFeature } from "testing/mapLibreFake";
import { SELECTED_COLOURS } from "../hoverStyle";

const tiledZone = (id) => createFeature({ id, layerId: "zones", source: "zones", sourceLayer: "z" });

let map;
beforeEach(() => {
  map = createFakeMap({ initialSources: { zones: { type: "vector" } } });
});

describe("featureStateTarget", () => {
  it("includes the source layer only when there is one", () => {
    expect(featureStateTarget(tiledZone(1))).toEqual({ source: "zones", sourceLayer: "z", id: 1 });
    expect(featureStateTarget(createFeature({ id: 2, layerId: "g" }))).toEqual({ source: "g", id: 2 });
  });
});

describe("highlightSelectedFeature", () => {
  it("selects a feature with an id through feature state, without adding layers", () => {
    const target = highlightSelectedFeature(map, tiledZone(1), null);

    expect(target).toEqual({ source: "zones", sourceLayer: "z", id: 1 });
    expect(map.getFeatureState(target)).toEqual({ selected: true });
    expect(map.addLayer).not.toHaveBeenCalled();
  });

  it("unselects the previous feature", () => {
    const first = highlightSelectedFeature(map, tiledZone(1), null);
    const second = highlightSelectedFeature(map, tiledZone(2), first);

    expect(map.getFeatureState(first)).toEqual({ selected: false });
    expect(map.getFeatureState(second)).toEqual({ selected: true });
  });

  it("clears the selection when given no feature", () => {
    const first = highlightSelectedFeature(map, tiledZone(1), null);
    expect(highlightSelectedFeature(map, null, first)).toBeNull();
    expect(map.getFeatureState(first)).toEqual({ selected: false });
  });

  it("skips unselecting when the previous feature's source has gone", () => {
    const first = highlightSelectedFeature(map, tiledZone(1), null);
    map.removeSource("zones");
    map.setFeatureState.mockClear();
    highlightSelectedFeature(map, null, first);
    expect(map.setFeatureState).not.toHaveBeenCalled();
  });

  it("draws a GeoJSON copy for a feature without an id, and removes it on the next call", () => {
    const noId = createFeature({ id: undefined, layerId: "zones", type: "fill" });
    noId.id = undefined;
    expect(highlightSelectedFeature(map, noId, null)).toBeNull();
    expect(map.getSource(SELECTED_FEATURE_SOURCE).data).toEqual(noId.toJSON());
    expect(map.getLayer(SELECTED_FEATURE_LAYER)).toMatchObject({
      type: "fill",
      paint: { "fill-color": SELECTED_COLOURS.light.core },
    });

    highlightSelectedFeature(map, null, null);
    expect(map.getLayer(SELECTED_FEATURE_LAYER)).toBeUndefined();
    expect(map.getSource(SELECTED_FEATURE_SOURCE)).toBeUndefined();
  });
});
