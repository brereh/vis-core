import { validateAppConfigAgainstOpenApi } from "./openApiValidation";

const makeSchema = (paths) => ({
  openapi: "3.0.1",
  paths,
});

describe("validateAppConfigAgainstOpenApi", () => {
  it("reports missing filter paramName for required query param", () => {
    const apiSchema = makeSchema({
      "/api/foo": {
        get: {
          parameters: [{ in: "query", name: "q", required: true }],
        },
      },
    });

    const appConfig = {
      appPages: [
        {
          pageName: "Test Page",
          config: {
            filters: [],
            visualisations: [{ name: "V", dataPath: "/api/foo" }],
          },
        },
      ],
    };

    const result = validateAppConfigAgainstOpenApi(appConfig, apiSchema);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toMatchObject({
      type: "missing_paramName",
      pageName: "Test Page",
      route: "/api/foo",
      location: "query",
      paramName: "q",
    });
  });

  it("does not report error when required query param is hard-coded in URL", () => {
    const apiSchema = makeSchema({
      "/api/foo?q=bar": {
        get: {
          parameters: [{ in: "query", name: "q", required: true }],
        },
      },
    });

    const appConfig = {
      appPages: [
        {
          pageName: "Test Page",
          config: {
            filters: [],
            visualisations: [{ name: "V", dataPath: "/api/foo?q=bar" }],
          },
        },
      ],
    };

    const result = validateAppConfigAgainstOpenApi(appConfig, apiSchema);
    expect(result.errors).toHaveLength(0);
  });

  it("treats all params as required when schema marks none required (mirrors MapContext)", () => {
    const apiSchema = makeSchema({
      "/api/foo": {
        get: {
          parameters: [{ in: "query", name: "q" }],
        },
      },
    });

    const appConfig = {
      appPages: [
        {
          pageName: "Test Page",
          config: {
            filters: [],
            visualisations: [{ name: "V", dataPath: "/api/foo" }],
          },
        },
      ],
    };

    const result = validateAppConfigAgainstOpenApi(appConfig, apiSchema);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toMatchObject({ paramName: "q" });
  });

  it("warns when route is missing in schema", () => {
    const apiSchema = makeSchema({});
    const appConfig = {
      appPages: [
        {
          pageName: "Test Page",
          config: {
            filters: [],
            visualisations: [{ name: "V", dataPath: "/api/missing" }],
          },
        },
      ],
    };

    const result = validateAppConfigAgainstOpenApi(appConfig, apiSchema);
    expect(result.errors).toHaveLength(0);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toMatchObject({ type: "missing_schema_path" });
  });
});

describe("validateAppConfigAgainstOpenApi with multi-parameter filters", () => {
  it("treats every paramName of a dateRange filter, and its extra toggle, as covered", () => {
    const apiSchema = makeSchema({
      "/api/counts": {
        get: {
          parameters: [
            { in: "query", name: "date_from", required: true },
            { in: "query", name: "date_to", required: true },
            { in: "query", name: "include_excluded", required: true },
          ],
        },
      },
    });
    const appConfig = {
      appPages: [
        {
          pageName: "Counts",
          config: {
            filters: [
              {
                type: "dateRange",
                paramName: ["date_from", "date_to"],
                extraToggle: { paramName: "include_excluded", label: "Include excluded days" },
              },
            ],
            visualisations: [{ name: "V", dataPath: "/api/counts" }],
          },
        },
      ],
    };

    expect(validateAppConfigAgainstOpenApi(appConfig, apiSchema).errors).toEqual([]);
  });
});
