import { useMapBrowserEnv } from "testing/browserEnv";

describe("useMapBrowserEnv", () => {
  const hadResizeObserver = "ResizeObserver" in window;
  const originalRaf = window.requestAnimationFrame;

  describe("while installed", () => {
    useMapBrowserEnv({ matches: (query) => query === "(hover: none)", immediateAnimationFrames: true });

    it("answers media queries as configured", () => {
      expect(window.matchMedia("(hover: none)").matches).toBe(true);
      expect(window.matchMedia("(pointer: fine)").matches).toBe(false);
    });

    it("provides ResizeObserver and immediate animation frames", () => {
      expect(() => new ResizeObserver(() => {}).observe(document.body)).not.toThrow();
      const callback = jest.fn();
      window.requestAnimationFrame(callback);
      expect(callback).toHaveBeenCalled();
    });
  });

  describe("afterwards", () => {
    it("restores the globals, leaving missing ones missing", () => {
      expect("ResizeObserver" in window).toBe(hadResizeObserver);
      expect(window.requestAnimationFrame).toBe(originalRaf);
    });
  });
});
