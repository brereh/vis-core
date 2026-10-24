import Cookies from "js-cookie";
import { DownloadService, filenameFromDisposition } from "./downloadData";

const respond = ({ ok = true, status = 200, headers = {}, body = "a,b\n1,2" }) => ({
  ok,
  status,
  headers: { get: (name) => headers[name] ?? null },
  blob: () => Promise.resolve(new Blob([body])),
  text: () => Promise.resolve(body),
});

describe("filenameFromDisposition", () => {
  it("reads plain and RFC 5987 file names", () => {
    expect(filenameFromDisposition('attachment; filename="site-72.csv"')).toBe("site-72.csv");
    expect(filenameFromDisposition("attachment; filename=site.csv")).toBe("site.csv");
    expect(
      filenameFromDisposition("attachment; filename=\"x.csv\"; filename*=UTF-8''site%2072.csv")
    ).toBe("site 72.csv");
    expect(filenameFromDisposition("attachment")).toBeNull();
  });
});

describe("DownloadService.downloadFile", () => {
  let service;
  beforeEach(() => {
    service = new DownloadService();
    global.fetch = jest.fn();
    window.URL.createObjectURL = jest.fn(() => "blob:x");
    window.URL.revokeObjectURL = jest.fn();
    jest.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    jest.spyOn(console, "log").mockImplementation(() => {});
    Cookies.set("token", "abc");
  });
  afterEach(() => Cookies.remove("token"));

  it("sends the Bearer token and names the file from Content-Disposition", async () => {
    fetch.mockResolvedValue(
      respond({ headers: { "Content-Disposition": 'attachment; filename="site-72.csv"' } })
    );
    const result = await service.downloadFile("/api/sites/72", { queryParams: { day_type: "x" } });

    expect(result).toEqual({ filename: "site-72.csv" });
    const [url, options] = fetch.mock.calls[0];
    expect(url).toContain("/api/sites/72?day_type=x");
    expect(options.headers.Authorization).toBe("Bearer abc");
  });

  it("throws with the status and the API's detail on a 403", async () => {
    fetch.mockResolvedValue(
      respond({ ok: false, status: 403, body: JSON.stringify({ detail: "Not allowed." }) })
    );
    await expect(service.downloadFile("/api/sites/72")).rejects.toMatchObject({
      message: "HTTP error! status: 403",
      status: 403,
      detail: "Not allowed.",
    });
  });
});
