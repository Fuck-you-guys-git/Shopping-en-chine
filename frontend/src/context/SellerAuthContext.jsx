import { createContext, useContext, useEffect, useState } from "react";

const AuthContext = createContext(null);
const AUTH_KEY = "sec_seller_auth_v1";
const USERS_KEY = "sec_seller_users_v1";

// Built-in demo account (always available as fallback)
const DEMO_USER = {
    email: "admin@shoppingenchine.com",
    password: "shopping2026",
    name: "Shop Center",
    role: "Vendeur Pro",
    isDemo: true,
};

const loadUsers = () => {
    try {
        const raw = localStorage.getItem(USERS_KEY);
        return raw ? JSON.parse(raw) : [];
    } catch {
        return [];
    }
};

export const SellerAuthProvider = ({ children }) => {
    const [user, setUser] = useState(() => {
        try {
            const raw = localStorage.getItem(AUTH_KEY);
            return raw ? JSON.parse(raw) : null;
        } catch {
            return null;
        }
    });
    const [users, setUsers] = useState(loadUsers);

    useEffect(() => {
        if (user) localStorage.setItem(AUTH_KEY, JSON.stringify(user));
        else localStorage.removeItem(AUTH_KEY);
    }, [user]);

    useEffect(() => {
        localStorage.setItem(USERS_KEY, JSON.stringify(users));
    }, [users]);

    const login = async (email, password) => {
        await new Promise((r) => setTimeout(r, 600));
        const normalizedEmail = email.toLowerCase().trim();
        const allUsers = [DEMO_USER, ...loadUsers()];
        const match = allUsers.find(
            (c) => c.email.toLowerCase() === normalizedEmail && c.password === password,
        );
        if (!match) {
            throw new Error("Email ou mot de passe incorrect");
        }
        const session = {
            email: match.email,
            name: match.name,
            role: match.role || "Vendeur",
            isDemo: !!match.isDemo,
            loggedAt: Date.now(),
        };
        setUser(session);
        return session;
    };

    const register = async ({ name, email, password, shopName }) => {
        await new Promise((r) => setTimeout(r, 700));
        const normalizedEmail = email.toLowerCase().trim();
        if (normalizedEmail === DEMO_USER.email.toLowerCase()) {
            throw new Error("Cet email est réservé");
        }
        const existing = loadUsers();
        if (existing.some((u) => u.email.toLowerCase() === normalizedEmail)) {
            throw new Error("Un compte existe déjà avec cet email");
        }
        if (password.length < 6) {
            throw new Error("Le mot de passe doit contenir au moins 6 caractères");
        }
        const newUser = {
            email: normalizedEmail,
            password, // NOTE: prototype only — never store plaintext in production
            name: name.trim(),
            role: shopName ? shopName.trim() : "Vendeur",
            createdAt: Date.now(),
        };
        const updated = [...existing, newUser];
        setUsers(updated);

        const session = {
            email: newUser.email,
            name: newUser.name,
            role: newUser.role,
            loggedAt: Date.now(),
        };
        setUser(session);
        return session;
    };

    const logout = () => setUser(null);

    const changePassword = async (currentPassword, newPassword) => {
        if (!user) throw new Error("Non connecté");
        if (newPassword.length < 6) throw new Error("Mot de passe trop court (min. 6 caractères)");
        if (user.isDemo) throw new Error("Impossible de modifier le compte démo");
        const allUsers = loadUsers();
        const idx = allUsers.findIndex((u) => u.email.toLowerCase() === user.email.toLowerCase());
        if (idx === -1) throw new Error("Utilisateur introuvable");
        if (allUsers[idx].password !== currentPassword) throw new Error("Mot de passe actuel incorrect");
        allUsers[idx] = { ...allUsers[idx], password: newPassword };
        setUsers(allUsers);
        return true;
    };

    return (
        <AuthContext.Provider
            value={{
                user,
                users,
                login,
                register,
                logout,
                changePassword,
                isAuthenticated: !!user,
            }}
        >
            {children}
        </AuthContext.Provider>
    );
};

export const useSellerAuth = () => {
    const ctx = useContext(AuthContext);
    if (!ctx) throw new Error("useSellerAuth must be used within SellerAuthProvider");
    return ctx;
};
