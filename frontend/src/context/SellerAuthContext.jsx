import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { adminAPI, apiErrorMessage } from "@/lib/api";

const AuthContext = createContext(null);
const AUTH_KEY = "sec_seller_auth_v2";

/*
 * Seller login, checked by the server (POST /api/admin/login). The email and
 * password live only in the server's environment (ADMIN_EMAIL / ADMIN_PASSWORD).
 * The session token is kept in localStorage; the server stops accepting it after
 * 7 days or when the password changes.
 */
export const SellerAuthProvider = ({ children }) => {
    const [user, setUser] = useState(() => {
        try {
            localStorage.removeItem("sec_seller_auth_v1"); // pre-server-login session
            const raw = localStorage.getItem(AUTH_KEY);
            return raw ? JSON.parse(raw) : null;
        } catch {
            return null;
        }
    });

    useEffect(() => {
        try {
            if (user) localStorage.setItem(AUTH_KEY, JSON.stringify(user));
            else localStorage.removeItem(AUTH_KEY);
        } catch {
            // storage unavailable: the session lasts for this visit
        }
    }, [user]);

    const token = user?.token ?? null;

    // Drop a saved session the server no longer accepts.
    useEffect(() => {
        if (!token) return;
        adminAPI.me(token).catch((err) => {
            if (err.response?.status === 401) setUser(null);
        });
    }, [token]);

    const login = async (email, password) => {
        try {
            const session = await adminAPI.login(email, password);
            setUser({ ...session, role: "Administrateur" });
            return session;
        } catch (err) {
            throw new Error(apiErrorMessage(err));
        }
    };

    const logout = useCallback(() => setUser(null), []);

    return (
        <AuthContext.Provider value={{ user, token, login, logout, isAuthenticated: !!user }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useSellerAuth = () => {
    const ctx = useContext(AuthContext);
    if (!ctx) throw new Error("useSellerAuth must be used within SellerAuthProvider");
    return ctx;
};
