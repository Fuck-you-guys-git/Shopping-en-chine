import axios from "axios";

const BASE = process.env.REACT_APP_BACKEND_URL || "";

export const api = axios.create({
    baseURL: `${BASE}/api`,
    timeout: 45000,
});

// --------- Paxity ---------
export const paxityAPI = {
    getConfig: () => api.get("/paxity/config").then((r) => r.data),
    createPayin: (payload) => api.post("/paxity/payin", payload).then((r) => r.data),
    getStatus: (transactionId) => api.get(`/paxity/status/${transactionId}`).then((r) => r.data),
    getOrder: (orderId) => api.get(`/paxity/orders/${orderId}`).then((r) => r.data),
};
