import { useDockedLayoutContext } from "contexts/DockedLayoutContext";

// Denser react-select controls in the docked map layout's filter column.
export const DOCKED_SELECT_MIN_HEIGHT = 32;

// One shared object, so the selects' useMemo'd styles aren't rebuilt on every render.
const DOCKED_SELECT_OPTIONS = Object.freeze({ minHeight: DOCKED_SELECT_MIN_HEIGHT });

/**
 * Extra `makeSelectStyles` options for selects in the docked filter column.
 *
 * @returns {Object|undefined} `{ minHeight }` when docked, otherwise undefined (keep defaults).
 */
export const useDockedSelectOptions = () =>
  useDockedLayoutContext() != null ? DOCKED_SELECT_OPTIONS : undefined;
