import {
  render,
  screen,
  renderHook,
  waitFor,
} from "@testing-library/react";
import { AuthProvider, useAuth } from "contexts";
import { MemoryRouter } from "react-router-dom";
import Cookies from "js-cookie";
import { api } from "services";
import { jwtDecode } from "jwt-decode";

const mockedUsedNavigate = jest.fn();
jest.mock("react-router-dom", () => ({
  ...jest.requireActual("react-router-dom"),
  useNavigate: () => mockedUsedNavigate,
}));
jest.mock("js-cookie");
jest.mock("jwt-decode");
jest.mock("services", () => ({
  api: {
    baseService: {
      post: jest.fn(),
    },
  },
}));

describe("AuthProvider component test", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Cookies.get.mockReturnValue(null);
  });

  it("renders without crashing", () => {
    render(
      <MemoryRouter>
        <AuthProvider>
          <p>ImAChildren</p>
        </AuthProvider>
      </MemoryRouter>
    );
    expect(screen.getByText("ImAChildren")).toBeInTheDocument();
  });

  it("provides initial context values", () => {
    const TestComponent = () => {
      const { user, token } = useAuth();
      return (
        <div>
          <div>User: {user ? user.username : "null"}</div>
          <div>Token: {token || "empty"}</div>
        </div>
      );
    };

    render(
      <MemoryRouter>
        <AuthProvider>
          <TestComponent />
        </AuthProvider>
      </MemoryRouter>
    );

    expect(screen.getByText("User: null")).toBeInTheDocument();
    expect(screen.getByText("Token: empty")).toBeInTheDocument();
  });

  it("initializes with token from cookie if present", () => {
    Cookies.get.mockReturnValue("existing-token");
    const TestComponent = () => {
      const { token } = useAuth();
      return <div>Token: {token}</div>;
    };

    render(
      <MemoryRouter>
        <AuthProvider>
          <TestComponent />
        </AuthProvider>
      </MemoryRouter>
    );
    expect(screen.getByText("Token: existing-token")).toBeInTheDocument();
  });

  it("handles login successfully", async () => {
    const mockToken = "mock-jwt-token";
    const mockDecodedToken = {
      exp: Math.floor(Date.now() / 1000) + 3600,
      "http://schemas.microsoft.com/ws/2008/06/identity/claims/role": [
        "admin",
        "user",
      ],
    };

    api.baseService.post.mockResolvedValue({ token: mockToken });
    jwtDecode.mockReturnValue(mockDecodedToken);

    const wrapper = ({ children }) => (
      <MemoryRouter>
        <AuthProvider>{children}</AuthProvider>
      </MemoryRouter>
    );

    const { result } = renderHook(() => useAuth(), { wrapper });

    await result.current.loginAction("testuser", "password123");

    await waitFor(() => {
      expect(result.current.user).toEqual({
        username: "testuser",
        roles: ["admin", "user"],
      });
    });

    expect(result.current.token).toBe(mockToken);
    expect(mockedUsedNavigate).toHaveBeenCalledWith("/");
  });

  it("handles logout", () => {
    const wrapper = ({ children }) => (
      <MemoryRouter>
        <AuthProvider>{children}</AuthProvider>
      </MemoryRouter>
    );

    const { result } = renderHook(() => useAuth(), { wrapper });

    result.current.logOut();

    expect(result.current.user).toBeNull();
    expect(result.current.token).toBe("");
    expect(Cookies.remove).toHaveBeenCalledWith("token");
    expect(mockedUsedNavigate).toHaveBeenCalledWith("/login");
  });

  it("handles login error", async () => {
    const mockError = new Error("Login failed");
    api.baseService.post.mockRejectedValue(mockError);

    const wrapper = ({ children }) => (
      <MemoryRouter>
        <AuthProvider>{children}</AuthProvider>
      </MemoryRouter>
    );

    const { result } = renderHook(() => useAuth(), { wrapper });

    await expect(
      result.current.loginAction("testuser", "wrongpassword")
    ).rejects.toThrow("Login failed");
  });

  describe("one-time code", () => {
    const wrapper = ({ children }) => (
      <MemoryRouter>
        <AuthProvider>{children}</AuthProvider>
      </MemoryRouter>
    );

    beforeEach(() => {
      jwtDecode.mockReturnValue({ exp: Math.floor(Date.now() / 1000) + 3600 });
    });

    it("sends only username and password when no code is given", async () => {
      api.baseService.post.mockResolvedValue({ token: "t" });
      const { result } = renderHook(() => useAuth(), { wrapper });

      await result.current.loginAction("testuser", "password123");

      expect(api.baseService.post).toHaveBeenCalledWith(
        "/api/webusers/login",
        { username: "testuser", password: "password123" },
        { skipAuth: true }
      );
    });

    it("sends the code when one is given", async () => {
      api.baseService.post.mockResolvedValue({ token: "t" });
      const { result } = renderHook(() => useAuth(), { wrapper });

      await result.current.loginAction("testuser", "password123", "123456");

      expect(api.baseService.post).toHaveBeenCalledWith(
        "/api/webusers/login",
        { username: "testuser", password: "password123", otp: "123456" },
        { skipAuth: true }
      );
      expect(mockedUsedNavigate).toHaveBeenCalledWith("/");
    });

    it("flags a 401 mfa_required response", async () => {
      const error = Object.assign(new Error("HTTP error! status: 401"), {
        status: 401,
        body: { detail: "mfa_required" },
      });
      api.baseService.post.mockRejectedValue(error);
      const { result } = renderHook(() => useAuth(), { wrapper });

      await expect(
        result.current.loginAction("testuser", "password123")
      ).rejects.toMatchObject({ mfaRequired: true });
      expect(Cookies.set).not.toHaveBeenCalled();
      expect(mockedUsedNavigate).not.toHaveBeenCalled();
    });

    it("does not flag other errors", async () => {
      const consoleSpy = jest.spyOn(console, "error").mockImplementation(() => {});
      const failures = [
        Object.assign(new Error("HTTP error! status: 401"), {
          status: 401,
          body: { detail: "Sign-in failed." },
        }),
        Object.assign(new Error("HTTP error! status: 401"), { status: 401 }),
        Object.assign(new Error("HTTP error! status: 429"), {
          status: 429,
          body: { detail: "mfa_required" },
        }),
        new Error("Network down"),
      ];
      const { result } = renderHook(() => useAuth(), { wrapper });

      for (const failure of failures) {
        api.baseService.post.mockRejectedValueOnce(failure);
        const caught = await result.current
          .loginAction("testuser", "password123")
          .catch((err) => err);
        expect(caught).toBe(failure);
        expect(caught.mfaRequired).toBeUndefined();
      }
      consoleSpy.mockRestore();
    });
  });
});
