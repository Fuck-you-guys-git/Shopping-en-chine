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

// ---------------------------------------------------------------------------
// 3-D Secure DANS la page (standard EMVCo/3DS2, comme Stripe) : le widget
// soumet le formulaire `creq` vers la banque en naviguant TOUTE la page
// (aucun redirectUrl honoré par l'API carte Paxity — vérifié en production).
// On redirige cette soumission vers une iframe : le client ne quitte jamais
// le site, et la confirmation s'affiche automatiquement via le polling IPN.
// ---------------------------------------------------------------------------
const THREE_DS_FRAME = "sec-3ds-frame";
const THREE_DS_OVERLAY = "sec-3ds-overlay";

const mountThreeDSFrame = () => {
    let frame = document.getElementById(THREE_DS_FRAME);
    if (frame) return frame;
    const overlay = document.createElement("div");
    overlay.id = THREE_DS_OVERLAY;
    overlay.style.cssText =
        "position:fixed;inset:0;background:rgba(15,15,15,.78);z-index:2147483647;" +
        "display:flex;align-items:center;justify-content:center;padding:12px;";
    const box = document.createElement("div");
    box.style.cssText = "position:relative;width:100%;max-width:480px;";
    const close = document.createElement("button");
    close.type = "button";
    close.setAttribute("aria-label", "Fermer la vérification bancaire");
    close.textContent = "✕";
    close.style.cssText =
        "position:absolute;top:-14px;right:-6px;height:32px;width:32px;border-radius:9999px;" +
        "border:0;background:#fff;color:#111;font-size:15px;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.35);";
    close.onclick = () => closePaymentOverlays();
    frame = document.createElement("iframe");
    frame.id = THREE_DS_FRAME;
    frame.name = THREE_DS_FRAME;
    frame.style.cssText =
        "width:100%;height:min(80vh,640px);border:0;border-radius:12px;background:#fff;";
    box.appendChild(close);
    box.appendChild(frame);
    overlay.appendChild(box);
    document.body.appendChild(overlay);
    return frame;
};

// Ferme la vérification bancaire ET la modale du widget (appelé à la
// confirmation/échec du paiement pour révéler notre page de confirmation).
export const closePaymentOverlays = () => {
    document.getElementById(THREE_DS_OVERLAY)?.remove();
    document
        .querySelectorAll(".ant-modal-root, .ant-modal-mask, .ant-modal-wrap")
        .forEach((el) => el.remove());
};

const patchThreeDSOnce = () => {
    const origSubmit = HTMLFormElement.prototype.submit;
    HTMLFormElement.prototype.submit = function () {
        try {
            if (this.querySelector?.('input[name="creq"]')) {
                mountThreeDSFrame();
                this.target = THREE_DS_FRAME;
            }
        } catch (e) {
            console.debug("[Paxity3DS] patch submit:", e?.message);
        }
        return origSubmit.call(this);
    };
};

const patchNetworkOnce = () => {
    if (patched) return;
    patched = true;
    patchThreeDSOnce();
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
