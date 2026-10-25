import { useDockedLayoutContext } from "contexts/DockedLayoutContext";

// Denser react-select controls in the docked map layout's filter column.
export const DOCKED_SELECT_MIN_HEIGHT = 32;

/**
 * Extra `makeSelectStyles` options for selects in the docked filter column.
 *
 * @returns {Object|undefined} `{ minHeight }` when docked, otherwise undefined (keep defaults).
 */
export const useDockedSelectOptions = () =>
  useDockedLayoutContext() != null ? { minHeight: DOCKED_SELECT_MIN_HEIGHT } : undefined;
