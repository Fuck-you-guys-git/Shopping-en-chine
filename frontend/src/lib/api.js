import axios from "axios";

const BASE = process.env.REACT_APP_BACKEND_URL || "";

export const api = axios.create({
    baseURL: `${BASE}/api`,
    timeout: 30000,
    // Never throw on 4xx/5xx — we handle status codes manually so we can
    // parse both JSON errors and raw text/HTML (e.g. Cloudflare 520 pages).
    validateStatus: () => true,
});

// Response interceptor: raise for non-2xx so our try/catch works normally,
// but only after the response body has been captured.
api.interceptors.response.use((response) => {
    if (response.status >= 200 && response.status < 300) return response;
    const err = new Error(`Request failed with status ${response.status}`);
    err.response = response;
    err.code = response.status >= 500 ? "SERVER_ERROR" : "CLIENT_ERROR";
    return Promise.reject(err);
});

/** A French message for a failed API call, suitable for a toast. */
export const apiErrorMessage = (err) => {
    const detail = err.response?.data?.detail;
    if (typeof detail === "string") return detail;
    if (err.response?.status === 422) return "Vérifiez les informations saisies.";
    if (!err.response) return "Serveur injoignable. Vérifiez votre connexion puis réessayez.";
    return "Une erreur est survenue. Réessayez dans un instant.";
};

// --------- Catalogue ---------
export const catalogAPI = {
    list: () => api.get("/products").then((r) => r.data),
};

// --------- Commandes ---------
export const ordersAPI = {
    create: (payload) => api.post("/orders", payload).then((r) => r.data),
    get: (orderId) => api.get(`/orders/${orderId}`).then((r) => r.data),
};

// --------- Espace vendeur (token from POST /admin/login) ---------
const bearer = (token) => ({ headers: { Authorization: `Bearer ${token}` } });

export const adminAPI = {
    login: (email, password) => api.post("/admin/login", { email, password }).then((r) => r.data),
    me: (token) => api.get("/admin/me", bearer(token)).then((r) => r.data),
    orders: (token) => api.get("/admin/orders", bearer(token)).then((r) => r.data),
    updateOrder: (token, orderId, status) => api.patch(`/admin/orders/${orderId}`, { status }, bearer(token)).then((r) => r.data),
    createProduct: (token, product) => api.post("/admin/products", product, bearer(token)).then((r) => r.data),
    deleteProduct: (token, productId) => api.delete(`/admin/products/${productId}`, bearer(token)),
};

// --------- Paiement ---------
export const paymentsAPI = {
    config: () => api.get("/payments/config").then((r) => r.data),
    reportPaxity: (orderId) => api.post(`/payments/paxity/${orderId}/reported`).then((r) => r.data),
};
