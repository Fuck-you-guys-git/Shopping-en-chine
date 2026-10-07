import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { categories } from "@/data/products";
import { useCatalog } from "@/context/CatalogContext";
import { useSellerAuth } from "@/context/SellerAuthContext";
import { adminAPI } from "@/lib/api";

const SellerContext = createContext(null);
const POLL_MS = 30000;
const NEW_FOR_MS = 10 * 60 * 1000; // badge "Nouveau" on orders younger than this

// Mirrors ORDER_STATUSES in backend/orders.py.
const STATUSES = [
    "en attente de paiement",
    "paiement à vérifier",
    "confirmée",
    "en préparation",
    "expédiée",
    "livrée",
    "annulée",
];
const STATUS_LABELS = {
    "en attente de paiement": { label: "Paiement en attente", color: "bg-muted text-muted-foreground", dot: "bg-muted-foreground" },
    "paiement à vérifier": { label: "Paiement à vérifier", color: "bg-amber-100 text-amber-800", dot: "bg-amber-500" },
    confirmée: { label: "Confirmée", color: "bg-primary/10 text-primary", dot: "bg-primary" },
    "en préparation": { label: "En préparation", color: "bg-blue-100 text-blue-700", dot: "bg-blue-500" },
    expédiée: { label: "Expédiée", color: "bg-purple-100 text-purple-700", dot: "bg-purple-500" },
    livrée: { label: "Livrée", color: "bg-success/15 text-success", dot: "bg-success" },
    annulée: { label: "Annulée", color: "bg-destructive/10 text-destructive", dot: "bg-destructive" },
};
export const getStatus = (status) =>
    STATUS_LABELS[status] || { label: status, color: "bg-muted text-muted-foreground", dot: "bg-muted-foreground" };

// Delivery steps shown as a progress bar on an order.
export const FULFILMENT_STEPS = ["confirmée", "en préparation", "expédiée", "livrée"];
// Orders counted in revenue: paid, or to be paid on delivery.
const COUNTED = new Set(["paiement à vérifier", "confirmée", "en préparation", "expédiée", "livrée"]);
// Orders waiting on the seller.
const TO_HANDLE = new Set(["paiement à vérifier", "confirmée", "en préparation", "expédiée"]);

export const PAYMENT_LABELS = {
    livraison: "Paiement à la livraison",
    mobile_money: "Wave / Orange Money",
    carte: "Carte bancaire",
};

const fullName = (customer) => `${customer.first_name} ${customer.last_name}`;

/** An API order, plus the fields the seller pages display directly. */
const toView = (order, productsById) => {
    const createdAt = Date.parse(order.created_at);
    return {
        ...order,
        contact: order.customer,
        customer: fullName(order.customer),
        city: order.customer.city,
        createdAt,
        fresh: Date.now() - createdAt < NEW_FOR_MS,
        items: order.items.map((it) => ({ ...it, id: it.product_id, image: productsById.get(it.product_id)?.image })),
    };
};

