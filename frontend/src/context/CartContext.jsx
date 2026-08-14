import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

const CartContext = createContext(null);
const STORAGE_KEY = "sec_cart_v1";

// Identifiant de ligne : même produit + tailles différentes = lignes séparées
const lineKey = (id, size, color) => [id, size || "", color || ""].filter(Boolean).join("::");

export const CartProvider = ({ children }) => {
    const [items, setItems] = useState(() => {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            const parsed = raw ? JSON.parse(raw) : [];
            // Migration : anciennes lignes sans `line`
            return parsed.map((i) => ({ ...i, line: i.line || lineKey(i.id, i.size, i.color) }));
        } catch {
            return [];
        }
    });
    const [drawerOpen, setDrawerOpen] = useState(false);

    useEffect(() => {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    }, [items]);

    // Fonctions mémoïsées (identité stable) : utilisables sans risque dans les
    // tableaux de dépendances des useEffect (polling paiement, restauration panier…)
    const addItem = useCallback((product, qty = 1, size = null, color = null) => {
        // On ne stocke pas la galerie complète (base64 lourdes) dans le panier
        const { images: _images, ...slim } = product;
        const line = lineKey(product.id, size, color);
        setItems((prev) => {
            const found = prev.find((i) => i.line === line);
            if (found) {
                return prev.map((i) =>
                    i.line === line ? { ...i, qty: i.qty + qty } : i,
                );
            }
            return [...prev, { ...slim, qty, size: size || undefined, color: color || undefined, line }];
        });
    }, []);

    const removeItem = useCallback((line) => setItems((prev) => prev.filter((i) => i.line !== line)), []);
    const updateQty = useCallback((line, qty) =>
        setItems((prev) =>
            prev.map((i) => (i.line === line ? { ...i, qty: Math.max(1, qty) } : i)),
        ), []);
    const clear = useCallback(() => setItems([]), []);

    const subtotal = useMemo(
        () => items.reduce((s, i) => s + i.price * i.qty, 0),
        [items],
    );
    const count = useMemo(() => items.reduce((s, i) => s + i.qty, 0), [items]);

    return (
        <CartContext.Provider
            value={{
                items,
                addItem,
                removeItem,
                updateQty,
                clear,
                subtotal,
                count,
                drawerOpen,
                setDrawerOpen,
            }}
        >
            {children}
        </CartContext.Provider>
    );
};

export const useCart = () => {
    const ctx = useContext(CartContext);
    if (!ctx) throw new Error("useCart must be used within CartProvider");
    return ctx;
};
