// Widget de paiement hébergé Paxity v2 (checkout-v2.paxity.io). Le numéro de
// carte ne transite JAMAIS par notre site : le widget gère la saisie carte et
// le 3-D Secure côté Paxity (PCI SAQ-A). Chargé paresseusement au clic « Carte ».
let loading = null;

export const loadPaxityV2Widget = (src) => {
    if (window.Paxity) return Promise.resolve(window.Paxity);
    if (loading) return loading;
    loading = new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.src = src;
        script.async = true;
        script.onload = () =>
            window.Paxity ? resolve(window.Paxity) : reject(new Error("Widget Paxity indisponible"));
        script.onerror = () => {
            loading = null;
            script.remove();
            reject(new Error("Impossible de charger le widget de paiement Paxity"));
        };
        document.body.appendChild(script);
    });
    return loading;
};
