import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "jest-axe";
import Cookies from "js-cookie";
import { ToastContext } from "contexts/ToastContext";
import { api } from "services";
import { FeatureDownloadButton, describeDownloadError } from "./FeatureDownloadButton";

jest.mock("services", () => ({
  api: { downloadService: { downloadFile: jest.fn() } },
}));

const ROLE_CLAIM = "http://schemas.microsoft.com/ws/2008/06/identity/claims/role";
const makeToken = (roles) => {
  const encode = (obj) => Buffer.from(JSON.stringify(obj)).toString("base64url");
  return `${encode({ alg: "none" })}.${encode({ [ROLE_CLAIM]: roles })}.sig`;
};

const download = {
  path: "/api/download/counts/atc/sites/{id}",
  includeFilters: true,
  label: "Site CSV",
  requiredRoles: ["{app}_admin", "{app}_user"],
  method: "GET",
};

const renderButton = (props = {}) => {
  const toast = { addToast: jest.fn(), removeToast: jest.fn() };
  const utils = render(
    <ToastContext.Provider value={toast}>
      <FeatureDownloadButton
        download={download}
        values={{ id: 72 }}
        filters={{ time_period: "24h", day_type: "neutral" }}
        appName="LCRTM"
        {...props}
      />
    </ToastContext.Provider>
  );
  return { ...utils, toast };
};

describe("FeatureDownloadButton", () => {
  beforeEach(() => {
    Cookies.set("token", makeToken(["lcrtm_user"]));
    api.downloadService.downloadFile.mockResolvedValue({ filename: "site-72.csv" });
  });
  afterEach(() => Cookies.remove("token"));

  it("substitutes placeholders and appends the current filters", async () => {
    const { toast } = renderButton();
    await userEvent.click(screen.getByRole("button", { name: "Site CSV" }));

    expect(api.downloadService.downloadFile).toHaveBeenCalledWith(
      "/api/download/counts/atc/sites/72",
      {
        queryParams: { time_period: "24h", day_type: "neutral" },
        skipAuth: false,
        method: "GET",
      }
    );
    await waitFor(() =>
      expect(toast.addToast).toHaveBeenCalledWith(
        expect.objectContaining({ message: "Downloaded site-72.csv", type: "info" })
      )
    );
  });

  it("leaves filters off when includeFilters is false, keeping fixed params", async () => {
    renderButton({
      download: { ...download, includeFilters: false, queryParams: { format: "csv" }, method: "POST" },
    });
    await userEvent.click(screen.getByRole("button", { name: "Site CSV" }));
    expect(api.downloadService.downloadFile).toHaveBeenCalledWith(
      "/api/download/counts/atc/sites/72",
      { queryParams: { format: "csv" }, skipAuth: false, method: "POST" }
    );
  });

  it("is hidden when the user holds none of the required roles", () => {
    Cookies.set("token", makeToken(["other_user"]));
    renderButton();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("is hidden when the user is signed out and roles are required", () => {
    Cookies.remove("token");
    renderButton();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("shows for everyone when no roles are configured", () => {
    Cookies.remove("token");
    renderButton({ download: { path: "/api/sites/{id}" } });
    expect(screen.getByRole("button", { name: "Download CSV" })).toBeInTheDocument();
  });

  it("shows progress while the download runs", async () => {
    let finish;
    api.downloadService.downloadFile.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    renderButton();
    await userEvent.click(screen.getByRole("button", { name: "Site CSV" }));

    const button = screen.getByRole("button", { name: /downloading/i });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("aria-busy", "true");

    finish({ filename: "x.csv" });
    await waitFor(() => expect(screen.getByRole("button", { name: "Site CSV" })).toBeEnabled());
  });

  it("shows the API's 403 clearly in an error toast", async () => {
    const error = Object.assign(new Error("HTTP error! status: 403"), {
      status: 403,
      detail: "No download permission for dataset atc.",
    });
    api.downloadService.downloadFile.mockRejectedValue(error);
    jest.spyOn(console, "error").mockImplementation(() => {});
    const { toast } = renderButton();
    await userEvent.click(screen.getByRole("button", { name: "Site CSV" }));

    await waitFor(() =>
      expect(toast.addToast).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "error",
          message:
            "Download not permitted: you do not have permission to download this data. No download permission for dataset atc.",
        })
      )
    );
    expect(screen.getByRole("button", { name: "Site CSV" })).toBeEnabled();
  });

  it("shows a toast when the download fails for other reasons", async () => {
    api.downloadService.downloadFile.mockRejectedValue(new Error("Failed to fetch"));
    jest.spyOn(console, "error").mockImplementation(() => {});
    const { toast } = renderButton();
    await userEvent.click(screen.getByRole("button", { name: "Site CSV" }));
    await waitFor(() =>
      expect(toast.addToast).toHaveBeenCalledWith(
        expect.objectContaining({ type: "error", message: "Download failed: Failed to fetch" })
      )
    );
  });

  it("stays focusable and explains why when a placeholder has no value", async () => {
    renderButton({ values: {} });
    const button = screen.getByRole("button", { name: "Site CSV" });
    expect(button).toHaveAttribute("aria-disabled", "true");
    expect(button).toHaveAccessibleDescription("Missing id for this download");

    await userEvent.tab();
    expect(button).toHaveFocus();
    await userEvent.click(button);
    expect(api.downloadService.downloadFile).not.toHaveBeenCalled();
  });

  it("has no accessibility violations when a placeholder has no value", async () => {
    const { container } = renderButton({ values: {} });
    expect(await axe(container)).toHaveNoViolations();
  });

  it("has no automated accessibility violations", async () => {
    const { container } = renderButton();
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe("describeDownloadError", () => {
  it("describes status codes and network errors", () => {
    expect(describeDownloadError({ status: 401 })).toBe("Download failed: please sign in again.");
    expect(describeDownloadError({ status: 500, detail: "Oops." })).toBe("Download failed (500). Oops.");
    expect(describeDownloadError(undefined)).toBe("Download failed: unknown error");
  });
});
