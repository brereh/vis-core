# Login One-Time Code Step

`Login` can ask for a one-time code (for example from an authenticator app) after the username and password, when the API asks for one. APIs that never ask see no change.

## API contract

`AuthProvider.loginAction` posts to `/api/webusers/login`.

| Request | Response | What `Login` does |
| --- | --- | --- |
| `{ username, password }` | `200 { token }` | Signs in, as before. |
| `{ username, password }` | `401 { "detail": "mfa_required" }` | Shows the one-time code step. |
| `{ username, password, otp }` | `200 { token }` | Signs in. |
| `{ username, password, otp }` | `401 { "detail": "mfa_required" }` | Stays on the code step: "That code was not accepted…". |
| Any | Any other error (wrong password, `429` lockout, network) | "Invalid username or password", on the first step, as before. |

- `otp` is sent only on the code step. The first request is exactly `{ username, password }`.
- Spaces in the typed code are removed before it is sent. No length or format is enforced; the API decides.
- An API that never returns `mfa_required` never shows the code step.

## `loginAction(username, password, otp?)`

- `otp` is optional and is added to the request body only when given.
- When the API answers `401` with `detail === "mfa_required"`, the error `loginAction` rethrows has `mfaRequired: true`. Other errors are rethrown unchanged.

`BaseService.post` errors keep their message (`HTTP error! status: <code>`) and now also carry `status` and, when the response body is JSON, `body`.

## The code step

- A labelled "One-time code" field with `inputmode="numeric"` and `autocomplete="one-time-code"`, so phones offer the number pad and can fill codes from messages or password managers.
- **Verify** submits the code. **Cancel** returns to the first step.
- Focus moves to the code field when the step opens, and back to the username field on Cancel or on an error that returns to the first step.
- Errors use the same `role="alert"` region as the first step.

## What is kept, and for how long

- The username and password stay in `Login`'s React state only for the current attempt. They are cleared on success, on Cancel, and when `Login` unmounts.
- The code is never stored: it is cleared after every Verify, successful or not, and is not written to cookies or storage.

## Tests

- `src/Components/Login/Login.test.jsx`: the unchanged first step, the code step, the three-field submit, a wrong code, other errors and Cancel.
- `src/Components/Login/Login.accessibility.test.jsx`: jest-axe on both steps.
- `src/contexts/AuthProvider.test.jsx`: the request body with and without `otp`, and the `mfaRequired` flag.
- `src/services/api/Base.test.js`: `status` and `body` on `post` errors.
