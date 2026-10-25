import { renderHook } from "@testing-library/react";
import { DockedLayoutContext } from "contexts/DockedLayoutContext";
import { makeSelectStyles } from "utils/selectStyles";
import { useDockedSelectOptions, DOCKED_SELECT_MIN_HEIGHT } from "./useDockedSelectOptions";

describe("useDockedSelectOptions", () => {
  it("keeps the default select styles outside the docked layout", () => {
    const { result } = renderHook(() => useDockedSelectOptions());

    expect(result.current).toBeUndefined();
    expect(makeSelectStyles({}, result.current).control({}, {}).minHeight).toBe(28);
  });

  it("gives 32px controls in the docked layout", () => {
    const wrapper = ({ children }) => (
      <DockedLayoutContext.Provider value={{ calloutSlot: null, setSelection: jest.fn() }}>
        {children}
      </DockedLayoutContext.Provider>
    );
    const { result } = renderHook(() => useDockedSelectOptions(), { wrapper });

    expect(result.current).toEqual({ minHeight: DOCKED_SELECT_MIN_HEIGHT });
    expect(makeSelectStyles({}, result.current).control({}, {}).minHeight).toBe(32);
  });
});
