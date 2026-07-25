import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { products as seedProducts, categories } from "@/data/products";
import { productsAPI } from "@/lib/api";
import { useCatalog } from "@/context/CatalogContext";

const SellerContext = createContext(null);
const ORDERS_KEY = "sec_seller_orders_v1";

const STATUSES = ["nouvelle", "confirmée", "préparation", "expédiée", "livrée"];
const STATUS_LABELS = {
    nouvelle: { label: "Nouvelle", color: "bg-primary/10 text-primary", dot: "bg-primary" },
    confirmée: { label: "Confirmée", color: "bg-blue-100 text-blue-700", dot: "bg-blue-500" },
    préparation: { label: "En préparation", color: "bg-amber-100 text-amber-700", dot: "bg-amber-500" },
    expédiée: { label: "Expédiée", color: "bg-purple-100 text-purple-700", dot: "bg-purple-500" },
    livrée: { label: "Livrée", color: "bg-success/15 text-success", dot: "bg-success" },
};

const CUSTOMER_NAMES = [
    "Aminata Diallo", "Kwame Mensah", "Fatou Sow", "Ibrahim Traoré", "Chen Wei",
    "Aïcha Bamba", "Moussa Keita", "Sarah Benali", "Ousmane Ndiaye", "Marie Dupont",
    "Kofi Asante", "Zeinab Fofana", "Amadou Camara", "Léa Konaté", "Jean-Paul Sissoko",
];
const CITIES = ["Dakar", "Abidjan", "Bamako", "Lomé", "Cotonou", "Ouagadougou", "Yaoundé", "Conakry"];

const randomFrom = (arr) => arr[Math.floor(Math.random() * arr.length)];
const randomId = () => `ord-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

const generateSeedOrders = (availableProducts) => {
    const orders = [];
    for (let i = 0; i < 14; i++) {
        const nbItems = 1 + Math.floor(Math.random() * 3);
        const items = [];
        for (let j = 0; j < nbItems; j++) {
            const p = randomFrom(availableProducts);
            items.push({ id: p.id, name: p.name, image: p.image, price: p.price, qty: 1 + Math.floor(Math.random() * 2) });
        }
        const total = items.reduce((s, it) => s + it.price * it.qty, 0);
        const daysAgo = Math.floor(Math.random() * 14);
        const statusIdx = daysAgo > 7 ? 4 : daysAgo > 4 ? 3 : daysAgo > 2 ? 2 : daysAgo > 0 ? 1 : 0;
        orders.push({
            id: `#SEC-${10240 - i}`,
            customer: randomFrom(CUSTOMER_NAMES),
            city: randomFrom(CITIES),
            items,
            total,
            status: STATUSES[statusIdx],
            createdAt: Date.now() - daysAgo * 86400000 - Math.random() * 3600000,
        });
    }
    return orders.sort((a, b) => b.createdAt - a.createdAt);
};

