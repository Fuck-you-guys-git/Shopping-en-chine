// Paxity v2 checkout widget — https://checkout-v2.paxity.io/docs/widget
const SCRIPT_URL = "https://checkout-v2.paxity.io/widget/v1/paxity.js";

let loading = null;

/** Loads the widget script once and resolves with `window.Paxity`. */
export const loadPaxity = () => {
    if (window.Paxity) return Promise.resolve(window.Paxity);
    if (!loading) {
        loading = new Promise((resolve, reject) => {
            const script = document.createElement("script");
            script.src = SCRIPT_URL;
            script.async = true;
            script.onload = () =>
                window.Paxity ? resolve(window.Paxity) : reject(new Error("Module de paiement Paxity indisponible."));
            script.onerror = () => {
                loading = null; // allow a retry
                script.remove();
                reject(new Error("Impossible de charger le module de paiement Paxity."));
            };
            document.head.appendChild(script);
        });
    }
    return loading;
};
