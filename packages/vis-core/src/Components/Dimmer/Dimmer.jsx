import { useEffect, useMemo, useRef, useState } from "react";
import styled, { keyframes } from "styled-components";

const Dimmed = styled.div.attrs({ 'data-testid': 'dimmed-overlay' })`
  top: 0;
  left: 0;
  z-index: 999998;
  margin: 0;
  padding: 0;
  width: 100%;
  height: 100%;
  position: fixed; /* Covers the entire viewport */
  opacity: 0.5; /* Translucent background */
  background-color: #000;
`;

// Indeterminate progress: a segment slides across the track at a steady pace, so it never looks
// as if progress is going backwards.
const slide = keyframes`
  from {
    transform: translateX(-100%);
  }
  to {
    transform: translateX(250%);
  }
`;

const breathe = keyframes`
  0%, 100% { opacity: 0.45; }
  50% { opacity: 1; }
`;

const CenteredLoader = styled.div`
  position: fixed; /* Fixed to ensure it stays centered */
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  z-index: 999999;
  width: min(440px, calc(100vw - 32px));
`;

const LoaderCard = styled.div`
  border-radius: 12px;
  background: #ffffff;
  box-shadow: 0 10px 24px rgba(0, 0, 0, 0.18);
  padding: 16px;
`;

const LoaderHeading = styled.h3`
  margin: 0 0 8px;
  font-size: 1.05rem;
  font-weight: 700;
  color: #0d0f3d;
`;

const LoaderMessage = styled.p`
  margin: 0 0 10px;
  font-size: 0.94rem;
  color: #364153;
`;

const ProgressTrack = styled.div`
  width: 100%;
  height: 8px;
  border-radius: 999px;
  background: #efeff7;
  overflow: hidden;
`;

const ProgressFill = styled.div`
  width: 40%;
  height: 100%;
  border-radius: 999px;
  background: linear-gradient(90deg, #00dec6 0%, #0d0f3d 100%);
  animation: ${slide} 1.4s linear infinite;

  @media (prefers-reduced-motion: reduce) {
    width: 100%;
    animation: ${breathe} 2s ease-in-out infinite;
  }
`;

// Non-blocking indicator for reloads after the first: a small pill at the top of the window that
// leaves the page usable, instead of dimming everything.
const UpdatingPill = styled.div`
  position: fixed;
  top: calc(var(--app-navbar-height, 75px) + 12px);
  left: 50%;
  transform: translateX(-50%);
  z-index: 999999;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 12px;
  border-radius: 999px;
  background: #ffffff;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.18);
  font-size: 0.85rem;
  color: #0d0f3d;
  pointer-events: none;
`;

const PillTrack = styled(ProgressTrack)`
  width: 64px;
  height: 4px;
`;

/**
 * Dimmer shows that a page is loading, without getting in the way more than it needs to.
 *
 * - The first load after mount blocks: a dimming overlay and a centred loader card, shown at once.
 * - Later loads (a filter change, a layer refresh) don't block: a small "Updating" pill at the top
 *   of the window, with no overlay, so the page stays usable.
 * - A later load only shows anything if it takes longer than `showDelay`, and once shown stays at
 *   least `minVisible`, so quick loads don't flash and slow ones don't flicker.
 *
 * @component
 * @property {boolean} dimmed - Whether the page is loading.
 * @property {boolean} showLoader - Whether to show the loader card (first load) or pill (later loads).
 * @property {string} [statusHeading] - Heading on the first-load card.
 * @property {string[]} [statusMessages] - Messages that rotate on the first-load card.
 * @property {number} [showDelay=300] - Milliseconds a later load must last before it shows.
 * @property {number} [minVisible=400] - Milliseconds a shown indicator stays at least.
 * @property {string} [updatingText="Updating…"] - Text in the later-load pill.
 * @returns {JSX.Element|null} The overlay, the pill, or null.
 */
export const Dimmer = ({
  dimmed,
  showLoader,
  statusHeading = "Loading map data",
  statusMessages = [
    "Preparing your map view...",
    "Almost there, thanks for waiting.",
    "Finalising layers and styles...",
  ],
  showDelay = 300,
  minVisible = 400,
  updatingText = "Updating…",
}) => {
  const safeMessages = useMemo(
    () => (Array.isArray(statusMessages) && statusMessages.length > 0
      ? statusMessages
      : ["Almost there, thanks for waiting."]),
    [statusMessages]
  );
  const [messageIndex, setMessageIndex] = useState(0);

  // The first load blocks; once a load has finished, later ones don't.
  const [hasLoadedOnce, setHasLoadedOnce] = useState(!dimmed);
  // What is on screen, which lags `dimmed` by showDelay (later loads) and minVisible.
  const [visible, setVisible] = useState(Boolean(dimmed));
  const shownAtRef = useRef(dimmed ? Date.now() : 0);

  useEffect(() => {
    let timer;
    if (dimmed && !visible) {
      const delay = hasLoadedOnce ? showDelay : 0;
      timer = setTimeout(() => {
        shownAtRef.current = Date.now();
        setVisible(true);
      }, delay);
    } else if (!dimmed && visible) {
      const remaining = Math.max(0, minVisible - (Date.now() - shownAtRef.current));
      timer = setTimeout(() => {
        setVisible(false);
        setHasLoadedOnce(true);
      }, remaining);
    } else if (!dimmed && !hasLoadedOnce) {
      setHasLoadedOnce(true);
    }
    return () => clearTimeout(timer);
  }, [dimmed, visible, hasLoadedOnce, showDelay, minVisible]);

  const blocking = !hasLoadedOnce;

  useEffect(() => {
    if (!visible || !blocking || !showLoader || safeMessages.length < 2) return undefined;

    const intervalId = setInterval(() => {
      setMessageIndex((prev) => (prev + 1) % safeMessages.length);
    }, 1800);

    return () => clearInterval(intervalId);
  }, [visible, blocking, showLoader, safeMessages]);

  useEffect(() => {
    if (!visible) {
      setMessageIndex(0);
    }
  }, [visible]);

  if (!visible) {
    return null;
  }

  if (!blocking) {
    return showLoader ? (
      <UpdatingPill role="status" aria-live="polite">
        {updatingText}
        <PillTrack>
          <ProgressFill role="progressbar" aria-valuetext={updatingText} />
        </PillTrack>
      </UpdatingPill>
    ) : null;
  }

  const currentMessage = safeMessages[Math.min(messageIndex, safeMessages.length - 1)];

  return (
    <>
      {showLoader ? (
        <CenteredLoader role="status" aria-live="polite">
          <LoaderCard>
            <LoaderHeading>{statusHeading}</LoaderHeading>
            <LoaderMessage>{currentMessage}</LoaderMessage>
            <ProgressTrack>
              <ProgressFill role="progressbar" aria-valuetext={currentMessage} />
            </ProgressTrack>
          </LoaderCard>
        </CenteredLoader>
      ) : null}
      <Dimmed />
    </>
  );
};
