// Chargement paresseux du widget carte Paxity (script ~4 Mo : uniquement
// quand le client choisit « Carte bancaire », jamais au chargement du site).
const WIDGET_JS = "https://saas.paxity.io/widget/card-widget.iife.js";
const WIDGET_CSS = "https://saas.paxity.io/widget/style.css";

// ---------------------------------------------------------------------------
// Injection de redirectUrl dans la requête pay-in-card du widget.
// Paxity demande de renseigner l'attribut `redirectUrl` dans le payload de
// l'endpoint de paiement, mais leur widget ne le transmet pas (vérifié dans
// le code minifié). On intercepte donc la requête du widget au départ pour
// y ajouter l'URL de retour vers notre site (même correctif que Wave/OM).
// ---------------------------------------------------------------------------
const PAYIN_CARD_MARK = "/transaction/pay-in-car";
let cardRedirectUrl = null;
let patched = false;

export const setCardRedirectUrl = (url) => {
    cardRedirectUrl = url;
};

const injectRedirect = (body) => {
    if (!cardRedirectUrl || typeof body !== "string") return body;
    try {
        const data = JSON.parse(body);
        data.redirectUrl = cardRedirectUrl;
        return JSON.stringify(data);
    } catch {
        return body; // corps non-JSON : envoyer tel quel
    }
};

const patchNetworkOnce = () => {
    if (patched) return;
    patched = true;
    // XMLHttpRequest (utilisé par axios dans le widget)
    const origOpen = XMLHttpRequest.prototype.open;
    const origSend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.open = function (method, url, ...rest) {
        this.__isPaxityCardPayin = typeof url === "string" && url.includes(PAYIN_CARD_MARK);
        return origOpen.call(this, method, url, ...rest);
    };
    XMLHttpRequest.prototype.send = function (body) {
        return origSend.call(this, this.__isPaxityCardPayin ? injectRedirect(body) : body);
    };
    // fetch (au cas où le widget l'utilise)
    const origFetch = window.fetch.bind(window);
    window.fetch = (input, init) => {
        const url = typeof input === "string" ? input : input?.url || "";
        if (url.includes(PAYIN_CARD_MARK) && init?.body) {
            init = { ...init, body: injectRedirect(init.body) };
        }
        return origFetch(input, init);
    };
};

let loading = null;

export const loadPaxityCardWidget = () => {
    patchNetworkOnce();
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
