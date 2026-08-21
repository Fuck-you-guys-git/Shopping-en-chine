import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { categories } from "@/data/products";
import { productsAPI, ordersAPI, trackingAPI } from "@/lib/api";
import { useCatalog } from "@/context/CatalogContext";

const SellerContext = createContext(null);

// Fulfilment statuses = the real tracking steps (shared with /suivi)
const STATUSES = ["ordered", "shipped", "customs", "delivery", "delivered"];
const STATUS_LABELS = {
    ordered: { label: "Commandé", color: "bg-primary/10 text-primary", dot: "bg-primary" },
    shipped: { label: "Expédié de Chine", color: "bg-blue-100 text-blue-700", dot: "bg-blue-500" },
    customs: { label: "En douane", color: "bg-amber-100 text-amber-700", dot: "bg-amber-500" },
    delivery: { label: "En livraison", color: "bg-purple-100 text-purple-700", dot: "bg-purple-500" },
    delivered: { label: "Livré", color: "bg-success/15 text-success", dot: "bg-success" },
};

const PAYMENT_LABELS = {
    success: { label: "Payée", color: "bg-success/15 text-success" },
    pending: { label: "Paiement en attente", color: "bg-amber-100 text-amber-700" },
    failed: { label: "Paiement échoué", color: "bg-destructive/10 text-destructive" },
};

// Statuts considérés comme PAYÉS — tolérant envers les anciennes commandes
// (période Stripe / anciennes versions) : variantes de « success » + étapes
// de livraison stockées dans status (une commande expédiée/livrée est payée).
const PAID_STATUSES = new Set([
    "success", "successful", "paid", "completed", "confirmed", "ok", "done",
    "shipped", "customs", "delivery", "delivered",
]);
const isPaidOrder = (o) => PAID_STATUSES.has(String(o.status || "").toLowerCase());

const mapOrder = (o, productsById) => ({
    id: o.id,
    customer: o.customer?.name || "Client",
    city: o.customer?.city || "—",
    email: o.customer?.email || null,
    phone: o.customer?.phone || null,
    address: o.customer?.address || null,
    items: (o.items || []).map((it) => ({
        id: it.product_id,
        product_id: it.product_id,
        name: it.name,
        price: it.price,
        qty: it.qty || 1,
        color: it.color || null,
        size: it.size || null,
        image: productsById[it.product_id]?.image || null,
    })),
    // Stats vendeur toujours en F CFA : amount_xof (équivalent) prioritaire,
    // sinon amount (commandes XOF historiques).
    total: o.amount_xof ?? o.amount ?? 0,
    paidAmount: o.amount ?? 0,
    paidCurrency: o.currency || "XOF",
    deliveryMode: o.delivery_mode === "express" ? "express" : "standard",
    payment: isPaidOrder(o) ? "success" : (PAYMENT_LABELS[o.status] ? o.status : "pending"),
    // Étape de suivi : tracking_step prioritaire ; anciennes commandes où
    // l'étape était stockée dans status : on la récupère aussi.
    status: STATUSES.includes(o.tracking_step)
        ? o.tracking_step
        : (STATUSES.includes(o.status) ? o.status : "ordered"),
    createdAt: Date.parse(o.created_at) || Date.now(),
});

