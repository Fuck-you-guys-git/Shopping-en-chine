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

// --------- Commandes ---------
export const ordersAPI = {
    create: (payload) => api.post("/orders", payload).then((r) => r.data),
    get: (orderId) => api.get(`/orders/${orderId}`).then((r) => r.data),
};
