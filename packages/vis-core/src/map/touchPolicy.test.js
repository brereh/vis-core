import { applyTouchPolicy, isTouchOnlyDevice } from "./touchPolicy";
import { createFakeMap } from "testing/mapLibreFake";

const matching = (queries) => {
  window.matchMedia = (query) => ({ matches: queries.includes(query), media: query });
};

const originalMatchMedia = window.matchMedia;
afterEach(() => {
  window.matchMedia = originalMatchMedia;
});

const PHONE = ["(max-width: 900px)", "(pointer: coarse)", "(any-pointer: coarse)"];

describe("isTouchOnlyDevice", () => {
  it.each([
    ["a phone", PHONE, true],
    ["a narrow desktop window", ["(max-width: 900px)", "(pointer: fine)", "(any-pointer: fine)"], false],
    ["a touch laptop with a mouse", ["(max-width: 900px)", "(any-pointer: coarse)", "(any-pointer: fine)"], false],
    ["a wide tablet", ["(pointer: coarse)", "(any-pointer: coarse)"], false],
  ])("%s → %s", (_, queries, expected) => {
    matching(queries);
    expect(isTouchOnlyDevice()).toBe(expected);
  });
});

describe("applyTouchPolicy", () => {
  it("on a phone, pans with one finger and zooms with two, with mouse and keyboard gestures off", () => {
    matching(PHONE);
    const map = createFakeMap();
    map.dragPan.disable();

    expect(applyTouchPolicy(map)).toBe(true);
    expect(map.dragPan.isEnabled()).toBe(true);
    expect(map.touchZoomRotate.isEnabled()).toBe(true);
    expect(map.touchZoomRotate.isRotationEnabled()).toBe(false);
    ["scrollZoom", "doubleClickZoom", "boxZoom", "keyboard"].forEach((handler) =>
      expect(map[handler].isEnabled()).toBe(false)
    );
  });

  it("leaves other devices' maps as created", () => {
    matching([]);
    const map = createFakeMap();
    expect(applyTouchPolicy(map)).toBe(false);
    expect(map.scrollZoom.isEnabled()).toBe(true);
  });
});
