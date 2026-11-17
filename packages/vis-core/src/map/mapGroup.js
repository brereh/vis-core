/**
 * The maps on one page and how they work together.
 *
 * Panes in the same sync group move together (camera sync) and share pointer events: hovering
 * or clicking one pane is replayed on the others at the same location, so each shows its own
 * tooltip or popup for what is there on its own map. A pane with no sync group (`null`) is on
 * its own. The group also remembers each pane's map-click selection, so the next click can
 * clear it.
 *
 * Plain JavaScript, independent of React: MapGroupContext provides one per page.
 */
import { syncMaps } from "utils/syncMaps";

/**
 * @returns {{
 *   register: Function, broadcast: Function, mapsInGroupOf: Function, panesInGroupOf: Function,
 *   selection: Function, setSelection: Function, destroy: Function
 * }}
 */
export function createMapGroup() {
  const panes = new Map();
  const selections = new Map();
  let unsyncs = [];

  const resync = () => {
    unsyncs.forEach((unsync) => unsync());
    unsyncs = [];
    const byGroup = new Map();
    panes.forEach(({ map, syncGroup }) => {
      if (syncGroup == null || !map) return;
      if (!byGroup.has(syncGroup)) byGroup.set(syncGroup, []);
      byGroup.get(syncGroup).push(map);
    });
    byGroup.forEach((maps) => {
      if (maps.length > 1) unsyncs.push(syncMaps(maps));
    });
  };

  const membersOf = (paneId) => {
    const pane = panes.get(paneId);
    if (!pane) return [];
    if (pane.syncGroup == null) return [[paneId, pane]];
    return [...panes.entries()].filter(([, other]) => other.syncGroup === pane.syncGroup);
  };

  return {
    /**
     * Adds a pane's map to the page.
     *
     * @param {string} paneId
     * @param {Object} entry
     * @param {Object} entry.map - The pane's MapLibre map.
     * @param {string|null} entry.syncGroup
     * @param {(event: Object) => void} entry.onEvent - Receives events broadcast to the pane.
     * @returns {() => void} Removes the pane again (unless another map has replaced it).
     */
    register(paneId, { map, syncGroup, onEvent }) {
      panes.set(paneId, { map, syncGroup, onEvent });
      resync();
      return () => {
        if (panes.get(paneId)?.map !== map) return;
        panes.delete(paneId);
        selections.delete(paneId);
        resync();
      };
    },

    /**
     * Sends an event to every pane in the source pane's sync group, the source included (just
     * the source if it has no sync group). Each pane receives it with `sourcePaneId` set.
     *
     * @param {string} sourcePaneId
     * @param {Object} event
     */
    broadcast(sourcePaneId, event) {
      membersOf(sourcePaneId).forEach(([, pane]) => pane.onEvent?.({ ...event, sourcePaneId }));
    },

    /**
     * The maps of the panes in a pane's sync group, by pane id (the pane alone if it has no
     * sync group).
     *
     * @param {string} paneId
     * @returns {Object<string, Object>}
     */
    mapsInGroupOf(paneId) {
      return Object.fromEntries(membersOf(paneId).map(([id, pane]) => [id, pane.map]));
    },

    /** Ids of the panes in a pane's sync group. */
    panesInGroupOf(paneId) {
      return membersOf(paneId).map(([id]) => id);
    },

    /** A pane's current map-click selection (its feature-state target), if any. */
    selection(paneId) {
      return selections.get(paneId) ?? null;
    },

    /** Records a pane's map-click selection. */
    setSelection(paneId, target) {
      if (target) selections.set(paneId, target);
      else selections.delete(paneId);
    },

    /** Stops syncing cameras and forgets every pane. */
    destroy() {
      unsyncs.forEach((unsync) => unsync());
      unsyncs = [];
      panes.clear();
      selections.clear();
    },
  };
}
