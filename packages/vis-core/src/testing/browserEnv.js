/**
 * Browser APIs the map code reads that jsdom lacks or can't vary, installed for one test file.
 *
 * Call `useMapBrowserEnv()` at the top level of a test file. Before each test it installs:
 * - `window.matchMedia`, answering `false` to every query unless `matches` says otherwise
 *   (e.g. `useMapBrowserEnv({ matches: (query) => query.includes("hover: none") })`);
 * - `ResizeObserver`, as a no-op;
 * - optionally (`immediateAnimationFrames: true`), `requestAnimationFrame` running the
 *   callback straight away, so coalesced hover passes happen inside the triggering event.
 *
 * After each test it puts the originals back.
 */
export function useMapBrowserEnv({ matches = () => false, immediateAnimationFrames = false } = {}) {
  const originals = {};

  beforeEach(() => {
    originals.matchMedia = window.matchMedia;
    originals.ResizeObserver = global.ResizeObserver;
    originals.requestAnimationFrame = window.requestAnimationFrame;
    originals.cancelAnimationFrame = window.cancelAnimationFrame;

    window.matchMedia = (query) => ({
      matches: Boolean(matches(query)),
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    });
    global.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
    if (immediateAnimationFrames) {
      window.requestAnimationFrame = (callback) => {
        callback();
        return 1;
      };
      window.cancelAnimationFrame = () => {};
    }
  });

  afterEach(() => {
    window.matchMedia = originals.matchMedia;
    global.ResizeObserver = originals.ResizeObserver;
    window.requestAnimationFrame = originals.requestAnimationFrame;
    window.cancelAnimationFrame = originals.cancelAnimationFrame;
  });
}
