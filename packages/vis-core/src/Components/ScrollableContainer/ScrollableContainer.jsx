import styled from "styled-components";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { AccordionIcon } from "Components/Sidebar/Accordion/AccordionSection";
import { MobileBar } from "Components/MobileBar/MobileBar";
import { useDockedLayoutContext } from "contexts/DockedLayoutContext";

import { CARD_CONSTANTS, defaultBgColour } from "defaults";

const { PADDING } = CARD_CONSTANTS;

const MOBILE_Q = "(max-width: 900px)";
const EMPTY_UPDATED_CARD_NAMES = [];
const EMPTY_UPDATED_CARD_EXPIRIES = {};
const UPDATE_MARKER_TIMEOUT_MS = 2800;

/**
 * Resolves the mobile media query from theme when supplied, with a local fallback.
 *
 * @param {Object} p - Styled-component props.
 * @returns {string} CSS media query.
 */
const mobileMQ = (p) => p.theme?.mq?.mobile || MOBILE_Q;

const StackWrapper = styled.div`
  position: absolute;
  right: 0;
  display: ${({ $hidden }) => ($hidden ? "none" : "flex")};
  flex-direction: column;
  align-items: flex-end;
  z-index: 1000;
  width: fit-content;
  pointer-events: none;

  @media ${mobileMQ} {
    position: static;
    right: auto;
    align-items: stretch;
    width: 100%;
  }
`;

const StyledScrollableContainer = styled.div`
  position: relative;
  display: ${({ $hidden }) => ($hidden ? "none" : "flex")};
  flex-direction: column;
  align-items: flex-end;
  padding: ${PADDING}px;
  gap: ${PADDING}px;
  scrollbar-width: thin;
  z-index: 1000;
  max-height: 50vh;
  overflow-y: auto;
  overflow-x: hidden;
  width: fit-content;
  transition: transform 0.3s ease-in-out;
  pointer-events: auto;

  @media ${mobileMQ} {
    position: static;
    right: auto;
    align-items: stretch;
    width: 100%;
    box-sizing: border-box;

    max-height: ${({ $open }) => ($open ? "60vh" : "0")};
    overflow-y: ${({ $open }) => ($open ? "auto" : "hidden")};
    overflow-x: hidden;
    padding: ${({ $open }) => ($open ? `${PADDING}px` : "0")};
    gap: ${({ $open }) => ($open ? `${PADDING}px` : "0")};
    box-shadow: none;
    border-radius: 0;
    background: #fff;

    & > * {
      width: 100% !important;
    }
  }
`;

/**
 * Docked layout: cards stack full width inside the fixed right-hand column,
 * always open, with no slide-over handle.
 */
const DockedStack = styled.div`
  display: ${({ $hidden }) => ($hidden ? "none" : "flex")};
  flex-direction: column;
  gap: ${PADDING}px;
  width: 100%;

  & > *,
  & [data-callout-card-name] > :first-child {
    width: 100%;
    box-sizing: border-box;
  }

  & [data-callout-card-name] > :first-child {
    box-shadow: none;
    border: 1px solid var(--palette-mid-grey);
  }
`;

/**
 * Wrapper for the overflow hint pill rendered outside the scrollable card list,
 * preventing it from covering card content.
 */
const OverflowHintWrap = styled.div`
  display: ${({ $visible }) => ($visible ? "flex" : "none")};
  justify-content: center;
  align-self: center;
  width: 100%;
  padding: 4px 0 8px 0;
  z-index: 1001;
  pointer-events: none;

  @media ${mobileMQ} {
    padding: 6px 0;
  }
`;

const OverflowHint = styled.button`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;

  width: auto;
  min-width: 148px;
  max-width: min(260px, calc(100% - 32px));

  padding: 7px 14px;

  border: 0;
  border-radius: 999px;
  background: ${({ theme }) => theme?.primary || defaultBgColour};
  color: #fff;

  font-family: inherit;
  font-size: 0.76rem;
  font-weight: 800;
  line-height: 1;

  cursor: pointer;
  pointer-events: auto;

  box-shadow:
    0 5px 14px rgba(13, 15, 61, 0.28),
    0 1px 3px rgba(13, 15, 61, 0.2);

  transition:
    transform 140ms ease,
    background-color 140ms ease,
    box-shadow 140ms ease,
    opacity 140ms ease;

  &:hover {
    transform: translateY(-1px);
    background: ${({ theme }) => theme?.primary || defaultBgColour};
    box-shadow:
      0 8px 18px rgba(13, 15, 61, 0.34),
      0 2px 5px rgba(13, 15, 61, 0.24);
  }

  &:active {
    transform: translateY(0);
    box-shadow:
      0 4px 10px rgba(13, 15, 61, 0.3),
      0 1px 3px rgba(13, 15, 61, 0.2);
  }

  &:focus-visible {
    outline: 2px solid #fff;
    outline-offset: 3px;
  }
`;