export const SellerProvider = ({ children }) => {
    // Products now live in MongoDB (via /api/products) so they're visible to
    // every customer. Static seed is only an instant fallback while loading.
    const [products, setProducts] = useState(seedProducts);

    useEffect(() => {
        productsAPI.list()
            .then((list) => { if (Array.isArray(list) && list.length) setProducts(list); })
            .catch(() => {});
    }, []);

    const [orders, setOrders] = useState(() => {
        try {
            const raw = localStorage.getItem(ORDERS_KEY);
            if (raw) return JSON.parse(raw);
        } catch {}
        return generateSeedOrders(seedProducts);
    });

    const [liveEvents, setLiveEvents] = useState([]);
    const tickRef = useRef(0);

    useEffect(() => {
        localStorage.setItem(ORDERS_KEY, JSON.stringify(orders));
    }, [orders]);

    // ---- Simulated real-time engine ----
    useEffect(() => {
        const tick = () => {
            tickRef.current += 1;
            const shouldCreateNew = Math.random() < 0.35;
            const shouldAdvance = Math.random() < 0.6;

            setOrders((prev) => {
                let next = [...prev];

                if (shouldCreateNew && products.length > 0) {
                    const nbItems = 1 + Math.floor(Math.random() * 2);
                    const items = [];
                    for (let j = 0; j < nbItems; j++) {
                        const p = randomFrom(products);
                        items.push({ id: p.id, name: p.name, image: p.image, price: p.price, qty: 1 });
                    }
                    const total = items.reduce((s, it) => s + it.price * it.qty, 0);
                    const customer = randomFrom(CUSTOMER_NAMES);
                    const city = randomFrom(CITIES);
                    const newOrder = {
                        id: `#SEC-${10250 + tickRef.current}`,
                        customer,
                        city,
                        items,
                        total,
                        status: "nouvelle",
                        createdAt: Date.now(),
                        fresh: true,
                    };
                    next = [newOrder, ...next];
                    setLiveEvents((e) => [
                        { id: newOrder.id, type: "new", customer, city, total, at: Date.now() },
                        ...e.slice(0, 9),
                    ]);
                }

                if (shouldAdvance) {
                    const idxCandidates = next
                        .map((o, i) => ({ o, i }))
                        .filter(({ o }) => o.status !== "livrée");
                    if (idxCandidates.length > 0) {
                        const { i } = randomFrom(idxCandidates);
                        const currentIdx = STATUSES.indexOf(next[i].status);
                        if (currentIdx < STATUSES.length - 1) {
                            const newStatus = STATUSES[currentIdx + 1];
                            next[i] = { ...next[i], status: newStatus, fresh: false };
                            setLiveEvents((e) => [
                                { id: next[i].id, type: "status", status: newStatus, customer: next[i].customer, at: Date.now() },
                                ...e.slice(0, 9),
                            ]);
                        }
                    }
                }

                // clear "fresh" flag after 8s using a delayed clear
                return next;
            });
        };

        const interval = setInterval(tick, 6000);
        return () => clearInterval(interval);
    }, [products]);

    // Clear fresh flag periodically
    useEffect(() => {
        const t = setInterval(() => {
            setOrders((prev) => prev.map((o) => (o.fresh && Date.now() - o.createdAt > 8000 ? { ...o, fresh: false } : o)));
        }, 4000);
        return () => clearInterval(t);
    }, []);

    // ---- CRUD (persisted server-side, visible to all customers) ----
    const { refresh: refreshCatalog } = useCatalog();
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

    const updateOrderStatus = (id, status) =>
        setOrders((prev) => prev.map((o) => (o.id === id ? { ...o, status } : o)));

    // ---- Metrics ----
    const metrics = useMemo(() => {
        const now = Date.now();
        const last30 = orders.filter((o) => now - o.createdAt <= 30 * 86400000);
        const last7 = orders.filter((o) => now - o.createdAt <= 7 * 86400000);
        const today = orders.filter((o) => now - o.createdAt <= 86400000);

        const revenue30 = last30.reduce((s, o) => s + o.total, 0);
        const revenue7 = last7.reduce((s, o) => s + o.total, 0);
        const revenueToday = today.reduce((s, o) => s + o.total, 0);

        const active = orders.filter((o) => o.status !== "livrée").length;
        const delivered = orders.filter((o) => o.status === "livrée").length;

        // Daily revenue for last 14 days
        const daily = [];
        for (let i = 13; i >= 0; i--) {
            const dayStart = now - i * 86400000;
            const dayLabel = new Date(dayStart).toLocaleDateString("fr-FR", { day: "2-digit", month: "short" });
            const dayRevenue = orders
                .filter((o) => o.createdAt >= dayStart - 43200000 && o.createdAt < dayStart + 43200000)
                .reduce((s, o) => s + o.total, 0);
            daily.push({ day: dayLabel, revenue: dayRevenue });
        }

        // Top products by revenue
        const productRevenue = {};
        orders.forEach((o) => {
            o.items.forEach((it) => {
                productRevenue[it.id] = (productRevenue[it.id] || 0) + it.price * it.qty;
            });
        });
        const topProducts = Object.entries(productRevenue)
            .map(([id, rev]) => {
                const p = products.find((x) => x.id === id);
                return p ? { ...p, soldRevenue: rev } : null;
            })
            .filter(Boolean)
            .sort((a, b) => b.soldRevenue - a.soldRevenue)
            .slice(0, 5);

        // Category distribution
        const catDist = categories.map((c) => ({
            name: c.name,
            value: orders.reduce((s, o) => {
                const catRev = o.items
                    .filter((it) => {
                        const p = products.find((x) => x.id === it.id);
                        return p && p.category === c.id;
                    })
                    .reduce((ss, it) => ss + it.price * it.qty, 0);
                return s + catRev;
            }, 0),
        })).filter((c) => c.value > 0);

        return {
            revenueToday, revenue7, revenue30,
            ordersToday: today.length, orders7: last7.length, orders30: last30.length,
            active, delivered,
            avgBasket: last30.length ? revenue30 / last30.length : 0,
            daily, topProducts, catDist,
        };
    }, [orders, products]);

    return (
        <SellerContext.Provider
            value={{
                products, addProduct, updateProduct, deleteProduct,
                orders, updateOrderStatus,
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
