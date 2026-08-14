// Chargement paresseux du widget carte Paxity (script ~4 Mo : uniquement
// quand le client choisit « Carte bancaire », jamais au chargement du site).
const WIDGET_JS = "https://saas.paxity.io/widget/card-widget.iife.js";
const WIDGET_CSS = "https://saas.paxity.io/widget/style.css";

let loading = null;

export const loadPaxityCardWidget = () => {
    if (window.PaxityWidget) return Promise.resolve();
    if (loading) return loading;
    loading = new Promise((resolve, reject) => {
        const css = document.createElement("link");
        css.rel = "stylesheet";
        css.href = WIDGET_CSS;
        document.head.appendChild(css);

        const script = document.createElement("script");
        script.src = WIDGET_JS;
        script.async = true;
        script.onload = () => resolve();
        script.onerror = () => {
            loading = null;
            script.remove();
            reject(new Error("Impossible de charger le widget de paiement Paxity"));
        };
        document.body.appendChild(script);
    });
    return loading;
};
