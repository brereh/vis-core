import { DEFAULT_LABEL_ZOOM_LEVEL, labelledLayers, labelLayerId, updateLabelLayer } from "./labelLayers";
import { createFakeMap } from "testing/mapLibreFake";

const label = { layerId: "zones", sourceLayer: "z", labelZoomLevel: 10, labelNulls: false };

const mapAt = (zoom, geometryType = "Polygon") =>
  createFakeMap({ zoom, sourceFeatures: [{ geometry: { type: geometryType } }] });

describe("updateLabelLayer", () => {
  it("creates the label layer from the layer's source above the zoom level", () => {
    const map = mapAt(11);
    updateLabelLayer(map, label);

    const layer = map.getLayer(labelLayerId("zones"));
    expect(layer).toMatchObject({ type: "symbol", source: "zones", "source-layer": "z" });
    expect(layer.layout["symbol-placement"]).toBe("point");
    expect(map.querySourceFeatures).toHaveBeenCalledWith("zones", { sourceLayer: "z" });
  });

  it("places labels along lines", () => {
    const map = mapAt(11, "MultiLineString");
    updateLabelLayer(map, label);
    expect(map.getLayer("zones-label").layout["symbol-placement"]).toBe("line");
  });

  it("hides null-valued features' labels unless labelNulls is set", () => {
    const hiding = mapAt(11);
    updateLabelLayer(hiding, label);
    expect(Array.isArray(hiding.getLayer("zones-label").paint["text-opacity"])).toBe(true);

    const showing = mapAt(11);
    updateLabelLayer(showing, { ...label, labelNulls: true });
    expect(showing.getLayer("zones-label").paint["text-opacity"]).toBe(1);
  });

  it("hides the labels at or below the zoom level and shows them again above it", () => {
    const map = mapAt(11);
    updateLabelLayer(map, label);

    map.setZoom(10);
    updateLabelLayer(map, label);
    expect(map.getLayoutProperty("zones-label", "visibility")).toBe("none");

    map.setZoom(12);
    updateLabelLayer(map, label);
    expect(map.getLayoutProperty("zones-label", "visibility")).toBe("visible");
    expect(map.addLayer).toHaveBeenCalledTimes(1);
  });

  it("waits for source features before creating the layer", () => {
    const map = createFakeMap({ zoom: 11, sourceFeatures: [] });
    updateLabelLayer(map, label);
    expect(map.getLayer("zones-label")).toBeUndefined();
  });
});

describe("labelledLayers", () => {
  it("lists labelled layers with their settings and the default zoom", () => {
    expect(
      labelledLayers({
        zones: { shouldHaveLabel: true, sourceLayer: "z", labelZoomLevel: 9, labelNulls: true },
        links: { shouldHaveLabel: true },
        plain: {},
      })
    ).toEqual([
      { layerId: "zones", sourceLayer: "z", labelZoomLevel: 9, labelNulls: true },
      { layerId: "links", sourceLayer: undefined, labelZoomLevel: DEFAULT_LABEL_ZOOM_LEVEL, labelNulls: undefined },
    ]);
  });
});
