/**
 * Hover tooltip content, shared by every map pane.
 *
 * Pure functions: they take rendered features and the page's layer and visualisation
 * config, and return HTML or plain data. Nothing here touches a map or a popup; see
 * hoverTooltip.js for that.
 */
import { api } from "services";
import {
  buildDefaultTooltip,
  buildLoadingTooltip,
  buildErrorTooltip,
  buildLoadingSection,
  insertCustomIntoDefault,
  resolveTooltipRequestUrl,
} from "utils/tooltip";
import { formatNumber } from "utils/text";
import { getFeatureStateValue } from "utils/map";
import { resolveVisualisationUnit } from "utils/displayMode";
import { replacePlaceholders } from "utils/config";

/** Separator between the sections of one tooltip. */
export const TOOLTIP_DIVIDER = '<hr class="thick-divider">';

/** Smallest hover hit box, in pixels either side of the pointer. */
export const HOVER_BUFFER_FLOOR = 3;

/** Line width assumed for a line layer whose width is an expression. */
const EXPRESSION_LINE_WIDTH = 7.5;

const SPIDER_SUFFIX = "-spider";
const SPIDER_LINKS_SUFFIX = "-spider-links";

/**
 * Maps a spider layer id (`<layer>-spider`, `<layer>-spider-links`) back to the layer it
 * was generated from, so it uses that layer's tooltip config. Other ids are returned as is.
 *
 * @param {string} layerId
 * @returns {string}
 */
export function resolveBaseLayerId(layerId) {
  if (layerId.endsWith(SPIDER_LINKS_SUFFIX)) return layerId.slice(0, -SPIDER_LINKS_SUFFIX.length);
  if (layerId.endsWith(SPIDER_SUFFIX)) return layerId.slice(0, -SPIDER_SUFFIX.length);
  return layerId;
}

/**
 * Spider overlay layers present on the map for the page's layers. They are hoverable
 * siblings of point layers that spread out overlapping points.
 *
 * @param {Object} map - MapLibre map.
 * @param {Object<string, Object>} layers - Page layer config, keyed by layer id.
 * @returns {string[]}
 */
export function spiderOverlayLayerIds(map, layers) {
  const ids = [];
  Object.keys(layers).forEach((layerId) => {
    [`${layerId}${SPIDER_SUFFIX}`, `${layerId}${SPIDER_LINKS_SUFFIX}`].forEach((id) => {
      if (map.getLayer(id)) ids.push(id);
    });
  });
  return ids;
}

/**
 * The layers on this map that show a tooltip on hover.
 *
 * @param {Object} map - MapLibre map.
 * @param {Object<string, Object>} layers - Page layer config.
 * @param {Object} [options]
 * @param {boolean} [options.includeClickTooltips=false] - Also count layers with click
 *   tooltips. Used on touch devices, where a tap stands in for hover.
 * @returns {string[]}
 */
export function hoverableLayerIds(map, layers, { includeClickTooltips = false } = {}) {
  return Object.keys(layers).filter((layerId) => {
    const config = layers[layerId];
    const wantsTooltip =
      config.shouldHaveTooltipOnHover || (includeClickTooltips && config.shouldHaveTooltipOnClick);
    return Boolean(wantsTooltip) && Boolean(map.getLayer(layerId));
  });
}

/**
 * Half-size of the hover hit box: the largest buffer any hoverable layer asks for. Line
 * layers add half their line width so the box reaches from the line's edge, not its centre.
 *
 * @param {string[]} layerIds - Hoverable layer ids.
 * @param {Object<string, Object>} layers - Page layer config.
 * @param {Object} [options]
 * @param {number} [options.minimum=0] - A floor above HOVER_BUFFER_FLOOR, e.g. for fingers.
 * @returns {number}
 */
export function hoverBufferSize(layerIds, layers, { minimum = 0 } = {}) {
  const size = Math.max(
    HOVER_BUFFER_FLOOR,
    minimum,
    ...layerIds.map((layerId) => {
      const layer = layers[layerId];
      const baseBuffer = layer.bufferSize ?? 0;
      const lineWidth = layer.mapLayer?.paint?.["line-width"];
      if (layer.geometryType === "line" && lineWidth) {
        const width = typeof lineWidth === "number" ? lineWidth : EXPRESSION_LINE_WIDTH;
        return baseBuffer + width / 2;
      }
      return baseBuffer;
    })
  );
  return Number.isFinite(size) ? size : 0;
}