const OverflowText = styled.span`
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const OverflowDot = styled.span`
  width: 7px;
  height: 7px;
  border-radius: 50%;
  flex: 0 0 auto;

  background: ${({ $hasUpdates }) => ($hasUpdates ? "#00dec6" : "#fff")};
  box-shadow: ${({ $hasUpdates }) =>
    $hasUpdates ? "0 0 0 4px rgba(0, 222, 198, 0.22)" : "none"};
`;

const Chevron = styled.span`
  width: 6px;
  height: 6px;
  flex: 0 0 auto;

  border-right: 2px solid currentColor;
  border-bottom: 2px solid currentColor;

  transform: ${({ $direction }) =>
    $direction === "up" ? "rotate(225deg)" : "rotate(45deg)"};

  margin-top: ${({ $direction }) => ($direction === "up" ? "3px" : "-3px")};
`;

/**
 * Converts supported updated-card inputs into an array for rendering and lookup.
 *
 * @param {string[]|Set<string>} updatedCardNames - Updated card identifiers.
 * @returns {string[]} Normalised card identifiers.
 */
const normaliseUpdatedNames = (updatedCardNames) => {
  if (!updatedCardNames) return [];
  if (updatedCardNames instanceof Set) return [...updatedCardNames];
  if (Array.isArray(updatedCardNames)) return updatedCardNames;
  return [];
};

/**
 * ScrollableContainer component to wrap visualisation cards.
 *
 * Behaviour:
 * - Owns the only scroll surface for callout cards.
 * - Shows a compact centred pill when:
 *   - cards have updated;
 *   - a card is fully above the visible scroll area;
 *   - a card is fully below the visible scroll area.
 *
 * @param {Object} props
 * @param {React.ReactNode} props.children
 * @param {string} [props.mobileTitle='Summary']
 * @param {string} [props.mobileBarColor]
 * @param {boolean} [props.hideCardHandleOnMobile=true]
 * @param {boolean} [props.showOnMobile=true]
 * @param {string[]|Set<string>} [props.updatedCardNames=[]]
 * @param {Object<string, number>} [props.updatedCardExpiresAtByName] - Fixed auto-clear expiry times by card name.
 * @param {Function} [props.onUpdatedCardSeen]
 * @param {Function} [props.onUpdatedCardsClicked]
 * @param {Function} [props.onOverflowHintClick]
 * @returns {JSX.Element|null}
 */
export const ScrollableContainer = ({
  children,
  mobileTitle = "Summary",
  mobileBarColor,
  hideCardHandleOnMobile = true,
  showOnMobile = true,
  updatedCardNames = EMPTY_UPDATED_CARD_NAMES,
  updatedCardExpiresAtByName = EMPTY_UPDATED_CARD_EXPIRIES,
  onUpdatedCardSeen,
  onUpdatedCardsClicked,
  onOverflowHintClick,
}) => {
  const initialIsMobile =
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia(MOBILE_Q).matches;

  const [isMobile, setIsMobile] = useState(initialIsMobile);
  const [open, setOpen] = useState(!initialIsMobile);
  const [mobilePortalSlot, setMobilePortalSlot] = useState(null);
  const dockedSlot = useDockedLayoutContext()?.calloutSlot ?? null;

  useEffect(() => {
    if (!isMobile) {
      setMobilePortalSlot(null);
      return;
    }
    if (typeof document === "undefined") return;
    setMobilePortalSlot(document.getElementById("mobile-cards-slot"));
  }, [isMobile]);

  const scrollRef = useRef(null);
  const updatedSeenTimerRef = useRef(null);

  const updatedNames = useMemo(
    () => normaliseUpdatedNames(updatedCardNames).filter(Boolean),
    [updatedCardNames]
  );

  const [overflowState, setOverflowState] = useState({
    canScroll: false,
    canScrollUp: false,
    canScrollDown: false,
  });

  const [firstUpdatedCardName, setFirstUpdatedCardName] = useState(null);

  /**
   * Clears the delayed "updated card seen" acknowledgement timer.
   */
  const clearUpdatedSeenTimer = useCallback(() => {
    if (updatedSeenTimerRef.current) {
      clearTimeout(updatedSeenTimerRef.current);
      updatedSeenTimerRef.current = null;
    }
  }, []);

  /**
   * Finds a rendered callout card in the scroll stack by its visualisation name.
   *
   * @param {string} name - Card/visualisation identifier.
   * @returns {HTMLElement|null} Matching card element, if rendered.
   */
  const getCardElementByName = useCallback((name) => {
    const container = scrollRef.current;
    if (!container || !name) return null;

    const cards = container.querySelectorAll("[data-callout-card-name]");

    return [...cards].find(
      (card) => card.getAttribute("data-callout-card-name") === name
    );
  }, []);

  /**
   * Resolves the first updated card and its DOM element when available.
   *
   * @returns {{name: string|null, element: HTMLElement|null}} Updated card lookup result.
   */
  const getFirstUpdatedCardElement = useCallback(() => {
    for (const name of updatedNames) {
      const element = getCardElementByName(name);
      if (element) return { name, element };
    }

    return {
      name: updatedNames[0] ?? null,
      element: null,
    };
  }, [updatedNames, getCardElementByName]);

  /**
   * Checks whether any part of an element intersects the visible stack viewport.
   *
   * @param {HTMLElement|null} element - Card element to inspect.
   * @returns {boolean} True when the element is at least partly visible.
   */
  const isElementInScrollView = useCallback((element) => {
    const container = scrollRef.current;
    if (!container || !element) return false;

    const containerRect = container.getBoundingClientRect();
    const elementRect = element.getBoundingClientRect();

    return (
      elementRect.bottom > containerRect.top &&
      elementRect.top < containerRect.bottom
    );
  }, []);

  /**
   * Only report overflow when another callout card is completely outside the
   * visible area. A merely clipped/partially visible card no longer counts.
   *
   * @returns {{canScroll: boolean, canScrollUp: boolean, canScrollDown: boolean}} Overflow state.
   */
  const getCardOverflowState = useCallback(() => {
    const container = scrollRef.current;

    if (!container) {
      return {
        canScroll: false,
        canScrollUp: false,
        canScrollDown: false,
      };
    }

    const threshold = 2;
    const canScroll = container.scrollHeight > container.clientHeight + threshold;

    if (!canScroll) {
      return {
        canScroll: false,
        canScrollUp: false,
        canScrollDown: false,
      };
    }

    const containerRect = container.getBoundingClientRect();

    const cards = Array.from(
      container.querySelectorAll("[data-callout-card-name]")
    );

    const hasFullyHiddenCardAbove = cards.some((card) => {
      const rect = card.getBoundingClientRect();
      return rect.bottom <= containerRect.top + threshold;
    });

    const hasFullyHiddenCardBelow = cards.some((card) => {
      const rect = card.getBoundingClientRect();
      return rect.top >= containerRect.bottom - threshold;
    });

    return {
      canScroll,
      canScrollUp: hasFullyHiddenCardAbove,
      canScrollDown: hasFullyHiddenCardBelow,
    };
  }, []);

  /**
   * Scrolls within the callout stack only. Avoids browser scrollIntoView()
   * bubbling up and scrolling the page/map layout.
   *
   * @param {HTMLElement|null} cardElement - Card to centre in the stack.
   */
  const scrollCardIntoView = useCallback((cardElement) => {
    const container = scrollRef.current;
    if (!container || !cardElement) return;

    const containerRect = container.getBoundingClientRect();
    const cardRect = cardElement.getBoundingClientRect();

    const cardTopWithinContainer =
      cardRect.top - containerRect.top + container.scrollTop;

    const targetTop =
      cardTopWithinContainer -
      container.clientHeight / 2 +
      cardElement.offsetHeight / 2;

    container.scrollTo({
      top: Math.max(0, targetTop),
      behavior: "smooth",
    });
  }, []);

  /**
   * Opens a collapsed callout card before scrolling to it.
   *
   * @param {HTMLElement|null} cardElement - Card element to open.
   */
  const openCardIfClosed = useCallback((cardElement) => {
    if (!cardElement) return;

    const isOpen = cardElement.getAttribute("data-callout-card-open") === "true";
    if (isOpen) return;

    const toggleButton = cardElement.querySelector("[data-callout-card-toggle]");
    if (toggleButton instanceof HTMLElement) {
      toggleButton.click();
    }
  }, []);

  /**
   * Tracks the first updated card and schedules acknowledgement when it is both
   * open and visible to the user.
   */
  const evaluateUpdatedCardVisibility = useCallback(() => {
    clearUpdatedSeenTimer();

    if (updatedNames.length === 0) {
      setFirstUpdatedCardName(null);
      return;
    }

    const { name, element } = getFirstUpdatedCardElement();
    setFirstUpdatedCardName(name);

    if (!name || !element) return;

    const isOpen = element.getAttribute("data-callout-card-open") === "true";
    const isInView = isElementInScrollView(element);

    /**
     * Keep the marker if the updated card is out of view or collapsed. If it is
     * open and visible, clear when the card-level marker reaches the same expiry.
     */
    if (isOpen && isInView) {
      const autoClearAt = updatedCardExpiresAtByName[name];
      const timeoutMs =
        typeof autoClearAt === "number"
          ? Math.max(0, autoClearAt - Date.now())
          : UPDATE_MARKER_TIMEOUT_MS;

      updatedSeenTimerRef.current = setTimeout(() => {
        const currentElement = getCardElementByName(name);
        const isStillOpen =
          currentElement?.getAttribute("data-callout-card-open") === "true";

        if (isStillOpen && isElementInScrollView(currentElement)) {
          onUpdatedCardSeen?.(name);
        }
      }, timeoutMs);
    }
  }, [
    clearUpdatedSeenTimer,
    getCardElementByName,
    getFirstUpdatedCardElement,
    isElementInScrollView,
    onUpdatedCardSeen,
    updatedCardExpiresAtByName,
    updatedNames,
  ]);

  /**
   * Tracks mobile breakpoint changes and keeps desktop stacks open.
   */
  useEffect(() => {
    if (
      typeof window === "undefined" ||
      typeof window.matchMedia !== "function"
    ) {
      return undefined;
    }

    const mql = window.matchMedia(MOBILE_Q);

    /**
     * Applies a media-query change event to local mobile/open state.
     *
     * @param {MediaQueryList|MediaQueryListEvent} event - Current media query state.
     */
    const onChange = (event) => {
      setIsMobile(event.matches);
      if (!event.matches) setOpen(true);
    };

    onChange(mql);
    mql.addEventListener("change", onChange);

    return () => {
      mql.removeEventListener("change", onChange);
    };
  }, []);

  /**
   * Reopens the mobile summary automatically when cards become available again.
   */
  useEffect(() => {
    if (isMobile && showOnMobile) setOpen(true);
  }, [isMobile, showOnMobile]);

  /**
   * Recomputes overflow and update visibility on scroll, resize, content, and
   * open-state changes.
   */
  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return undefined;

    /**
     * Refreshes overflow direction and updated-card visibility state.
     */
    const updateOverflowState = () => {
      setOverflowState(getCardOverflowState());
      evaluateUpdatedCardVisibility();
    };

    updateOverflowState();

    element.addEventListener("scroll", updateOverflowState, { passive: true });

    let resizeObserver;
    if (typeof ResizeObserver !== "undefined") {
      resizeObserver = new ResizeObserver(updateOverflowState);
      resizeObserver.observe(element);
    }

    window.addEventListener("resize", updateOverflowState);

    return () => {
      element.removeEventListener("scroll", updateOverflowState);
      resizeObserver?.disconnect();
      window.removeEventListener("resize", updateOverflowState);
    };
  }, [
    children,
    open,
    isMobile,
    showOnMobile,
    evaluateUpdatedCardVisibility,
    getCardOverflowState,
  ]);

  /**
   * Re-evaluates updated-card visibility when the updated-card list changes and
   * clears pending timers on cleanup.
   */
  useEffect(() => {
    evaluateUpdatedCardVisibility();

    return () => {
      clearUpdatedSeenTimer();
    };
  }, [evaluateUpdatedCardVisibility, clearUpdatedSeenTimer]);

  const hasChildren = React.Children.toArray(children).some(Boolean);
  if (!hasChildren) return null;

  const hidden = isMobile && !showOnMobile;
  const hasUpdatedCards = updatedNames.length > 0;

  const overflowDirection = overflowState.canScrollDown
    ? "down"
    : overflowState.canScrollUp
    ? "up"
    : null;

  /**
   * Builds the stack hint label from updated-card state before ordinary overflow.
   *
   * @returns {string} Button text for the stack hint.
   */
  const overflowHintText = (() => {
    if (hasUpdatedCards) {
      return `${updatedNames.length} card${
        updatedNames.length === 1 ? "" : "s"
      } updated`;
    }

    if (overflowState.canScrollDown) return "More cards below";
    if (overflowState.canScrollUp) return "More cards above";
    return "";
  })();

  const shouldShowOverflowHint =
    hasUpdatedCards ||
    (overflowState.canScroll &&
      (overflowState.canScrollDown || overflowState.canScrollUp));

  /**
   * Handles the stack hint click, prioritising updated-card navigation before
   * ordinary up/down overflow scrolling.
   */
  const handleOverflowHintClick = () => {
    const container = scrollRef.current;
    if (!container) return;

    if (hasUpdatedCards) {
      const { name, element: cardElement } = getFirstUpdatedCardElement();

      if (cardElement) {
        openCardIfClosed(cardElement);

        /*
        * Wait a tick so the card can begin opening before we centre it.
        * This avoids scrolling to the collapsed shell and then expanding off-position.
        */
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            scrollCardIntoView(cardElement);
          });
        });
      }

      /*
      * Requirement:
      * As soon as "card(s) updated" is clicked, reset the stack-level marker.
      */
      if (typeof onUpdatedCardsClicked === "function") {
        onUpdatedCardsClicked(name);
      } else if (name) {
        onUpdatedCardSeen?.(name);
      }

      return;
    }

    if (overflowState.canScrollDown) {
      container.scrollBy({
        top: Math.round(container.clientHeight * 0.8),
        behavior: "smooth",
      });
    } else if (overflowState.canScrollUp) {
      container.scrollBy({
        top: -Math.round(container.clientHeight * 0.8),
        behavior: "smooth",
      });
    }

    onOverflowHintClick?.();
  };

  /**
   * Renders children, hiding individual card handles for mobile stack content
   * when the mobile bar is responsible for disclosure.
   *
   * @param {boolean} forMobile - Whether children are being rendered into mobile UI.
   * @returns {React.ReactNode} Rendered children.
   */
  const renderChildren = (forMobile) =>
    React.Children.map(children, (child) =>
      hideCardHandleOnMobile && forMobile && React.isValidElement(child)
        ? React.cloneElement(child, { hideHandleOnMobile: true })
        : child
    );

  /**
   * Renders the status dot or directional chevron for the stack hint.
   *
   * @returns {JSX.Element} Leading icon.
   */
  const renderLeadingIcon = () => {
    if (hasUpdatedCards) {
      return <OverflowDot $hasUpdates aria-hidden="true" />;
    }

    if (!overflowDirection) {
      return <OverflowDot aria-hidden="true" />;
    }

    return <Chevron $direction={overflowDirection} aria-hidden="true" />;
  };

  /**
   * Renders the sticky stack hint for updated cards or fully hidden overflow.
   *
   * @returns {JSX.Element} Overflow hint control.
   */
  const renderOverflowHint = () => (
    <OverflowHintWrap $visible={shouldShowOverflowHint}>
      <OverflowHint
        type="button"
        onClick={handleOverflowHintClick}
        aria-label={
          hasUpdatedCards && firstUpdatedCardName
            ? `${overflowHintText}. Scroll to ${firstUpdatedCardName}`
            : overflowHintText || "Callout card status"
        }
        title={
          hasUpdatedCards && firstUpdatedCardName
            ? `Scroll to ${firstUpdatedCardName}`
            : overflowHintText || undefined
        }
      >
        {renderLeadingIcon()}
        <OverflowText>{overflowHintText}</OverflowText>
      </OverflowHint>
    </OverflowHintWrap>
  );

  if (isMobile) {
    if (mobilePortalSlot) {
      return createPortal(
        <>
          {showOnMobile && (
            <MobileBar
              $bgColor={mobileBarColor}
              onClick={() => setOpen((value) => !value)}
              aria-expanded={open}
            >
              <span>{mobileTitle}</span>
              <AccordionIcon className="chev" $isOpen={open} />
            </MobileBar>
          )}

          <StyledScrollableContainer
            ref={scrollRef}
            $open={open}
            $hidden={hidden}
            data-testid="container"
            className="selectable-text"
          >
            {renderChildren(true)}
          </StyledScrollableContainer>
          {open && renderOverflowHint()}
        </>,
        mobilePortalSlot
      );
    }
    return null;
  }

  if (dockedSlot) {
    return createPortal(
      <DockedStack
        ref={scrollRef}
        $hidden={hidden}
        data-testid="container"
        className="selectable-text"
      >
        {renderChildren(true)}
      </DockedStack>,
      dockedSlot
    );
  }

  return (
    <div style={{ position: "relative" }}>
      {isMobile && showOnMobile && (
        <MobileBar
          $bgColor={mobileBarColor}
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
        >
          <span>{mobileTitle}</span>
          <AccordionIcon className="chev" $isOpen={open} />
        </MobileBar>
      )}

      <StackWrapper $hidden={hidden}>
        <StyledScrollableContainer
          ref={scrollRef}
          $open={isMobile ? open : true}
          $hidden={hidden}
          data-testid="container"
          className="selectable-text"
        >
          {renderChildren(isMobile)}
        </StyledScrollableContainer>
        {renderOverflowHint()}
      </StackWrapper>
    </div>
  );
};
