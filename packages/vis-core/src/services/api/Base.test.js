import BaseService from "./Base";

describe("BaseService.post errors", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("keeps the message and adds status and the JSON body", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: () => Promise.resolve({ detail: "mfa_required" }),
    });

    await expect(
      new BaseService().post("/api/webusers/login", {}, { skipAuth: true })
    ).rejects.toMatchObject({
      message: "HTTP error! status: 401",
      status: 401,
      body: { detail: "mfa_required" },
    });
  });

  it("leaves body undefined when the response is not JSON", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 502,
      json: () => Promise.reject(new SyntaxError("Unexpected token <")),
    });

    const error = await new BaseService().post("/x", {}).catch((err) => err);

    expect(error.message).toBe("HTTP error! status: 502");
    expect(error.status).toBe(502);
    expect(error.body).toBeUndefined();
  });
});
