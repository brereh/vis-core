import { render, screen, waitFor } from "@testing-library/react";
import { BrowserRouter } from "react-router-dom";
import { Login } from "Components/Login";
import { useAuth } from "contexts/AuthProvider";
import { useNavigate } from "react-router-dom";
import userEvent from "@testing-library/user-event";
import { Unauthorized } from "Components/Login";

// Here we define which functions will be mocked.
jest.mock("contexts/AuthProvider"); // Everything in AuthProvider
jest.mock("react-router-dom", () => ({
  // Only the useNavigate function of the ‘react-router-dom’ module
  ...jest.requireActual("react-router-dom"),
  useNavigate: jest.fn(),
}));

afterEach(() => {
  jest.clearAllMocks();
  jest.restoreAllMocks();
});

describe("Login component test", () => {
  const renderLogin = () => {
    return render(
      <BrowserRouter>
        <Login />
      </BrowserRouter>
    );
  };

  // Success
  it("Successful login with valid credentials", async () => {
    // Mocks
    const mockLoginAction = jest.fn().mockResolvedValue();
    const mockNavigate = jest.fn();

    useAuth.mockReturnValue({ loginAction: mockLoginAction });
    useNavigate.mockReturnValue(mockNavigate);

    renderLogin();

    // Selection of different elements
    const inputUsername = screen.getByLabelText(/User Name*/i);
    const inputPassword = screen.getByLabelText(/Password*/i);
    const submitButton = screen.getByRole("button", { name: /Continue/i });

    // Check that the items are present
    expect(inputUsername).toBeInTheDocument();
    expect(inputPassword).toBeInTheDocument();
    expect(submitButton).toBeInTheDocument();

    // Enter data into the input fields
    await userEvent.type(inputUsername, "testuser");
    await userEvent.type(inputPassword, "testpassword");

    // Submit the form
    await userEvent.click(submitButton);

    // Check that loginAction has been called with the correct data.
    await waitFor(() => {
      expect(mockLoginAction).toHaveBeenCalledWith("testuser", "testpassword");
    });

    // Check that no errors are displayed.
    expect(
      screen.queryByText("Invalid username or password")
    ).not.toBeInTheDocument();
  });

  // Fail
  it("Wrong login, error message", async () => {
    // Mocks
    const mockLoginActionFailed = jest
      .fn()
      .mockRejectedValue(new Error("Login Failed"));
    const mockNavigate = jest.fn();

    useAuth.mockReturnValue({ loginAction: mockLoginActionFailed });
    useNavigate.mockReturnValue(mockNavigate);

    renderLogin();

    const inputUsername = screen.getByLabelText(/User Name*/i);
    const inputPassword = screen.getByLabelText(/Password*/i);
    const submitButton = screen.getByRole("button", { name: /Continue/i });

    await userEvent.type(inputUsername, "falseuser");
    await userEvent.type(inputPassword, "falsepassword");

    await userEvent.click(submitButton);

    await waitFor(() => {
      expect(mockLoginActionFailed).toHaveBeenCalledWith(
        "falseuser",
        "falsepassword"
      );
      /* When the form is submitted, we expect to see a paragraph in the DOM: ‘Invalid username or password’.
         Given that it is the mock that will fail that is called  */
      expect(
        screen.getByText("Invalid username or password")
      ).toBeInTheDocument();
    });
  });
});
describe("Login one-time code step", () => {
  const mfaRequired = () =>
    Object.assign(new Error("HTTP error! status: 401"), {
      status: 401,
      body: { detail: "mfa_required" },
      mfaRequired: true,
    });

  const renderLogin = () =>
    render(
      <BrowserRouter>
        <Login />
      </BrowserRouter>
    );

  const signIn = async () => {
    await userEvent.type(screen.getByLabelText(/User Name*/i), "testuser");
    await userEvent.type(screen.getByLabelText(/Password*/i), "testpassword");
    await userEvent.click(screen.getByRole("button", { name: /Continue/i }));
  };

  beforeEach(() => {
    useNavigate.mockReturnValue(jest.fn());
  });

  it("shows the code step when the API answers mfa_required", async () => {
    const mockLoginAction = jest.fn().mockRejectedValueOnce(mfaRequired());
    useAuth.mockReturnValue({ loginAction: mockLoginAction });

    renderLogin();
    await signIn();

    const codeInput = await screen.findByLabelText(/One-time code/i);
    expect(codeInput).toHaveAttribute("inputmode", "numeric");
    expect(codeInput).toHaveAttribute("autocomplete", "one-time-code");
    expect(codeInput).toHaveFocus();
    expect(screen.getByRole("button", { name: /Verify/i })).toBeInTheDocument();
    expect(screen.queryByLabelText(/Password*/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(mockLoginAction).toHaveBeenCalledWith("testuser", "testpassword");
  });

  it("sends username, password and code when the code is submitted", async () => {
    const mockLoginAction = jest
      .fn()
      .mockRejectedValueOnce(mfaRequired())
      .mockResolvedValueOnce(undefined);
    useAuth.mockReturnValue({ loginAction: mockLoginAction });

    renderLogin();
    await signIn();
    await userEvent.type(await screen.findByLabelText(/One-time code/i), "123 456");
    await userEvent.click(screen.getByRole("button", { name: /Verify/i }));

    await waitFor(() => {
      expect(mockLoginAction).toHaveBeenLastCalledWith("testuser", "testpassword", "123456");
    });
    expect(mockLoginAction).toHaveBeenCalledTimes(2);
    expect(screen.getByLabelText(/One-time code/i)).toHaveValue("");
  });

  it("stays on the code step and explains when the code is wrong", async () => {
    const mockLoginAction = jest
      .fn()
      .mockRejectedValueOnce(mfaRequired())
      .mockRejectedValueOnce(mfaRequired());
    useAuth.mockReturnValue({ loginAction: mockLoginAction });

    renderLogin();
    await signIn();
    await userEvent.type(await screen.findByLabelText(/One-time code/i), "000000");
    await userEvent.click(screen.getByRole("button", { name: /Verify/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/code was not accepted/i);
    expect(screen.getByLabelText(/One-time code/i)).toHaveValue("");
    expect(screen.getByLabelText(/One-time code/i)).toHaveFocus();
  });

  it("does not send a code that is blank after trimming", async () => {
    const mockLoginAction = jest.fn().mockRejectedValueOnce(mfaRequired());
    useAuth.mockReturnValue({ loginAction: mockLoginAction });

    renderLogin();
    await signIn();
    await userEvent.type(await screen.findByLabelText(/One-time code/i), "   ");
    await userEvent.click(screen.getByRole("button", { name: /Verify/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/code was not accepted/i);
    expect(mockLoginAction).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText(/One-time code/i)).toHaveValue("");
    expect(screen.getByLabelText(/One-time code/i)).toHaveFocus();
  });

  it("returns to step one with the usual message for any other error on the code step", async () => {
    const consoleSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    const mockLoginAction = jest
      .fn()
      .mockRejectedValueOnce(mfaRequired())
      .mockRejectedValueOnce(Object.assign(new Error("HTTP error! status: 429"), { status: 429 }));
    useAuth.mockReturnValue({ loginAction: mockLoginAction });

    renderLogin();
    await signIn();
    await userEvent.type(await screen.findByLabelText(/One-time code/i), "123456");
    await userEvent.click(screen.getByRole("button", { name: /Verify/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Invalid username or password");
    expect(screen.getByLabelText(/User Name*/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/One-time code/i)).not.toBeInTheDocument();
    consoleSpy.mockRestore();
  });

  it("Cancel returns to step one and clears the attempt", async () => {
    const mockLoginAction = jest.fn().mockRejectedValueOnce(mfaRequired());
    useAuth.mockReturnValue({ loginAction: mockLoginAction });

    renderLogin();
    await signIn();
    await userEvent.type(await screen.findByLabelText(/One-time code/i), "12");
    await userEvent.click(screen.getByRole("button", { name: /Cancel/i }));

    const usernameInput = screen.getByLabelText(/User Name*/i);
    expect(usernameInput).toHaveValue("");
    expect(usernameInput).toHaveFocus();
    expect(screen.getByLabelText(/Password*/i)).toHaveValue("");
    expect(screen.queryByLabelText(/One-time code/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();

    // A new attempt starts from scratch: no stale code is sent.
    mockLoginAction.mockResolvedValueOnce(undefined);
    await signIn();
    await waitFor(() => {
      expect(mockLoginAction).toHaveBeenLastCalledWith("testuser", "testpassword");
    });
  });
});

describe("Unauthorized component test", () => {
  it("All items are displayed", () => {
    render(
      <BrowserRouter>
        <Unauthorized />
      </BrowserRouter>
    );
    expect(screen.getByText("Unauthorised")).toBeInTheDocument();
    expect(
      screen.getByText(/You are not authorised to access this app./)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Return to login/i)
    ).toBeInTheDocument();
  });
});
