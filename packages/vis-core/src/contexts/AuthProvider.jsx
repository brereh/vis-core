import React, { useContext, createContext, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Cookies from 'js-cookie';
import { api } from "services";
import { jwtDecode } from 'jwt-decode';

export const AuthContext = createContext();

/** `detail` an API returns with a 401 when the password was right but a one-time code is needed. */
export const MFA_REQUIRED = 'mfa_required';

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [token, setToken] = useState(Cookies.get('token') || '');
    const navigate = useNavigate();

    /**
     * Signs in. `otp` is sent only when given, so APIs without a one-time code step see no change.
     * If the API answers 401 with `{ detail: "mfa_required" }`, the rethrown error has
     * `mfaRequired: true` so `Login` can ask for the code.
     */
    const loginAction = async (username, password, otp) => {
        try {
            const path = '/api/webusers/login'; // The API endpoint for login

            // Make POST request using BaseService
            const usercred = otp ? { username, password, otp } : { username, password };
            const response = await api.baseService.post(path, usercred, { skipAuth: true });

           
            const jwtToken = response.token;

            // Decode the JWT token to get the roles
            const decodedToken = jwtDecode(jwtToken);
            const userRoles = decodedToken["http://schemas.microsoft.com/ws/2008/06/identity/claims/role"] || [];

            setUser({ username, roles: userRoles });
            setToken(jwtToken);

            const tokenExpirationTime = decodedToken.exp;

            // Calculate the expiration date for the cookie
            const expirationDate = new Date(tokenExpirationTime * 1000);

            // Set the cookie with the calculated expiration date
            Cookies.set('token', jwtToken, { expires: expirationDate, secure: true, sameSite: 'Lax' });
            Cookies.set('toc', false);
            navigate('/');
        } catch (err) {
            if (err?.status === 401 && err?.body?.detail === MFA_REQUIRED) {
                err.mfaRequired = true;
                throw err;
            }
            console.error('Login failed:', err);
            throw err;
        }
    };

    const logOut = () => {
        setUser(null);
        setToken('');
        Cookies.remove('token');
        navigate('/login');
    };

    return (
        <AuthContext.Provider value={{ user, token, loginAction, logOut }}>
            {children}
        </AuthContext.Provider>
    );
};

export default AuthProvider;

export const useAuth = () => {
    return useContext(AuthContext);
};