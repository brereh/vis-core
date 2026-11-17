import { createMapGroup } from "./mapGroup";
import { createFakeMap } from "testing/mapLibreFake";

let group;
beforeEach(() => {
  group = createMapGroup();
});
afterEach(() => group.destroy());

const pane = (syncGroup = "default") => ({ map: createFakeMap(), syncGroup, onEvent: jest.fn() });

describe("createMapGroup", () => {
  it("syncs the cameras of panes in the same group, and stops when one leaves", () => {
    const left = pane();
    const right = pane();
    group.register("left", left);
    const unregisterRight = group.register("right", right);

    left.map.jumpTo({ center: [1, 2], zoom: 9 });
    expect(right.map.getCenter()).toEqual({ lng: 1, lat: 2 });

    unregisterRight();
    left.map.jumpTo({ center: [3, 4] });
    expect(right.map.getCenter()).toEqual({ lng: 1, lat: 2 });
  });

  it("leaves a pane without a sync group alone", () => {
    const left = pane();
    const loner = pane(null);
    group.register("left", left);
    group.register("loner", loner);
    left.map.jumpTo({ center: [1, 2] });
    expect(loner.map.getCenter()).toEqual({ lng: 0, lat: 0 });
  });

  it("broadcasts events to the source's sync group, source included", () => {
    const left = pane();
    const right = pane();
    const loner = pane(null);
    group.register("left", left);
    group.register("right", right);
    group.register("loner", loner);

    group.broadcast("right", { type: "hover" });
    expect(left.onEvent).toHaveBeenCalledWith({ type: "hover", sourcePaneId: "right" });
    expect(right.onEvent).toHaveBeenCalledWith({ type: "hover", sourcePaneId: "right" });
    expect(loner.onEvent).not.toHaveBeenCalled();

    group.broadcast("loner", { type: "leave" });
    expect(loner.onEvent).toHaveBeenCalledTimes(1);
    expect(left.onEvent).toHaveBeenCalledTimes(1);
  });

  it("lists a pane's group and its maps", () => {
    const left = pane();
    const right = pane();
    group.register("left", left);
    group.register("right", right);
    group.register("loner", pane(null));
    expect(group.panesInGroupOf("left")).toEqual(["left", "right"]);
    expect(group.mapsInGroupOf("right")).toEqual({ left: left.map, right: right.map });
    expect(group.panesInGroupOf("loner")).toEqual(["loner"]);
    expect(group.panesInGroupOf("nowhere")).toEqual([]);
  });

  it("ignores an unregister from a map that has been replaced", () => {
    const first = pane();
    const unregister = group.register("left", first);
    const second = pane();
    group.register("left", second);
    unregister();
    expect(group.mapsInGroupOf("left")).toEqual({ left: second.map });
  });

  it("keeps a selection per pane", () => {
    group.setSelection("left", { id: 1 });
    expect(group.selection("left")).toEqual({ id: 1 });
    group.setSelection("left", null);
    expect(group.selection("left")).toBeNull();
  });
});