/**
 * The box `[[minX, minY], [maxX, maxY]]` around a screen point, for queryRenderedFeatures.
 *
 * @param {{ x: number, y: number }} point
 * @param {number} buffer
 * @returns {number[][] | null} Null if any coordinate is not a finite number.
 */
export function bufferedBox(point, buffer) {
  const box = [
    [point.x - buffer, point.y - buffer],
    [point.x + buffer, point.y + buffer],
  ];
  const valid = box.every((corner) => corner.every((value) => Number.isFinite(value)));
  return valid ? box : null;
}

/**
 * Drops features a tooltip shouldn't be shown for: those without an id or layer, and
 * those without data on layers that set `shouldHaveHoverOnlyOnData`.
 *
 * @param {Object[]} features - Rendered features.
 * @param {Object<string, Object>} layers - Page layer config.
 * @returns {Object[]}
 */
export function tooltipFeatures(features, layers) {
  return (features || []).filter((feature) => {
    if (!feature || feature.id == null || !feature.layer?.id) return false;
    const config = layers[resolveBaseLayerId(feature.layer.id)];
    if (!config) return false;
    if (config.shouldHaveHoverOnlyOnData) {
      const value = getFeatureStateValue(feature);
      if (value === null || value === undefined) return false;
    }
    return true;
  });
}

/**
 * One entry per feature id, keeping the first (top-most) occurrence.
 *
 * @param {Object[]} features
 * @returns {Object[]}
 */
export function uniqueById(features) {
  const seen = new Set();
  return features.filter((feature) => {
    if (seen.has(feature.id)) return false;
    seen.add(feature.id);
    return true;
  });
}

/**
 * HTML listing a feature's properties other than id, name and value.
 *
 * @param {Object} properties - Feature properties.
 * @returns {string} Empty when there is nothing to list.
 */
export function metadataHtml(properties) {
  const keys = Object.keys(properties || {}).filter((key) => !["id", "name", "value"].includes(key));
  if (keys.length === 0) return "";
  const items = keys
    .map(
      (key) => `
        <div class="metadata-item">
          <span class="metadata-key">${key}:</span>
          <span class="metadata-value">${properties[key]}</span>
        </div>`
    )
    .join("");
  return `<div class="metadata-section">${items}</div>`;
}

/** Inserts the metadata section just inside the tooltip's closing tag. */
function withMetadata(description, properties) {
  const metadata = metadataHtml(properties);
  if (!description || !metadata) return description;
  const lastDiv = description.lastIndexOf("</div>");
  if (lastDiv === -1) return description;
  return description.slice(0, lastDiv) + metadata + description.slice(lastDiv);
}

/**
 * Builds the tooltip for the hovered features.
 *
 * Features with a custom tooltip need data from the API: they get a loading placeholder
 * now and a request in `requests`, to be fetched and merged with `mergeTooltip`.
 *
 * @param {Object} args
 * @param {Object[]} args.features - Features to describe, top-most first.
 * @param {Object<string, Object>} args.layers - Page layer config.
 * @param {Object<string, Object>} args.visualisations - Page visualisations, for legend text.
 * @returns {{ sections: string[], requests: Array<Object|null> }} One section per described
 *   feature; `requests[i]` is the custom-tooltip request for `sections[i]`, or null.
 */
