import axios from "axios";

const BASE = process.env.REACT_APP_BACKEND_URL || "";
const TOKEN_KEY = "seller_token";

export const getSellerToken = () => localStorage.getItem(TOKEN_KEY);
export const setSellerToken = (t) => t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY);

export const api = axios.create({
    baseURL: `${BASE}/api`,
    timeout: 30000,
    // Never throw on 4xx/5xx — we handle status codes manually so we can
    // parse both JSON errors and raw text/HTML (e.g. Cloudflare 520 pages).
    validateStatus: () => true,
});

// Attach the seller JWT (if any) to every request
api.interceptors.request.use((config) => {
    const t = getSellerToken();
    if (t) config.headers.Authorization = `Bearer ${t}`;
    return config;
});

// Response interceptor: raise for non-2xx so our try/catch works normally,
// but only after the response body has been captured.
api.interceptors.response.use((response) => {
    if (response.status >= 200 && response.status < 300) return response;
    // Session vendeur expirée / invalide → déconnexion propre + redirection login
    const url = String(response.config?.url || "");
    if (response.status === 401 && getSellerToken() && !url.startsWith("/auth/login")) {
        window.dispatchEvent(new CustomEvent("seller-session-expired"));
    }
    const err = new Error(`Request failed with status ${response.status}`);
    err.response = response;
    err.code = response.status >= 500 ? "SERVER_ERROR" : "CLIENT_ERROR";
    return Promise.reject(err);
});

// --------- Paxity v2 (Wave / Orange Money, F CFA) ---------
export const paxityAPI = {
    getConfig: () => api.get("/paxity/config").then((r) => r.data),
    createPayin: (payload) => api.post("/paxity/payin", payload).then((r) => r.data),
    cardInit: (payload) => api.post("/paxity/card/init", payload).then((r) => r.data),
    cardConfirm: (payload) => api.post("/paxity/card/confirm", payload).then((r) => r.data),
    getStatus: (transactionId) => api.get(`/paxity/status/${transactionId}`).then((r) => r.data),
    getOrder: (orderId) => api.get(`/paxity/orders/${orderId}`).then((r) => r.data),
    // Rattrapage des paiements restés « en attente » (auth vendeur)
    reconcile: () => api.post("/paxity/reconcile", {}, { timeout: 120000 }).then((r) => r.data),
};

// --------- Suivi de commande ---------
export const trackingAPI = {
    track: (orderId) => api.get(`/tracking/${encodeURIComponent(orderId)}`).then((r) => r.data),
    updateStep: (orderId, step) => api.put(`/tracking/${encodeURIComponent(orderId)}`, { step }).then((r) => r.data),
};

// --------- Auth vendeur ---------
export const authAPI = {
    login: (email, password) => api.post("/auth/login", { email, password }).then((r) => r.data),
    me: () => api.get("/auth/me").then((r) => r.data),
    logout: () => api.post("/auth/logout").then((r) => r.data),
};

// --------- Catalogue produits ---------
// Timeout étendu pour l'envoi des produits (photos en base64 sur mobile lent)
export const productsAPI = {
    list: () => api.get("/products").then((r) => r.data.products),
    get: (id) => api.get(`/products/${id}`).then((r) => r.data),
    create: (p) => api.post("/products", p, { timeout: 90000 }).then((r) => r.data),
    update: (id, p) => api.put(`/products/${id}`, p, { timeout: 90000 }).then((r) => r.data),
    remove: (id) => api.delete(`/products/${id}`).then((r) => r.data),
};

// --------- Commandes vendeur (réelles) ---------
export const ordersAPI = {
    list: () => api.get("/orders").then((r) => r.data.orders),
    bulkTracking: (orderIds, step) =>
        api.put("/orders/bulk-tracking", { order_ids: orderIds, step }).then((r) => r.data),
    // Export CSV des commandes payées
    exportCsv: () => api.get("/orders/export.csv", { responseType: "blob" }),
    // Confirmations de commande jamais envoyées
    missingConfirmations: () => api.get("/orders/missing-confirmations").then((r) => r.data),
    resendConfirmations: () =>
        api.post("/orders/resend-confirmations", {}, { timeout: 300000 }).then((r) => r.data),
};

// --------- Avis clients vérifiés ---------
export const reviewsAPI = {
    list: (productId) => api.get(`/reviews/${productId}`).then((r) => r.data),
    submit: (payload) => api.post("/reviews", payload).then((r) => r.data),
    remove: (id) => api.delete(`/reviews/${id}`).then((r) => r.data),
};

// --------- Journal des emails (vendeur) ---------
export const emailsAPI = {
    log: (limit = 100) => api.get(`/emails/log?limit=${limit}`).then((r) => r.data),
    customers: () => api.get("/emails/customers").then((r) => r.data),
    broadcast: (payload) => api.post("/emails/broadcast", payload, { timeout: 300000 }).then((r) => r.data),
};
