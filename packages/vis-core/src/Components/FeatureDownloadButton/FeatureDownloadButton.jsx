import React, { useId, useMemo, useState } from "react";
import styled, { keyframes } from "styled-components";

import { api } from "services";
import { useToast } from "contexts/ToastContext";
import {
  fillPathTemplate,
  expandRoleTemplates,
  userHasAnyRole,
} from "utils/downloads";

const DEFAULT_LABEL = "Download CSV";
const SUCCESS_TOAST_MS = 4000;

const spin = keyframes`
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
`;

/**
 * Outlined secondary button, so it sits beside a card's primary action
 * without competing with it. Colours come from theme tokens with CSS-variable fallbacks.
 */
const Button = styled.button`
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 36px;
  padding: 8px 14px;

  background: ${({ theme }) => theme?.colors?.surface ?? "var(--palette-white)"};
  color: ${({ $color, theme }) => $color ?? theme?.colors?.primary ?? "var(--palette-navy)"};
  border: 1px solid
    ${({ $color, theme }) => $color ?? theme?.colors?.primary ?? "var(--palette-navy)"};
  border-radius: ${({ theme }) => theme?.borderRadius ?? "var(--radius-xs)"};

  font-family: ${({ theme }) => theme?.standardFontFamily ?? "var(--font-family-base)"};
  font-size: 0.9rem;
  font-weight: 600;

  &:hover:not(:disabled):not([aria-disabled="true"]) {
    background: ${({ theme }) => theme?.colors?.muted ?? "var(--palette-mid-grey)"};
  }

  &:focus-visible {
    outline: 2px solid
      ${({ $color, theme }) => $color ?? theme?.colors?.primary ?? "var(--palette-navy)"};
    outline-offset: 2px;
  }

  &:disabled,
  &[aria-disabled="true"] {
    cursor: not-allowed;
    opacity: 0.7;
  }
`;

const VisuallyHidden = styled.span`
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
`;

const Spinner = styled.span`
  width: 12px;
  height: 12px;
  border: 2px solid currentColor;
  border-top-color: transparent;
  border-radius: 50%;
  animation: ${spin} 1s linear infinite;

  @media (prefers-reduced-motion: reduce) {
    animation: none;
  }
`;

/**
 * Builds the message shown when a download fails. A 403 means the API refused
 * download permission for this dataset, so it is spelt out rather than shown as a code.
 *
 * @param {Error & {status?: number, detail?: string}} error - The error from the download service.
 * @returns {string} The toast message.
 */
export const describeDownloadError = (error) => {
  const detail = error?.detail ? ` ${error.detail}` : "";
  if (error?.status === 403) {
    return `Download not permitted: you do not have permission to download this data.${detail}`;
  }
  if (error?.status === 401) {
    return `Download failed: please sign in again.${detail}`;
  }
  if (error?.status) {
    return `Download failed (${error.status}).${detail}`;
  }
  return `Download failed: ${error?.message || "unknown error"}`;
};

/**
 * Downloads one feature's data, for example a site's CSV from a callout card or a
 * detail page. The path's `{placeholders}` are filled from `values`, and the current
 * filter params can be appended. Hidden when the user holds none of `requiredRoles`.
 *
 * The request goes through the shared download service, so it carries the
 * `Authorization: Bearer <token>` header and names the file from `Content-Disposition`.
 *
 * @param {Object} props
 * @param {Object} props.download - Download config.
 * @param {string} props.download.path - API path; `{name}` placeholders are filled from `values`.
 * @param {boolean} [props.download.includeFilters=true] - Append `filters` as query params (or body for POST).
 * @param {string} [props.download.label="Download CSV"] - Button text.
 * @param {Array<string>} [props.download.requiredRoles] - Roles allowed to download; `{app}` is
 *   replaced by the app name. The button is hidden if the user holds none of them.
 * @param {"GET"|"POST"} [props.download.method="GET"] - HTTP method.
 * @param {Object} [props.download.queryParams] - Extra fixed params sent with every download.
 * @param {Object} [props.values={}] - Values for path placeholders (the selected feature).
 * @param {Object} [props.filters={}] - Current filter params, keyed by API param name.
 * @param {string} [props.appName] - App name for `{app}` in roles. Defaults to `VITE_APP_NAME`.
 * @param {string} [props.color] - Optional app-config override for the button colour.
 * @returns {JSX.Element|null} The button, or null when the user may not download.
 */
export const FeatureDownloadButton = ({
  download,
  values = {},
  filters = {},
  appName = import.meta.env.VITE_APP_NAME,
  color,
}) => {
  const { addToast, removeToast } = useToast();
  const [isDownloading, setIsDownloading] = useState(false);

  const {
    path: pathTemplate,
    includeFilters = true,
    label = DEFAULT_LABEL,
    requiredRoles,
    method = "GET",
    queryParams: fixedParams,
  } = download || {};

  const roles = useMemo(
    () => expandRoleTemplates(requiredRoles, appName),
    [requiredRoles, appName]
  );
  const descriptionId = useId();
  const { path, missing } = fillPathTemplate(pathTemplate, values);

  if (!pathTemplate || !userHasAnyRole(roles)) return null;

  const toastId = `feature-download-${pathTemplate}`;
  const isUnavailable = missing.length > 0;

  const handleDownload = async () => {
    if (isUnavailable || isDownloading) return;
    setIsDownloading(true);
    removeToast(toastId);
    try {
      const { filename } =
        (await api.downloadService.downloadFile(path, {
          queryParams: {
            ...(fixedParams || {}),
            ...(includeFilters ? filters || {} : {}),
          },
          skipAuth: false,
          method,
        })) || {};
      addToast({
        id: toastId,
        message: filename ? `Downloaded ${filename}` : "Download complete",
        type: "info",
        duration: SUCCESS_TOAST_MS,
      });
    } catch (error) {
      console.error("Feature download failed:", error);
      addToast({ id: toastId, message: describeDownloadError(error), type: "error" });
    } finally {
      setIsDownloading(false);
    }
  };

  // A missing placeholder uses aria-disabled rather than disabled, so the button stays
  // focusable and screen readers announce why it cannot be used.
  const unavailableReason = isUnavailable
    ? `Missing ${missing.join(", ")} for this download`
    : null;

  return (
    <>
      <Button
        type="button"
        onClick={handleDownload}
        disabled={isDownloading}
        aria-disabled={isUnavailable || undefined}
        aria-busy={isDownloading}
        aria-describedby={isUnavailable ? descriptionId : undefined}
        title={unavailableReason || undefined}
        $color={color}
      >
        {isDownloading ? (
          <>
            Downloading… <Spinner aria-hidden="true" />
          </>
        ) : (
          label
        )}
      </Button>
      {isUnavailable && (
        <VisuallyHidden id={descriptionId}>{unavailableReason}</VisuallyHidden>
      )}
    </>
  );
};
