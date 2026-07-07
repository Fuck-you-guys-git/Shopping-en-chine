import { createContext, useContext, useEffect, useState } from "react";

const AuthContext = createContext(null);
const AUTH_KEY = "sec_seller_auth_v1";

/*
 * SELLER CREDENTIALS
 * ------------------------------------------------------------------
 * This is a frontend-only prototype. In real production, credentials
 * MUST live server-side with hashed passwords (bcrypt).
 *
 * ⚠️  To change the login credentials, edit the CREDENTIALS list
 *     below and redeploy the app.
 *
 * Only accounts listed here can access /admin and /vendeur.
 * No public signup is exposed anywhere in the app.
 */
const CREDENTIALS = [
    {
        email: "Modou.ba.568@gmail.com",
        password: "40881215.Com",
        name: "Modou Ba",
        role: "Propriétaire",
    },
];

export const SellerAuthProvider = ({ children }) => {
    const [user, setUser] = useState(() => {
        try {
            const raw = localStorage.getItem(AUTH_KEY);
            return raw ? JSON.parse(raw) : null;
        } catch {
            return null;
        }
    });

    useEffect(() => {
        if (user) localStorage.setItem(AUTH_KEY, JSON.stringify(user));
        else localStorage.removeItem(AUTH_KEY);
    }, [user]);

    const login = async (email, password) => {
        // Simulate a network round-trip
        await new Promise((r) => setTimeout(r, 600));
        const normalizedEmail = (email || "").toLowerCase().trim();
        const match = CREDENTIALS.find(
            (c) => c.email.toLowerCase() === normalizedEmail && c.password === password,
        );
        if (!match) {
            throw new Error("Email ou mot de passe incorrect");
        }
        const session = {
            email: match.email,
            name: match.name,
            role: match.role || "Vendeur",
            loggedAt: Date.now(),
        };
        setUser(session);
        return session;
    };

    const logout = () => setUser(null);

    return (
        <AuthContext.Provider value={{ user, login, logout, isAuthenticated: !!user }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useSellerAuth = () => {
    const ctx = useContext(AuthContext);
    if (!ctx) throw new Error("useSellerAuth must be used within SellerAuthProvider");
    return ctx;
};
