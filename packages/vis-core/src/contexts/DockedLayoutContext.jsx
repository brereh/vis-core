import { createContext, useContext } from "react";

/**
 * Shares the docked map layout's right-hand column with the components that
 * render callout cards deep inside the map.
 *
 * Outside a docked layout the value is `null`, so consumers keep their default
 * (overlay) behaviour.
 *
 * Shape when docked:
 * {
 *   calloutSlot: HTMLElement|null,
 *   setSelection: ({ hasSelection: boolean, announcement: string }) => void,
 * }
 */
export const DockedLayoutContext = createContext(null);

export const useDockedLayoutContext = () => useContext(DockedLayoutContext);
