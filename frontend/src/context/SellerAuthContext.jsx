import { createContext, useContext, useEffect, useState } from "react";

const AuthContext = createContext(null);
const AUTH_KEY = "sec_seller_auth_v1";

// Prototype credentials — in production these would live server-side
const DEFAULT_CREDENTIALS = [
    {
        email: "admin@shoppingenchine.com",
        password: "shopping2026",
        name: "Shop Center",
        role: "Vendeur Pro",
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
        // Simulate async network call
        await new Promise((r) => setTimeout(r, 700));
        const match = DEFAULT_CREDENTIALS.find(
            (c) => c.email.toLowerCase() === email.toLowerCase().trim() && c.password === password,
        );
        if (!match) {
            throw new Error("Identifiants incorrects");
        }
        const session = {
            email: match.email,
            name: match.name,
            role: match.role,
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
