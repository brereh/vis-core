import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from "contexts/AuthProvider";
import './Login.css';

const INVALID_CREDENTIALS = 'Invalid username or password';
const INVALID_CODE = 'That code was not accepted. Check your authenticator app and try again.';

export const Login = () => {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    // "credentials", or "otp" once the API asks for a one-time code (401 `mfa_required`).
    const [step, setStep] = useState('credentials');
    const [otp, setOtp] = useState('');
    const usernameRef = useRef(null);
    const otpRef = useRef(null);
    const navigate = useNavigate();
    const { loginAction } = useAuth();

    // Move focus to the first field of whichever step is showing, after a step change.
    const focusStep = useRef(false);
    useEffect(() => {
        if (!focusStep.current) return;
        focusStep.current = false;
        (step === 'otp' ? otpRef : usernameRef).current?.focus();
    }, [step]);

    const goToStep = (next) => {
        focusStep.current = true;
        setStep(next);
    };

    // Username and password are kept only in this component's state for the current attempt.
    const clearAttempt = () => {
        setUsername('');
        setPassword('');
        setOtp('');
    };

    const handleLogin = async (e) => {
        e.preventDefault();
        setError(''); // Clear previous errors

        try {
            await loginAction(username, password);
        } catch (err) {
            if (err?.mfaRequired) {
                goToStep('otp');
                return;
            }
            console.error('Login failed:', err);
            setError(INVALID_CREDENTIALS);
        }
    };

    const handleVerify = async (e) => {
        e.preventDefault();
        setError('');
        const code = otp.replace(/\s+/g, '');

        try {
            await loginAction(username, password, code);
            clearAttempt();
        } catch (err) {
            setOtp('');
            if (err?.mfaRequired) {
                setError(INVALID_CODE);
                otpRef.current?.focus();
                return;
            }
            // Anything else (lockout, password no longer valid, network) is reported as before.
            console.error('Login failed:', err);
            setError(INVALID_CREDENTIALS);
            goToStep('credentials');
        }
    };

    const handleCancel = () => {
        clearAttempt();
        setError('');
        goToStep('credentials');
    };

    return (
        <div className="login-container">
            <div className="login-box">
                <img src='/img/tfn-logo-fullsize.png' alt="Transport for the North" className="login-logo" />
                {step === 'otp' ? (
                    <>
                        <h2>Enter your code</h2>
                        <p>Open your authenticator app and enter the one-time code for this account.</p>
                        <form onSubmit={handleVerify}>
                            <label htmlFor="otp">One-time code*</label>
                            <input
                                ref={otpRef}
                                type="text"
                                id="otp"
                                name="otp"
                                value={otp}
                                onChange={(e) => setOtp(e.target.value)}
                                inputMode="numeric"
                                autoComplete="one-time-code"
                                aria-describedby={error ? "login-error" : undefined}
                                required
                            />

                            {error && (
                                <p id="login-error" className="error-message" role="alert" aria-live="assertive">
                                    {error}
                                </p>
                            )}
                            <button type="submit">Verify</button>
                            <button type="button" className="login-secondary-button" onClick={handleCancel}>
                                Cancel
                            </button>
                        </form>
                    </>
                ) : (
                    <>
                        <h2>Welcome</h2>
                        <p>Log in to Transport for the North to continue to the Appraisal Platform.</p>
                        <form onSubmit={handleLogin}>
                            <label htmlFor="username">User Name*</label>
                            <input
                                ref={usernameRef}
                                type="text"
                                id="username"
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                autoComplete="username"
                                aria-describedby={error ? "login-error" : undefined}
                                required
                            />
                            <label htmlFor="password">Password*</label>
                            <input
                                type="password"
                                id="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                autoComplete="current-password"
                                aria-describedby={error ? "login-error" : undefined}
                                required
                            />

                            {error && (
                                <p id="login-error" className="error-message" role="alert" aria-live="assertive">
                                    {error}
                                </p>
                            )}
                            <button type="submit">Continue</button>
                        </form>
                    </>
                )}
                <p className="RequestLogin">
                    <button
                        type="button"
                        onClick={() => {
                            window.open(
                                'https://forms.office.com/Pages/ResponsePage.aspx?id=HZ6K1cpNlUWp6Hk0oV80GRcTERVASNVEmqyTtKGGoIpUMFBLTVpIMlFTQjBORExHM1Q4MElMREVYRy4u',
                                '_blank',
                                'noopener,noreferrer'
                            );
                        }}
                    >
                        Request Access to this App
                    </button>
                </p>

            </div>
        </div>
    );
};

export default Login;
