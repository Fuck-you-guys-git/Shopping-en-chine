/*
 * Paxity direct-from-browser fallback.
 *
 * WARNING: This exposes your API keys in the browser. Only use as a
 * temporary workaround while Emergent's outbound network to api.paxity.com
 * is blocked. The safer backend flow (paxityAPI.createPayin) should always
 * be tried first — this only kicks in if the backend can't reach Paxity.
 */
import axios from "axios";

const BASE_URL = process.env.REACT_APP_PAXITY_BASE_URL || "";
const API_KEY = process.env.REACT_APP_PAXITY_API_KEY || "";
const API_TOKEN = process.env.REACT_APP_PAXITY_API_TOKEN || "";
const DEFAULT_CURRENCY = process.env.REACT_APP_PAXITY_DEFAULT_CURRENCY || "XOF";
const DEFAULT_PREFIX = process.env.REACT_APP_PAXITY_DEFAULT_PREFIX || "221";
const ALLOW_DIRECT = process.env.REACT_APP_PAXITY_ALLOW_DIRECT === "true";

export const paxityDirectAvailable = () =>
    ALLOW_DIRECT && !!API_KEY && !!API_TOKEN && !!BASE_URL;

/**
 * Call Paxity payin API directly from the browser.
 * @param {Object} params
 * @param {number} params.amount - integer amount in XOF
 * @param {string} params.phone_number - digits only (no spaces)
 * @param {string} params.prefix_phone - "221", "225", etc
 * @param {string} params.payment_method - "OMSN" | "WAVESN" | ...
 * @param {string} [params.otp_code]
 * @param {string} params.description
 * @param {string} params.order_id - your idClient
 * @returns {Promise<Object>} normalized response { status, order_id, transaction_id, message, raw }
 */
export const paxityDirectPayin = async ({
    amount,
    phone_number,
    prefix_phone,
    payment_method,
    otp_code,
    description,
    order_id,
    currency,
}) => {
    if (!paxityDirectAvailable()) {
        throw new Error("Paxity direct désactivé ou clés/URL manquantes (.env)");
    }

    const body = {
        amount: Math.round(amount),
        currency: (currency || DEFAULT_CURRENCY).toUpperCase(),
        phoneNumber: String(phone_number || "").replace(/\D/g, ""),
        prefixPhone: String(prefix_phone || DEFAULT_PREFIX),
        paymentMethod: payment_method,
        codeOtp: otp_code || "",
        description: description || "Commande Shopping en Chine",
        idClient: order_id,
    };

    let resp;
    try {
        resp = await axios.post(`${BASE_URL}/payments/payin/`, body, {
            headers: {
                "x-api-key": API_KEY,
                "x-api-token": API_TOKEN,
                "Content-Type": "application/json",
            },
            timeout: 25000,
            validateStatus: () => true,
        });
    } catch (err) {
        // Network / CORS / offline
        throw new Error(
            err.code === "ERR_NETWORK"
                ? "Impossible de contacter Paxity depuis le navigateur (CORS ou hors ligne). Envoyez l'email au support Emergent."
                : err.message || "Erreur navigateur",
        );
    }

    const data = resp.data || {};
    if (resp.status >= 400) {
        const msg =
            (typeof data === "object" && (data.message || data.error || data.detail)) ||
            `Paxity a renvoyé ${resp.status}`;
        const e = new Error(String(msg));
        e.status = resp.status;
        e.raw = data;
        throw e;
    }

    const rawStatus = String(data.status || "pending").toLowerCase();
    const SUCCESS = ["success", "successful", "completed", "paid", "ok", "done", "confirmed"];
    const FAILED = ["failed", "failure", "error", "cancelled", "canceled", "declined", "rejected", "expired", "timeout", "aborted"];
    let status = "pending";
    if (SUCCESS.includes(rawStatus)) status = "success";
    else if (FAILED.includes(rawStatus)) status = "failed";

    return {
        status,
        order_id,
        transaction_id: data.transactionId || data.id || data.txId || `direct_${Date.now()}`,
        paxity_transaction_id: data.transactionId || data.id || data.txId,
        message: data.message,
        raw: data,
        via: "browser-direct",
    };
};

/**
 * Client-side connectivity probe — verifies whether the customer's browser
 * can actually reach api.paxity.com. Runs a HEAD request.
 */
export const paxityDirectProbe = async () => {
    if (!ALLOW_DIRECT) return { available: false, reason: "disabled" };
    if (!API_KEY || !API_TOKEN) return { available: false, reason: "missing_keys" };
    if (!BASE_URL) return { available: false, reason: "missing_base_url" };
    try {
        // OPTIONS request works as a CORS preflight check
        const started = Date.now();
        const resp = await axios.options(`${BASE_URL}/payments/payin/`, {
            timeout: 8000,
            validateStatus: () => true,
        });
        return {
            available: true,
            latency_ms: Date.now() - started,
            status: resp.status,
        };
    } catch (err) {
        return {
            available: false,
            reason: err.code === "ERR_NETWORK" ? "cors_or_offline" : "unknown",
            error: err.message,
        };
    }
};
