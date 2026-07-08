import { createContext, useContext, useEffect, useMemo, useState } from "react";

const CartContext = createContext(null);
const STORAGE_KEY = "sec_cart_v1";

export const CartProvider = ({ children }) => {
    const [items, setItems] = useState(() => {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            return raw ? JSON.parse(raw) : [];
        } catch {
            return [];
        }
    });
    const [drawerOpen, setDrawerOpen] = useState(false);

    useEffect(() => {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    }, [items]);

    const addItem = (product, qty = 1) => {
        setItems((prev) => {
            const found = prev.find((i) => i.id === product.id);
            if (found) {
                return prev.map((i) =>
                    i.id === product.id ? { ...i, qty: i.qty + qty } : i,
                );
            }
            return [...prev, { ...product, qty }];
        });
    };

    const removeItem = (id) => setItems((prev) => prev.filter((i) => i.id !== id));
    const updateQty = (id, qty) =>
        setItems((prev) =>
            prev.map((i) => (i.id === id ? { ...i, qty: Math.max(1, qty) } : i)),
        );
    const clear = () => setItems([]);

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
