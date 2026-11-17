import React, { createContext, useContext, useEffect, useMemo } from "react";
import { createMapGroup } from "../../map/mapGroup";

const MapGroupContext = createContext(null);

/**
 * Provides the page's map group (see map/mapGroup.js) to its panes.
 *
 * @param {Object} props
 * @param {React.ReactNode} props.children
 */
export function MapGroupProvider({ children }) {
  const group = useMemo(() => createMapGroup(), []);
  useEffect(() => () => group.destroy(), [group]);
  return <MapGroupContext.Provider value={group}>{children}</MapGroupContext.Provider>;
}

/**
 * The page's map group. A pane rendered outside a provider gets a group of its own, so it
 * still works alone.
 *
 * @returns {ReturnType<typeof createMapGroup>}
 */
export function useMapGroup() {
  const shared = useContext(MapGroupContext);
  const own = useMemo(() => (shared ? null : createMapGroup()), [shared]);
  useEffect(() => () => own?.destroy(), [own]);
  return shared ?? own;
}