/** Real orders and products for the seller area (requires a seller session). */
export const SellerProvider = ({ children }) => {
    const { token, logout } = useSellerAuth();
    const catalog = useCatalog();
    const [rawOrders, setRawOrders] = useState([]);
    const [ordersStatus, setOrdersStatus] = useState("loading");
    const [liveEvents, setLiveEvents] = useState([]);
    const knownIds = useRef(null);

    useEffect(() => {
        // Demo data from the old browser-only seller area.
        try {
            localStorage.removeItem("sec_seller_products_v1");
            localStorage.removeItem("sec_seller_orders_v1");
        } catch {
            // storage unavailable
        }
    }, []);

    const refreshOrders = useCallback(async () => {
        try {
            const list = await adminAPI.orders(token);
            if (knownIds.current) {
                const arrived = list.filter((o) => !knownIds.current.has(o.id));
                if (arrived.length) {
                    setLiveEvents((events) =>
                        [
                            ...arrived.map((o) => ({ id: o.id, type: "new", customer: fullName(o.customer), city: o.customer.city, total: o.total, at: Date.now() })),
                            ...events,
                        ].slice(0, 10),
                    );
                }
            }
            knownIds.current = new Set(list.map((o) => o.id));
            setRawOrders(list);
            setOrdersStatus("ready");
        } catch (err) {
            if (err.response?.status === 401) logout();
            else setOrdersStatus((s) => (s === "ready" ? s : "error"));
        }
    }, [token, logout]);

    useEffect(() => {
        refreshOrders();
        const timer = setInterval(refreshOrders, POLL_MS);
        return () => clearInterval(timer);
    }, [refreshOrders]);

    const products = catalog.products;
    const productsById = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
    const orders = useMemo(() => rawOrders.map((o) => toView(o, productsById)), [rawOrders, productsById]);

    // ---- Actions (each throws on failure; callers show the error) ----
    const updateOrderStatus = async (id, status) => {
        const updated = await adminAPI.updateOrder(token, id, status);
        setRawOrders((list) => list.map((o) => (o.id === id ? updated : o)));
        setLiveEvents((events) =>
            [{ id, type: "status", status: getStatus(status).label, customer: fullName(updated.customer), at: Date.now() }, ...events].slice(0, 10),
        );
        return updated;
    };

    const addProduct = async ({ oldPrice, ...product }) => {
        const created = await adminAPI.createProduct(token, { ...product, old_price: oldPrice ?? null });
        catalog.reload();
        return created;
    };

    const deleteProduct = async (id) => {
        await adminAPI.deleteProduct(token, id);
        catalog.reload();
    };

    // ---- Metrics (from real orders) ----
    const metrics = useMemo(() => {
        const now = Date.now();
        const counted = orders.filter((o) => COUNTED.has(o.status));
        const last30 = counted.filter((o) => now - o.createdAt <= 30 * 86400000);
        const revenue30 = last30.reduce((s, o) => s + o.total, 0);

        const daily = [];
        for (let i = 13; i >= 0; i--) {
            const dayStart = new Date(now - i * 86400000).setHours(0, 0, 0, 0);
            const dayEnd = dayStart + 86400000;
            daily.push({
                day: new Date(dayStart).toLocaleDateString("fr-FR", { day: "2-digit", month: "short" }),
                revenue: counted.filter((o) => o.createdAt >= dayStart && o.createdAt < dayEnd).reduce((s, o) => s + o.total, 0),
            });
        }

        const productRevenue = {};
        counted.forEach((o) => o.items.forEach((it) => {
            productRevenue[it.id] = (productRevenue[it.id] || 0) + it.price * it.qty;
        }));
        const topProducts = Object.entries(productRevenue)
            .map(([id, rev]) => (productsById.has(id) ? { ...productsById.get(id), soldRevenue: rev } : null))
            .filter(Boolean)
            .sort((a, b) => b.soldRevenue - a.soldRevenue)
            .slice(0, 5);

        const catDist = categories
            .map((c) => ({
                name: c.name,
                value: counted.reduce(
                    (s, o) => s + o.items.filter((it) => productsById.get(it.id)?.category === c.id).reduce((ss, it) => ss + it.price * it.qty, 0),
                    0,
                ),
            }))
            .filter((c) => c.value > 0);

        return {
            revenue30,
            orders30: last30.length,
            avgBasket: last30.length ? revenue30 / last30.length : 0,
            active: orders.filter((o) => TO_HANDLE.has(o.status)).length,
            toVerify: orders.filter((o) => o.status === "paiement à vérifier").length,
            delivered: orders.filter((o) => o.status === "livrée").length,
            daily,
            topProducts,
            catDist,
        };
    }, [orders, productsById]);

    return (
        <SellerContext.Provider
            value={{
                products, addProduct, deleteProduct,
                orders, ordersStatus, refreshOrders, updateOrderStatus,
                liveEvents,
                metrics,
                STATUS_LABELS, STATUSES,
            }}
        >
            {children}
        </SellerContext.Provider>
    );
};

export const useSeller = () => {
    const ctx = useContext(SellerContext);
    if (!ctx) throw new Error("useSeller must be used within SellerProvider");
    return ctx;
};