export const SellerProvider = ({ children }) => {
    // Products live in MongoDB (via /api/products) — seule source de vérité.
    const [products, setProducts] = useState([]);
    const { refresh: refreshCatalog } = useCatalog();

    useEffect(() => {
        productsAPI.list()
            .then((list) => { if (Array.isArray(list)) setProducts(list); })
            .catch(() => {});
    }, []);

    // ---- Real customer orders (from db.orders, created by the checkout) ----
    const [orders, setOrders] = useState([]);
    const [ordersLoaded, setOrdersLoaded] = useState(false);

    const productsById = useMemo(
        () => Object.fromEntries(products.map((p) => [p.id, p])),
        [products],
    );

    const refreshOrders = useCallback(async () => {
        try {
            const list = await ordersAPI.list();
            if (Array.isArray(list)) {
                // Le Dashboard n'affiche que les commandes PAYÉES
                // (les paiements échoués ou en attente sont masqués)
                setOrders(
                    list.filter(isPaidOrder)
                        .map((o) => mapOrder(o, productsById)),
                );
            }
        } catch {
            // token expired / network — keep current list
        } finally {
            setOrdersLoaded(true);
        }
    }, [productsById]);

    useEffect(() => {
        refreshOrders();
        const t = setInterval(refreshOrders, 30000);
        return () => clearInterval(t);
    }, [refreshOrders]);

    // Live feed = the most recent real orders
    const liveEvents = useMemo(
        () => orders.slice(0, 5).map((o) => ({
            id: o.id, type: "new", customer: o.customer, city: o.city, total: o.total, at: o.createdAt,
        })),
        [orders],
    );

    // ---- Products CRUD (persisted server-side, visible to all customers) ----
    const addProduct = async (data) => {
        const created = await productsAPI.create(data);
        setProducts((prev) => [created, ...prev]);
        refreshCatalog();
        return created;
    };
    const updateProduct = async (id, patch) => {
        const current = products.find((p) => p.id === id) || {};
        const updated = await productsAPI.update(id, { ...current, ...patch });
        setProducts((prev) => prev.map((p) => (p.id === id ? { ...p, ...updated } : p)));
        refreshCatalog();
        return updated;
    };
    const deleteProduct = async (id) => {
        await productsAPI.remove(id);
        setProducts((prev) => prev.filter((p) => p.id !== id));
        refreshCatalog();
    };

    // ---- Order status (tracking step) — single + bulk, persisted ----
    const updateOrderStatus = async (id, step) => {
        await trackingAPI.updateStep(id, step);
        setOrders((prev) => prev.map((o) => (o.id === id ? { ...o, status: step } : o)));
    };

    const bulkUpdateOrderStatus = async (ids, step) => {
        const res = await ordersAPI.bulkTracking(ids, step);
        const idSet = new Set(ids);
        setOrders((prev) => prev.map((o) => (idSet.has(o.id) ? { ...o, status: step } : o)));
        return res;
    };

    // ---- Metrics (computed from real PAID orders) ----
    const metrics = useMemo(() => {
        const now = Date.now();
        const paid = orders.filter((o) => o.payment === "success");
        const last30 = paid.filter((o) => now - o.createdAt <= 30 * 86400000);
        const last7 = paid.filter((o) => now - o.createdAt <= 7 * 86400000);
        const today = paid.filter((o) => now - o.createdAt <= 86400000);

        // Périodes calendaires (jour / mois / année en cours) + total
        const d = new Date();
        const startOfDay = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
        const startOfMonth = new Date(d.getFullYear(), d.getMonth(), 1).getTime();
        const startOfYear = new Date(d.getFullYear(), 0, 1).getTime();
        const inRange = (from) => paid.filter((o) => o.createdAt >= from);
        const dayOrders = inRange(startOfDay);
        const monthOrders = inRange(startOfMonth);
        const yearOrders = inRange(startOfYear);
        const sum = (arr) => arr.reduce((s, o) => s + o.total, 0);

        const revenue30 = last30.reduce((s, o) => s + o.total, 0);
        const revenue7 = last7.reduce((s, o) => s + o.total, 0);
        const revenueToday = today.reduce((s, o) => s + o.total, 0);

        // Previous 30-day window (days 31–60) for REAL month-over-month trends
        const prev30 = paid.filter((o) => {
            const age = now - o.createdAt;
            return age > 30 * 86400000 && age <= 60 * 86400000;
        });
        const revenuePrev30 = prev30.reduce((s, o) => s + o.total, 0);
        const pct = (cur, prev) => (prev > 0 ? ((cur - prev) / prev) * 100 : null);
        const trendRevenue = pct(revenue30, revenuePrev30);
        const trendOrders = pct(last30.length, prev30.length);
        const avgPrev = prev30.length ? revenuePrev30 / prev30.length : 0;
        const avgCur = last30.length ? revenue30 / last30.length : 0;
        const trendBasket = pct(avgCur, avgPrev);

        const active = paid.filter((o) => o.status !== "delivered").length;
        const delivered = paid.filter((o) => o.status === "delivered").length;

        // Daily revenue for last 14 days
        const daily = [];
        for (let i = 13; i >= 0; i--) {
            const dayStart = now - i * 86400000;
            const dayLabel = new Date(dayStart).toLocaleDateString("fr-FR", { day: "2-digit", month: "short" });
            const dayRevenue = paid
                .filter((o) => o.createdAt >= dayStart - 43200000 && o.createdAt < dayStart + 43200000)
                .reduce((s, o) => s + o.total, 0);
            daily.push({ day: dayLabel, revenue: dayRevenue });
        }

        // Top products by revenue
        const productRevenue = {};
        paid.forEach((o) => {
            o.items.forEach((it) => {
                productRevenue[it.id] = (productRevenue[it.id] || 0) + it.price * it.qty;
            });
        });
        const topProducts = Object.entries(productRevenue)
            .map(([id, rev]) => {
                const p = productsById[id];
                return p ? { ...p, soldRevenue: rev } : null;
            })
            .filter(Boolean)
            .sort((a, b) => b.soldRevenue - a.soldRevenue)
            .slice(0, 5);

        // Category distribution
        const catDist = categories.map((c) => ({
            name: c.name,
            value: paid.reduce((s, o) => {
                const catRev = o.items
                    .filter((it) => productsById[it.id]?.category === c.id)
                    .reduce((ss, it) => ss + it.price * it.qty, 0);
                return s + catRev;
            }, 0),
        })).filter((c) => c.value > 0);

        return {
            revenueToday, revenue7, revenue30,
            ordersToday: today.length, orders7: last7.length, orders30: last30.length,
            // Compteurs calendaires : aujourd'hui / mois en cours / année / total
            ordersDay: dayOrders.length, revenueDay: sum(dayOrders),
            ordersMonth: monthOrders.length, revenueMonth: sum(monthOrders),
            ordersYear: yearOrders.length, revenueYear: sum(yearOrders),
            ordersTotal: paid.length, revenueTotal: sum(paid),
            active, delivered,
            avgBasket: last30.length ? revenue30 / last30.length : 0,
            trendRevenue, trendOrders, trendBasket,
            daily, topProducts, catDist,
        };
    }, [orders, productsById]);

    return (
        <SellerContext.Provider
            value={{
                products, addProduct, updateProduct, deleteProduct,
                orders, ordersLoaded, refreshOrders,
                updateOrderStatus, bulkUpdateOrderStatus,
                liveEvents,
                metrics,
                STATUS_LABELS, STATUSES, PAYMENT_LABELS,
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
