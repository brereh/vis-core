import Cookies from "js-cookie";
import {
  getDownloadMetadataPath,
  fillPathTemplate,
  expandRoleTemplates,
  userHasAnyRole,
} from "./downloads";
import { DEFAULT_DOWNLOAD_METADATA_PATH } from "defaults";

const ROLE_CLAIM = "http://schemas.microsoft.com/ws/2008/06/identity/claims/role";
const makeToken = (roles) => {
  const encode = (obj) => Buffer.from(JSON.stringify(obj)).toString("base64url");
  return `${encode({ alg: "none" })}.${encode({ [ROLE_CLAIM]: roles })}.sig`;
};

describe("getDownloadMetadataPath", () => {
  it("keeps the TAME default when nothing is configured", () => {
    expect(DEFAULT_DOWNLOAD_METADATA_PATH).toBe("/api/tame/mvdata");
    expect(getDownloadMetadataPath(undefined, undefined)).toBe("/api/tame/mvdata");
    expect(getDownloadMetadataPath({}, {})).toBe("/api/tame/mvdata");
  });

  it("prefers page config over app config", () => {
    expect(getDownloadMetadataPath({}, { downloadMetadataPath: "/api/app/meta" })).toBe(
      "/api/app/meta"
    );
    expect(
      getDownloadMetadataPath(
        { downloadMetadataPath: "/api/page/meta" },
        { downloadMetadataPath: "/api/app/meta" }
      )
    ).toBe("/api/page/meta");
  });
});

describe("fillPathTemplate", () => {
  it("substitutes and encodes every placeholder", () => {
    expect(
      fillPathTemplate("/api/download/{dataset}/sites/{id}", { dataset: "atc", id: "A/72" })
    ).toEqual({ path: "/api/download/atc/sites/A%2F72", missing: [] });
  });

  it("reports placeholders without a value and leaves them in place", () => {
    expect(fillPathTemplate("/api/sites/{id}/{dir}", { id: 0 })).toEqual({
      path: "/api/sites/0/{dir}",
      missing: ["dir"],
    });
  });
});

describe("expandRoleTemplates", () => {
  it("replaces {app} with the lower-cased app name", () => {
    expect(expandRoleTemplates(["{app}_admin", "{APP}_User", "all_admin"], "LCRTM")).toEqual([
      "lcrtm_admin",
      "lcrtm_user",
      "all_admin",
    ]);
  });

  it("accepts a single role and ignores empty input", () => {
    expect(expandRoleTemplates("{app}_user", "x")).toEqual(["x_user"]);
    expect(expandRoleTemplates(undefined, "x")).toEqual([]);
  });
});

describe("userHasAnyRole", () => {
  afterEach(() => Cookies.remove("token"));

  it("allows everyone when no roles are required", () => {
    expect(userHasAnyRole([])).toBe(true);
    expect(userHasAnyRole(undefined)).toBe(true);
  });

  it("checks the token's roles case-insensitively", () => {
    Cookies.set("token", makeToken(["LCRTM_User"]));
    expect(userHasAnyRole(["lcrtm_admin", "lcrtm_user"])).toBe(true);
    expect(userHasAnyRole(["lcrtm_admin"])).toBe(false);
  });

  it("denies when there is no token", () => {
    expect(userHasAnyRole(["lcrtm_user"])).toBe(false);
  });
});
