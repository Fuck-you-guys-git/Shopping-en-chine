import { createContext, useContext, useEffect, useState } from "react";
import { authAPI, setSellerToken, getSellerToken } from "@/lib/api";
import { toast } from "sonner";

/*
 * Seller authentication — now backed by the server (JWT + bcrypt).
 * Credentials are verified by POST /api/auth/login; the token is attached
 * to every API call (see lib/api.js) to protect product management routes.
 */
const AuthContext = createContext(null);
const USER_KEY = "sec_seller_user_v2";

export const SellerAuthProvider = ({ children }) => {
    const [user, setUser] = useState(() => {
        try {
            const raw = localStorage.getItem(USER_KEY);
            return raw && getSellerToken() ? JSON.parse(raw) : null;
        } catch {
            return null;
        }
    });

    // Validate the stored session against the server on mount
    useEffect(() => {
        if (!getSellerToken()) return;
        authAPI.me()
            .then((u) => {
                setUser((prev) => ({ ...prev, ...u }));
            })
            .catch(() => {
                setSellerToken(null);
                localStorage.removeItem(USER_KEY);
                setUser(null);
            });
    }, []);

    useEffect(() => {
        if (user) localStorage.setItem(USER_KEY, JSON.stringify(user));
        else localStorage.removeItem(USER_KEY);
    }, [user]);

    // Token expiré (401 renvoyé par l'API) → déconnexion + message clair.
    // ProtectedSellerRoute redirige alors automatiquement vers la page de connexion.
    useEffect(() => {
        const onExpired = () => {
            setSellerToken(null);
            localStorage.removeItem(USER_KEY);
            setUser(null);
            const path = window.location.pathname;
            if (path.startsWith("/vendeur") || path.startsWith("/admin")) {
                toast.error("Session expirée", { description: "Veuillez vous reconnecter pour continuer." });
            }
        };
        window.addEventListener("seller-session-expired", onExpired);
        return () => window.removeEventListener("seller-session-expired", onExpired);
    }, []);

    const login = async (email, password) => {
        try {
            const res = await authAPI.login(email, password);
            setSellerToken(res.token);
            const session = { ...res.user, loggedAt: Date.now() };
            setUser(session);
            return session;
        } catch (err) {
            const msg = err.response?.data?.detail || "Email ou mot de passe incorrect";
            throw new Error(msg);
        }
    };

    const logout = () => {
        setSellerToken(null);
        setUser(null);
        authAPI.logout().catch(() => {});
    };

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
