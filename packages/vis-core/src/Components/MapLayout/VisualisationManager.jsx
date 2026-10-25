import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ScrollableContainer } from "Components/ScrollableContainer";
import { MapVisualisation } from "./MapVisualisation";
import { CalloutCardVisualisation } from "./CalloutCards/CalloutCardVisualisation";
import { FullScreenCalloutCardVisualisation } from "./CalloutCards/FullScreenCalloutCardVisualisation";
import { BaseCalloutCardVisualisation } from "./CalloutCards/BaseCalloutCardVisualisation";
import { useDockedLayoutContext } from "contexts/DockedLayoutContext";

const UPDATE_MARKER_TIMEOUT_MS = 2800;

/**
 * VisualisationManager component that renders the appropriate visualizations
 * based on the types specified in the visualisation configurations.
 *
 * Behaviour:
 * - Callout card order is stable during normal data updates.
 * - A callout card moves to the top only once: the first time it becomes visible
 *   with real data.
 * - Mobile summary visibility is tracked via onVisibilityChange.
 *
 * @param {Object} props - The component props.
 * @param {Object} props.visualisationConfigs - Object of configuration objects for the visualizations.
 * @param {Object} props.map - The Maplibre JS map instance.
 * @param {Object} props.maps - The Maplibre JS map instances for left and right maps.
 * @returns {JSX.Element|null} The rendered visualization components.
 */
