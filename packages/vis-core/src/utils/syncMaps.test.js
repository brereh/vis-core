import { syncMaps } from "utils/syncMaps";
import { createFakeMap } from "testing/mapLibreFake";

// The fake fires "move" on every camera change, as MapLibre does, so the loop guard in
// syncMaps is exercised for real.
const createSyncableMaps = (count) =>
  Array.from({ length: count }, (_, i) => createFakeMap({ name: `map${i}` }));

const moveTo = (map, view) => {
  map.jumpTo(view);
};

describe("syncMaps", () => {
  it("moves the other map to the camera of the one that moved", () => {
    const [left, right] = createSyncableMaps(2);
    syncMaps(left, right);

    moveTo(left, { center: [-1.5, 53.8], zoom: 9, bearing: 15, pitch: 30 });

    expect(right.inspect().camera).toEqual({
      center: { lng: -1.5, lat: 53.8 },
      zoom: 9,
      bearing: 15,
      pitch: 30,
    });
  });

  it("syncs in either direction", () => {
    const [left, right] = createSyncableMaps(2);
    syncMaps(left, right);

    moveTo(right, { center: [2, 3], zoom: 4 });
    expect(left.getCenter()).toEqual({ lng: 2, lat: 3 });
    expect(left.getZoom()).toBe(4);
  });

  it("keeps any number of maps together, given as an array", () => {
    const maps = createSyncableMaps(4);
    syncMaps(maps);

    moveTo(maps[2], { center: [5, 6], zoom: 7 });
    maps.forEach((map) => {
      expect(map.getCenter()).toEqual({ lng: 5, lat: 6 });
      expect(map.getZoom()).toBe(7);
    });
  });

  it("does not echo a move back to the map that started it", () => {
    const [left, right] = createSyncableMaps(2);
    syncMaps(left, right);
    left.jumpTo.mockClear();
    right.jumpTo.mockClear();

    left.fire("move");

    // The other map is moved once; the move it fires in turn is not sent back.
    expect(right.jumpTo).toHaveBeenCalledTimes(1);
    expect(left.jumpTo).not.toHaveBeenCalled();
  });

  it("stops syncing, and removes its listeners, once the returned function is called", () => {
    const [left, right] = createSyncableMaps(2);
    const unsync = syncMaps(left, right);
    expect(left.listenerCount("move")).toBe(1);
    expect(right.listenerCount("move")).toBe(1);

    unsync();

    expect(left.listenerCount("move")).toBe(0);
    expect(right.listenerCount("move")).toBe(0);
    moveTo(left, { center: [9, 9], zoom: 12 });
    expect(right.getCenter()).toEqual({ lng: 0, lat: 0 });
  });
});
