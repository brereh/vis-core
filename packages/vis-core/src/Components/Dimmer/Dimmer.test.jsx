import { Dimmer } from "Components/Dimmer";
import { act, render, screen } from "@testing-library/react";

describe("Dimmer loader tester", () => {
  it("displays both the spinner and dimmed overlay when dimmed and showLoader are true", () => {
    render(<Dimmer dimmed={true} showLoader={true} />);
    // Check that the spinner is present
    const spinner = screen.getByRole("progressbar");
    expect(spinner).toBeInTheDocument();
    // Check that the overlay is present
    const overlay = screen.getByTestId("dimmed-overlay");
    expect(overlay).toBeInTheDocument();
  });

  it("displays only the dimmed overlay when dimmed is true but showLoader is false", () => {
    render(<Dimmer dimmed={true} showLoader={false} />);
    // Check that the spinner is not present
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
    // Check that the overlay is present
    const overlay = screen.getByTestId("dimmed-overlay");
    expect(overlay).toBeInTheDocument();
  });

  it("does not display anything when dimmed is false", () => {
    render(<Dimmer dimmed={false} showLoader={true} />);
    // Check that neither the spinner nor the overlay are present
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
    expect(screen.queryByTestId("dimmed-overlay")).not.toBeInTheDocument();
  });

  it("does not display anything when both dimmed and showLoader are false", () => {
    render(<Dimmer dimmed={false} showLoader={false} />);
    // Check that neither the spinner nor the overlay are present
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
    expect(screen.queryByTestId("dimmed-overlay")).not.toBeInTheDocument();
  });

  // Test to check the overlay styles
  it("renders the dimmed overlay with correct styles when displayed", () => {
    render(<Dimmer dimmed={true} showLoader={false} />);
    const overlay = screen.getByTestId("dimmed-overlay");
    expect(overlay).toHaveStyle({
      position: 'fixed',
      opacity: '0.5',
      backgroundColor: '#000',
      width: '100%',
      height: '100%',
      top: '0',
      left: '0'
    });
  });

  describe("after the first load", () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    const finishFirstLoad = () => {
      const view = render(<Dimmer dimmed showLoader />);
      view.rerender(<Dimmer dimmed={false} showLoader />);
      act(() => jest.advanceTimersByTime(400));
      return view;
    };

    it("shows nothing for a load quicker than the delay", () => {
      const { rerender } = finishFirstLoad();
      rerender(<Dimmer dimmed showLoader />);
      act(() => jest.advanceTimersByTime(200));
      rerender(<Dimmer dimmed={false} showLoader />);
      act(() => jest.advanceTimersByTime(1000));
      expect(screen.queryByRole("status")).not.toBeInTheDocument();
      expect(screen.queryByTestId("dimmed-overlay")).not.toBeInTheDocument();
    });

    it("shows a non-blocking pill, without the overlay, for a slower load", () => {
      const { rerender } = finishFirstLoad();
      rerender(<Dimmer dimmed showLoader />);
      act(() => jest.advanceTimersByTime(350));
      expect(screen.getByRole("status")).toHaveTextContent("Updating…");
      expect(screen.queryByTestId("dimmed-overlay")).not.toBeInTheDocument();
    });

    it("keeps a shown pill for the minimum time", () => {
      const { rerender } = finishFirstLoad();
      rerender(<Dimmer dimmed showLoader />);
      act(() => jest.advanceTimersByTime(350));
      rerender(<Dimmer dimmed={false} showLoader />);
      act(() => jest.advanceTimersByTime(100));
      expect(screen.getByRole("status")).toBeInTheDocument();
      act(() => jest.advanceTimersByTime(400));
      expect(screen.queryByRole("status")).not.toBeInTheDocument();
    });
  });
});