export const VisualisationManager = ({
  visualisationConfigs,
  map,
  maps,
  ...props
}) => {
  const sidebarIsOpen = props.sidebarIsOpen;
  // Convert visualisationConfigs object to an array of entries
  const visualisationEntries = Object.entries(visualisationConfigs);
  // Separate visualizations by type
  const calloutCardVisualisations = visualisationEntries.filter(
    ([_, config]) => config.type === "calloutCard"
  );

  const mapVisualisations = visualisationEntries.filter(
    ([_, config]) =>
      config.type === "joinDataToMap" || config.type === "geojson"
  );

  // Build a lookup for configs by name
  const calloutCardConfigByName = Object.fromEntries(calloutCardVisualisations);

  // State to manage order of cards
  const [cardOrder, setCardOrder] = useState(
    calloutCardVisualisations.map(([name]) => name)
  );

  const visibleMapRef = useRef({});
  const firstVisibleCardsRef = useRef(new Set());

  const [visibleCount, setVisibleCount] = useState(0);
  const [updatedCardExpiries, setUpdatedCardExpiries] = useState({});

  const updatedCardNames = useMemo(
    () => Object.keys(updatedCardExpiries),
    [updatedCardExpiries]
  );

  /**
   * Tracks whether a callout card currently has renderable data and refreshes
   * the aggregate mobile-summary visibility count.
   *
   * @param {string} name - Visualisation/card identifier.
   * @param {boolean} isVisible - Whether the card has renderable data.
   */
  const handleCardVisibility = useCallback((name, isVisible) => {
    const next = { ...visibleMapRef.current, [name]: !!isVisible };
    visibleMapRef.current = next;
    setVisibleCount(Object.values(next).filter(Boolean).length);
  }, []);

  /**
   * Moves a card to the front of the rendered callout stack.
   *
   * @param {string} name - Visualisation/card identifier.
   */
  const moveCardToTop = useCallback((name) => {
    setCardOrder((prevOrder) => [
      name,
      ...prevOrder.filter((existingName) => existingName !== name),
    ]);
  }, []);

  /**
   * Moves a card once, when it first becomes visible with real data.
   * Later data updates are surfaced as update markers instead of reordering.
   *
   * @param {string} name - Visualisation/card identifier.
   */
  const handleCardFirstVisible = useCallback(
    (name) => {
      if (firstVisibleCardsRef.current.has(name)) return;

      firstVisibleCardsRef.current.add(name);
      moveCardToTop(name);
    },
    [moveCardToTop]
  );

  /**
   * Marks a card as updated until the card or stack-level marker is acknowledged.
   * Stores each card's fixed auto-clear expiry so unrelated interactions do not
   * restart existing card timers.
   *
   * @param {string} name - Visualisation/card identifier.
   * @param {Object} [updateInfo] - Timing details from the updated card.
   * @param {number} [updateInfo.autoClearAt] - Epoch time when the marker should clear.
   */
  const handleCardUpdated = useCallback((name, updateInfo = {}) => {
    const autoClearAt =
      typeof updateInfo.autoClearAt === "number"
        ? updateInfo.autoClearAt
        : Date.now() + UPDATE_MARKER_TIMEOUT_MS;

    setUpdatedCardExpiries((prev) => {
      if (prev[name] === autoClearAt) return prev;

      return {
        ...prev,
        [name]: autoClearAt,
      };
    });
  }, []);

  /**
   * Clears one card's update marker after it has been seen or opened.
   *
   * @param {string} name - Visualisation/card identifier.
   */
  const clearUpdatedCardMarker = useCallback((name) => {
    if (!name) return;

    setUpdatedCardExpiries((prev) => {
      if (!(name in prev)) return prev;

      const next = { ...prev };
      delete next[name];
      return next;
    });
  }, []);

  /**
   * Clears all stack-level update markers after the user clicks the update hint.
   */
  const clearUpdatedCardMarkers = useCallback(() => {
    setUpdatedCardExpiries({});
  }, []);

  const showOnMobile = calloutCardVisualisations.length > 0;

  // Docked layout: tell the right-hand column whether any card has content, so it
  // can swap between the cards and the page's prompt text.
  const setDockedHasSelection = useDockedLayoutContext()?.setHasSelection;
  useEffect(() => {
    setDockedHasSelection?.(visibleCount > 0);
  }, [setDockedHasSelection, visibleCount]);

  /**
   * Keeps card order, visibility, first-visible tracking, and update markers in
   * sync with the currently configured callout cards.
   */
  useEffect(() => {
    const newOrder = calloutCardVisualisations.map(([name]) => name);

    setCardOrder((prevOrder) => {
      const retained = prevOrder.filter((name) => newOrder.includes(name));
      const addedNames = newOrder.filter((name) => !retained.includes(name));
      return [...retained, ...addedNames];
    });

    visibleMapRef.current = Object.fromEntries(
      Object.entries(visibleMapRef.current).filter(([name]) =>
        newOrder.includes(name)
      )
    );

    setVisibleCount(
      Object.values(visibleMapRef.current).filter(Boolean).length
    );

    firstVisibleCardsRef.current = new Set(
      [...firstVisibleCardsRef.current].filter((name) =>
        newOrder.includes(name)
      )
    );

    setUpdatedCardExpiries((prev) => {
      return Object.fromEntries(
        Object.entries(prev).filter(([name]) => newOrder.includes(name))
      );
    });
  }, [visualisationConfigs]);

  return (
    <>
      {/* Render all calloutCard visualisations inside ScrollableContainer */}
      <ScrollableContainer
        showOnMobile={showOnMobile}
        hideCardHandleOnMobile
        updatedCardNames={updatedCardNames}
        updatedCardExpiresAtByName={updatedCardExpiries}
        onUpdatedCardSeen={clearUpdatedCardMarker}
        onUpdatedCardsClicked={clearUpdatedCardMarkers}
      >
        {cardOrder.map((name) => {
          const config = calloutCardConfigByName[name];

          if (!config) return null;

          return (
            <BaseCalloutCardVisualisation
              type={config.cardType || "small"}
              key={name}
              visualisationName={name}
              cardName={config.cardName || name}
              sidebarIsOpen={sidebarIsOpen}
              onFirstVisible={() => handleCardFirstVisible(name)}
              onVisibilityChange={(isVisible) =>
                handleCardVisibility(name, isVisible)
              }
              onCardUpdated={(updateInfo) => handleCardUpdated(name, updateInfo)}
              onCardUpdateAcknowledged={() => clearUpdatedCardMarker(name)}
            />
          );
        })}
      </ScrollableContainer>

      {/* Render all MapVisualisations */}
      {mapVisualisations.map(([name]) => (
        <MapVisualisation
          key={name}
          visualisationName={name}
          map={map}
          maps={maps}
          left={props.left}
          {...props}
        />
      ))}
    </>
  );
};
