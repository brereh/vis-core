import { render, screen, waitFor } from "@testing-library/react";
import { BrowserRouter } from "react-router-dom";
import userEvent from "@testing-library/user-event";
import { axe } from "jest-axe";
import { Login } from "Components/Login";
import { useAuth } from "contexts/AuthProvider";
import { useNavigate } from "react-router-dom";

jest.mock("contexts/AuthProvider");
jest.mock("react-router-dom", () => ({
  ...jest.requireActual("react-router-dom"),
  useNavigate: jest.fn(),
}));

describe("Login accessibility", () => {
  const renderLogin = () =>
    render(
      <BrowserRouter>
        <Login />
      </BrowserRouter>,
    );

  beforeEach(() => {
    useNavigate.mockReturnValue(jest.fn());
    useAuth.mockReturnValue({
      loginAction: jest.fn().mockResolvedValue(undefined),
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it("renders with no automated accessibility violations", async () => {
    const { container } = renderLogin();

    expect(screen.getByRole("heading", { name: /welcome/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/user name\*/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/password\*/i)).toBeInTheDocument();

    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it("announces login errors through an alert region", async () => {
    const consoleSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    const failingLogin = jest.fn().mockRejectedValue(new Error("Login failed"));
    useAuth.mockReturnValue({ loginAction: failingLogin });

    renderLogin();

    await userEvent.type(screen.getByLabelText(/user name\*/i), "user");
    await userEvent.type(screen.getByLabelText(/password\*/i), "wrong");
    await userEvent.click(screen.getByRole("button", { name: /continue/i }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("Invalid username or password");
    });

    consoleSpy.mockRestore();
  });

  it("renders the one-time code step with no automated accessibility violations", async () => {
    const mfaRequired = Object.assign(new Error("HTTP error! status: 401"), {
      status: 401,
      body: { detail: "mfa_required" },
      mfaRequired: true,
    });
    useAuth.mockReturnValue({
      loginAction: jest.fn().mockRejectedValue(mfaRequired),
    });

    const { container } = renderLogin();

    await userEvent.type(screen.getByLabelText(/user name\*/i), "user");
    await userEvent.type(screen.getByLabelText(/password\*/i), "secret");
    await userEvent.click(screen.getByRole("button", { name: /continue/i }));

    expect(await screen.findByLabelText(/one-time code\*/i)).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();

    // And with the wrong-code error showing.
    await userEvent.type(screen.getByLabelText(/one-time code\*/i), "000000");
    await userEvent.click(screen.getByRole("button", { name: /verify/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/code was not accepted/i);
    expect(await axe(container)).toHaveNoViolations();
  });
});