export function buildTooltip({ features, layers, visualisations }) {
  const sections = [];
  const requests = [];

  features.forEach((feature) => {
    const layerId = resolveBaseLayerId(feature.layer.id);
    const config = layers[layerId];
    if (!config) return;

    const value = getFeatureStateValue(feature);
    const hasValue = value !== null && value !== undefined;
    if (!hasValue && (config.hoverNulls === false || config.shouldHaveHoverOnlyOnData)) return;

    const featureName = feature.properties?.name || "";
    const featureValueDisplay = !config.hideValueInTooltip && hasValue ? formatNumber(value) : "";
    const visualisation = visualisations?.[config.visualisationName];
    const legendText = visualisation?.legendText?.[0];
    const baseUnitText = config.defaultTooltipUnitName ?? legendText?.legendSubtitleText ?? "";
    const unitText = resolveVisualisationUnit(visualisation, baseUnitText);
    const valueText = config.defaultTooltipValueName ?? legendText?.displayValue ?? "Value";
    const identifierLabel = config.defaultTooltipIdentifierLabel || "";
    const customTooltip = config.customTooltip;

    const defaultSection = (sectionValueText) => {
      const html = buildDefaultTooltip({
        featureName,
        featureValueDisplay,
        unitText,
        valueText: sectionValueText,
        identifierLabel,
      });
      return config.hoverTipShouldIncludeMetadata ? withMetadata(html, feature.properties) : html;
    };

    if (!customTooltip) {
      const html = defaultSection(valueText);
      if (html) {
        sections.push(html);
        requests.push(null);
      }
      return;
    }

    const joinToDefault = Boolean(customTooltip.joinToDefaultTooltip);
    if (joinToDefault) {
      const html = defaultSection(customTooltip.defaultValueName || valueText);
      sections.push(html ? insertCustomIntoDefault(html, buildLoadingSection()) : "");
    } else {
      sections.push(buildLoadingTooltip(featureName));
    }
    requests.push({ feature, layerId, featureName, joinToDefault });
  });

  return { sections, requests };
}

/** HTML used in place of custom data that couldn't be fetched. */
function unavailableHtml({ joinToDefault, featureName }) {
  return joinToDefault ? "<p>Data unavailable.</p>" : buildErrorTooltip(featureName);
}

/**
 * Fetches and renders one custom-tooltip section.
 *
 * @param {Object} request - An entry of `buildTooltip(...).requests`.
 * @param {Object<string, Object>} layers - Page layer config.
 * @param {AbortSignal} signal
 * @returns {Promise<string>} Always resolves; failures resolve to a fallback section.
 */
export function fetchCustomTooltip(request, layers, signal) {
  const { feature, layerId } = request;
  const config = layers[layerId];
  const customTooltip = config?.customTooltip;
  if (!customTooltip) return Promise.resolve(unavailableHtml(request));

  const { htmlTemplate, customFormattingFunctions } = customTooltip;
  const url = resolveTooltipRequestUrl(customTooltip, feature.id);
  const options = { customFunctions: customFormattingFunctions };

  return api.baseService
    .get(url, { signal })
    .then((response) => {
      if (config.showAllDataInTooltipForEachGeom && Array.isArray(response) && response.length > 0) {
        // Most recently painted first; show that one and count the rest.
        const records = [...response].reverse();
        const first = replacePlaceholders(htmlTemplate, records[0], options);
        if (records.length === 1) return first;
        return `${first}${TOOLTIP_DIVIDER}<div class="more-records-indicator">... and ${
          records.length - 1
        } more record(s)</div>`;
      }
      const record = Array.isArray(response) ? response[0] : response;
      return replacePlaceholders(htmlTemplate, record || {}, options);
    })
    .catch((error) => {
      if (error.name !== "AbortError") {
        console.error("Failed to fetch tooltip data:", error);
      }
      return unavailableHtml(request);
    });
}

/**
 * Merges fetched custom sections into the tooltip.
 *
 * @param {string[]} sections - From `buildTooltip`.
 * @param {Array<Object|null>} requests - From `buildTooltip`.
 * @param {Array<string|undefined>} results - Fetched HTML, indexed like `sections`.
 * @returns {string} The tooltip HTML.
 */
export function mergeTooltip(sections, requests, results) {
  return sections
    .map((section, index) => {
      const request = requests[index];
      if (!request) return section;
      const html = results[index];
      return request.joinToDefault ? insertCustomIntoDefault(section || "", html) : html;
    })
    .join(TOOLTIP_DIVIDER);
}

/**
 * HTML for a layer-click popup.
 *
 * @param {Object} feature - The clicked feature.
 * @returns {string}
 */
export function layerClickHtml(feature) {
  const value = getFeatureStateValue(feature) ?? 0;
  return `<p>${feature.properties?.name ?? ""}</p><p> Id: ${feature.properties?.id}</p><p>Value: ${value}</p>`;
}
