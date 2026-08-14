import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Check, ArrowLeft, XCircle, AlertTriangle, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCart } from "@/context/CartContext";
import { toast } from "sonner";
import { paxityAPI } from "@/lib/api";
import { loadPaxityCardWidget, setCardRedirectUrl, closePaymentOverlays } from "@/lib/paxityWidget";
import { paxityDirectPayin, paxityDirectAvailable } from "@/lib/paxityDirect";
import { DeliveryOptions } from "@/components/DeliveryOptions";
import { orderNo } from "@/lib/utils";
import { t, getLocale } from "@/lib/locale";
import { findCountry, countryName, STATES } from "@/lib/countries";
import { colorName } from "@/lib/colors";
import { OPERATOR_META } from "@/components/checkout/operatorMeta";
import { CheckoutSuccess } from "@/components/checkout/CheckoutSuccess";
import { CheckoutPending } from "@/components/checkout/CheckoutPending";
import { AddressStep } from "@/components/checkout/AddressStep";
import { PaymentMethodPicker } from "@/components/checkout/PaymentMethodPicker";
import { PaxityCardPanel } from "@/components/checkout/PaxityCardPanel";
import { PaxityPhoneForm } from "@/components/checkout/PaxityPhoneForm";
import { CheckoutSummary } from "@/components/checkout/CheckoutSummary";

// La transaction en attente est persistée : si le client part payer dans
// l'app Wave/Orange Money et que le navigateur recharge la page au retour,
// on restaure l'attente et on affiche la confirmation dès que c'est payé.
const PENDING_TX_KEY = "sec_pending_paxity_tx_v1";
// Paiement par carte : via le WIDGET PAXITY (Visa/Mastercard).
const CARD_PAYMENT_ENABLED = true;

// Libellé complet d'un article pour la commande : nom + taille + couleur
// choisies par le client (visibles partout : dashboard vendeur, tickets, emails).
const itemLabel = (it) => {
    const opts = [it.size ? `Taille ${it.size}` : null, it.color ? colorName(it.color) : null].filter(Boolean);
    return opts.length ? `${it.name} — ${opts.join(" · ")}` : it.name;
};
// Confirmation persistée en session : survit au remontage du composant
// (changement de langue/devise) et au rechargement de la page.
const COMPLETE_TX_KEY = "sec_completed_paxity_tx_v1";

export default function Checkout() {
    const { items, subtotal, clear } = useCart();
    const navigate = useNavigate();
    const [step, setStep] = useState(1);
    const [deliveryMode, setDeliveryMode] = useState("standard");
    const shipping = 0;
    const total = subtotal + shipping;

    const [buyer, setBuyer] = useState(() => {
        // Pays pré-sélectionné depuis la géolocalisation IP (si connu)
        const detected = findCountry(getLocale().country);
        return {
            firstName: "", lastName: "", email: "",
            phone: "", address: "", zip: "", city: "", state: "",
            country: detected ? detected.code : "SN",
        };
    });

    const selectedCountry = findCountry(buyer.country);

    const [paxityConfig, setPaxityConfig] = useState(null);
    const [paxityError, setPaxityError] = useState(null);
    const [paymentMethod, setPaymentMethod] = useState("");
    const [prefix, setPrefix] = useState(() => findCountry(getLocale().country)?.dial || "221");

    const changeCountry = (code) => {
        setBuyer((b) => ({ ...b, country: code, state: "" }));
        const c = findCountry(code);
        if (c) setPrefix(c.dial); // indicatif appliqué automatiquement
    };
    const [otp, setOtp] = useState("");

    const [processing, setProcessing] = useState(false);
    const [transaction, setTransaction] = useState(null); // { transaction_id, status, order_id, ... }
    const [complete, setComplete] = useState(false);

    // Remonter en haut de page à chaque changement d'étape (adresse → livraison
    // → paiement) et à l'affichage des écrans attente/confirmation : sur mobile,
    // le clic « Continuer » se fait en bas de page et la vue restait en bas.
    useEffect(() => {
        window.scrollTo(0, 0); // forme universelle (compatible tous mobiles)
    }, [step, complete, transaction?.status]);
    const [checkingNow, setCheckingNow] = useState(false);

    // Restaurer une transaction en attente (retour depuis l'app de paiement)
    // ou une confirmation récente (remontage/rechargement juste après paiement)
    const restoredOnce = useRef(false);
    useEffect(() => {
        if (restoredOnce.current) return;
        restoredOnce.current = true;
        try {
            const done = sessionStorage.getItem(COMPLETE_TX_KEY);
            if (done) {
                if (items.length > 0) {
                    // Le client démarre une NOUVELLE commande : on oublie
                    // l'ancienne confirmation.
                    sessionStorage.removeItem(COMPLETE_TX_KEY);
                } else {
                    const tx = JSON.parse(done);
                    if (tx?.order_id) {
                        setTransaction(tx);
                        setComplete(true);
                        return; // confirmation prioritaire sur toute restauration pending
                    }
                }
            }
        } catch {
            sessionStorage.removeItem(COMPLETE_TX_KEY);
        }
        try {
            const raw = localStorage.getItem(PENDING_TX_KEY);
            if (!raw) return;
            const tx = JSON.parse(raw);
            if (tx?.transaction_id && tx.status === "pending") setTransaction(tx);
            else localStorage.removeItem(PENDING_TX_KEY);
        } catch {
            localStorage.removeItem(PENDING_TX_KEY);
        }
    }, [items.length]);

    // Persister tant que le paiement est en attente
    useEffect(() => {
        if (!transaction) return;
        if (transaction.status === "pending") {
            localStorage.setItem(PENDING_TX_KEY, JSON.stringify(transaction));
        } else {
            localStorage.removeItem(PENDING_TX_KEY);
        }
    }, [transaction]);

    // Persister la confirmation : elle doit survivre à un remontage du composant
    // (changement de langue/devise détecté) ou à un rechargement de la page.
    useEffect(() => {
        if (complete && transaction?.order_id) {
            sessionStorage.setItem(COMPLETE_TX_KEY, JSON.stringify({ ...transaction, status: "success" }));
        }
    }, [complete, transaction]);

    // Fetch backend config
    useEffect(() => {
        paxityAPI.getConfig()
            .then((cfg) => {
                setPaxityConfig(cfg);
                // Pre-select first available method (sans écraser
                // l'indicatif déduit du pays choisi par le client)
                if (cfg.methods && cfg.methods.length > 0) {
                    setPaymentMethod(cfg.methods[0].code);
                }
            })
            .catch(() => setPaxityError("Impossible de contacter le service de paiement."));
    }, []);

    // L'API Paxity n'accepte AUCUNE URL de retour (doc officielle) : le retour
    // vers notre site est donc géré ici, différemment selon l'appareil.
    // - MOBILE (Android/iPhone) : AUCUNE nouvelle fenêtre. Le lien s'ouvre dans
    //   le même onglet → le système ouvre l'app Wave/OM par-dessus le site.
    //   Au retour du client, la transaction en attente est restaurée depuis
    //   localStorage (PENDING_TX_KEY) et confirmée par polling.
    // - ORDINATEUR : onglet séparé pendant que cette page reste en attente
    //   active ; dès que Paxity confirme, l'onglet de paiement est fermé
    //   automatiquement et le client retrouve notre confirmation.
    const isMobileDevice = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    const payWinRef = useRef(null);
    const closePayWindow = () => {
        try {
            payWinRef.current?.close();
        } catch (e) {
            console.debug("[Paxity] fermeture onglet paiement impossible", e?.message);
        }
        payWinRef.current = null;
        // Carte : ferme aussi la vérification bancaire 3DS et la modale du
        // widget pour révéler notre page de confirmation.
        closePaymentOverlays();
    };
    const openPayWindow = (url) => {
        if (isMobileDevice) {
            // Même onglet : pas de fenêtre supplémentaire sur téléphone
            window.location.href = url;
            return;
        }
        const w = window.open(url, "_blank");
        if (w) {
            payWinRef.current = w;
        } else {
            // Pop-up bloqué : repli dans le même onglet
            window.location.href = url;
        }
    };

    // Poll status while pending — vérifie immédiatement, puis toutes les 3,5s,
    // et dès que le client revient sur l'onglet (retour de l'app Wave/OM).
    useEffect(() => {
        if (!transaction || transaction.status !== "pending") return;
        let stopped = false;
        const checkNow = async () => {
            try {
                const res = await paxityAPI.getStatus(transaction.transaction_id);
                if (stopped) return;
                if (res.status !== transaction.status) {
                    // Merge the full response so amount/order_id survive the
                    // cart clear() and render correctly on the confirmation.
                    setTransaction((prev) => ({ ...prev, ...res }));
                }
                if (res.status === "success") {
                    closePayWindow();
                    setComplete(true);
                    clear();
                    localStorage.removeItem(PENDING_TX_KEY);
                    toast.success(t("Paiement confirmé ✦"), { description: `${t("Commande")} ${orderNo(res.order_id)}` });
                } else if (res.status === "failed") {
                    closePayWindow();
                    localStorage.removeItem(PENDING_TX_KEY);
                    toast.error(t("Paiement échoué"), { description: t("Veuillez réessayer") });
                }
            } catch (e) {
                // Erreur réseau passagère pendant le polling : on retentera au tick suivant
                console.debug("[Paxity] polling status indisponible, nouvelle tentative…", e?.message);
            }
        };
        checkNow();
        // Vérification rapide (2s) : dès que Paxity confirme, la fenêtre de
        // paiement est fermée et la confirmation s'affiche ici.
        const interval = setInterval(checkNow, 2000);
        const onVisible = () => {
            if (document.visibilityState === "visible") checkNow();
        };
        document.addEventListener("visibilitychange", onVisible);
        window.addEventListener("focus", onVisible);
        return () => {
            stopped = true;
            clearInterval(interval);
            document.removeEventListener("visibilitychange", onVisible);
            window.removeEventListener("focus", onVisible);
        };
    }, [transaction, clear]);

    // Bouton « J'ai payé — Vérifier » sur l'écran d'attente
    const manualCheck = async () => {
        if (!transaction?.transaction_id) return;
        setCheckingNow(true);
        try {
            const res = await paxityAPI.getStatus(transaction.transaction_id);
            if (res.status === "success") {
                closePayWindow();
                setTransaction((prev) => ({ ...prev, ...res }));
                setComplete(true);
                clear();
                localStorage.removeItem(PENDING_TX_KEY);
                toast.success(t("Paiement confirmé ✦"), { description: `${t("Commande")} ${orderNo(res.order_id)}` });
            } else if (res.status === "failed") {
                closePayWindow();
                setTransaction((prev) => ({ ...prev, ...res }));
                localStorage.removeItem(PENDING_TX_KEY);
                toast.error(t("Paiement échoué"), { description: t("Veuillez réessayer") });
            } else {
                toast(t("Paiement toujours en attente"), {
                    description: t("Validez la transaction sur votre téléphone, puis revérifiez."),
                });
            }
        } catch {
            toast.error(t("Vérification impossible"), { description: t("Vérifiez votre connexion et réessayez.") });
        } finally {
            setCheckingNow(false);
        }
    };

    const buyerValid = () =>
        buyer.firstName && buyer.lastName && buyer.email && buyer.phone && buyer.address && buyer.city &&
        (!STATES[buyer.country] || buyer.state);

    const selectedMethod = paxityConfig?.methods?.find((m) => m.code === paymentMethod);
    const operatorIconMeta = selectedMethod ? (OPERATOR_META[selectedMethod.icon] || OPERATOR_META.card) : OPERATOR_META.card;

    // Paiement CARTE via le widget Paxity : le backend crée la commande,
    // puis le widget s'ouvre par-dessus la page. La confirmation arrive par
    // IPN → le polling existant (écran d'attente) affiche la confirmation.
    const handleCardPayment = async () => {
        sessionStorage.removeItem(COMPLETE_TX_KEY); // nouvelle commande : oublier l'ancienne confirmation
        setProcessing(true);
        setPaxityError(null);
        try {
            await loadPaxityCardWidget();
            // Retour après 3-D Secure : la banque/Paxity redirige vers notre
            // page commande (la confirmation y est restaurée automatiquement).
            setCardRedirectUrl(`${window.location.origin}/commande`);
            const res = await paxityAPI.cardInit({
                amount: total,
                delivery_mode: deliveryMode,
                description: `Commande Shopping en Chine — ${items.length} article(s)`,
                customer: {
                    name: `${buyer.firstName} ${buyer.lastName}`.trim(),
                    email: buyer.email,
                    city: buyer.city,
                    phone: buyer.phone ? `+${prefix} ${buyer.phone}` : undefined,
                    address: [buyer.address, buyer.zip, buyer.state, selectedCountry ? countryName(selectedCountry) : null].filter(Boolean).join(", ") || undefined,
                },
                items: items.map((it) => ({
                    product_id: it.id,
                    name: itemLabel(it),
                    price: it.price,
                    qty: it.qty,
                    color: it.color || undefined,
                    size: it.size || undefined,
                })),
            });
            // Écran d'attente + polling (mêmes mécanismes que le mobile money)
            setTransaction({
                transaction_id: res.transaction_id,
                order_id: res.order_id,
                status: "pending",
                operator_label: t("Carte bancaire"),
                amount: total,
            });
            window.PaxityWidget.open({
                amount: res.amount,
                currency: res.currency,
                country: res.country,
                ipn: res.ipn,
                idClient: res.order_id,
                // NB : le code du widget exige credentials.apiKey (K majuscule)
                // et isOpen au niveau racine — la doc publique est inexacte.
                isOpen: true,
                setIsOpen: () => {},
                credentials: {
                    apiKey: res.credentials.apikey,
                    apikey: res.credentials.apikey,
                    apiToken: res.credentials.apiToken,
                },
            });
        } catch (err) {
            console.error("[PaxityCard] init error", err);
            toast.error(t("Paiement carte indisponible"), {
                description: err.response?.data?.detail || t("Réessayez ou utilisez Mobile Money."),
            });
        } finally {
            setProcessing(false);
        }
    };

    const handlePayment = async (e) => {
        e.preventDefault();
        sessionStorage.removeItem(COMPLETE_TX_KEY); // nouvelle commande : oublier l'ancienne confirmation

        // ---- Client-side validation ----
        const cleanPhone = buyer.phone.replace(/\D/g, "");
        const expectedLengths = {
            "221": [9],       // Sénégal
            "225": [10],      // Côte d'Ivoire
            "226": [8],       // Burkina Faso
            "227": [8],       // Niger
            "228": [8],       // Togo
            "229": [8, 10],   // Bénin
            "233": [9],       // Ghana
            "237": [9],       // Cameroun
            "241": [9],       // Gabon
        };
        const validLengths = expectedLengths[prefix] || [8, 9, 10];
        if (!validLengths.includes(cleanPhone.length)) {
            const expected = validLengths.join(" ou ");
            toast.error(t("Numéro de téléphone invalide"), {
                description: `${t("Pour l'indicatif")} +${prefix}, ${t("le numéro doit contenir")} ${expected} ${t("chiffres")}. ${t("Vous avez saisi")} ${cleanPhone.length} ${t("chiffres")}.`,
            });
            return;
        }

        // Phase 3: block submission when the selected method requires an OTP
        // but the user hasn't filled it in.
        if (selectedMethod?.requires_otp && !otp.trim()) {
            toast.error(t("Code OTP requis"), {
                description: `${selectedMethod.label} ${t("exige un code OTP avant de valider le paiement.")}`,
            });
            return;
        }

        setProcessing(true);
        try {
            const payload = {
                amount: total,
                phone_number: buyer.phone.replace(/\s+/g, ""),
                prefix_phone: prefix,
                payment_method: paymentMethod,
                otp_code: otp || undefined,
                description: `Commande Shopping en Chine · ${items.length} article(s)`,
                delivery_mode: deliveryMode,
                customer: {
                    name: `${buyer.firstName} ${buyer.lastName}`,
                    email: buyer.email,
                    city: buyer.city,
                    phone: `+${prefix} ${buyer.phone}`,
                    address: [buyer.address, buyer.zip, buyer.state, selectedCountry ? countryName(selectedCountry) : null].filter(Boolean).join(", ") || undefined,
                },
                items: items.map((it) => ({
                    product_id: it.id,
                    name: itemLabel(it),
                    price: it.price,
                    qty: it.qty,
                    color: it.color || undefined,
                    size: it.size || undefined,
                })),
            };

            let res;
            let usedFallback = false;
            try {
                res = await paxityAPI.createPayin(payload);
            } catch (backendErr) {
                // Detect DNS/network failures that mean the backend can't reach Paxity
                const rawDetail = backendErr.response?.data?.detail || "";
                const looksBlocked =
                    (typeof rawDetail === "string" && (
                        rawDetail.includes("DNS") ||
                        rawDetail.includes("Name or service not known") ||
                        rawDetail.includes("Erreur réseau") ||
                        rawDetail.includes("Aucune réponse")
                    )) ||
                    backendErr.response?.status === 424 ||
                    backendErr.response?.status === 502 ||
                    backendErr.response?.status === 503 ||
                    backendErr.response?.status === 504;

                if (looksBlocked && paxityDirectAvailable()) {
                    // Fallback: call Paxity directly from the browser
                    toast("Bascule vers Paxity direct…", {
                        description: "Le backend est bloqué, appel depuis le navigateur.",
                    });
                    res = await paxityDirectPayin({
                        amount: total,
                        phone_number: payload.phone_number,
                        prefix_phone: payload.prefix_phone,
                        payment_method: payload.payment_method,
                        otp_code: payload.otp_code,
                        description: payload.description,
                        order_id: `ord_${Date.now()}`,
                        currency: paxityConfig?.currency,
                    });
                    usedFallback = true;
                } else {
                    throw backendErr;
                }
            }

            setTransaction({ ...res, operator_label: operatorIconMeta.label });
            if (res.status === "success") {
                setComplete(true);
                clear();
                toast.success("Paiement confirmé ✦", usedFallback ? { description: "Via Paxity direct" } : {});
            } else if (res.status === "pending") {
                toast("Paiement en cours…", { description: "Validez la transaction sur votre téléphone." });
            } else {
                toast.error("Paiement refusé", { description: res.message || "Réessayez ou changez de moyen." });
            }
        } catch (err) {
            // Show a customer-friendly French message. Technical details
            // (API keys, hosts, .env, status codes) must NEVER reach shoppers —
            // they are logged to the console for the merchant/support instead.
            const status = err.response?.status;
            const rawDetail = err.response?.data?.detail || err.response?.data?.message;
            console.error("[Paiement] Échec Paxity", { status, detail: rawDetail, error: err.message });

            let detail;
            if (status === 400 && typeof rawDetail === "string" && rawDetail) {
                // Actionable validation errors (OTP requis, montant invalide,
                // méthode inconnue…) are already written for the customer.
                detail = rawDetail;
            } else if (err.code === "ECONNABORTED") {
                detail = "Le paiement a mis trop de temps à répondre. Veuillez réessayer.";
            } else if (!err.response) {
                detail = "Impossible de contacter le serveur. Vérifiez votre connexion internet.";
            } else {
                detail = "Le paiement n'a pas pu être traité pour le moment. Veuillez réessayer dans quelques instants ou choisir un autre moyen de paiement.";
            }

            toast.error(t("Erreur de paiement"), { description: detail });
            setPaxityError(detail);
        } finally {
            setProcessing(false);
        }
    };

    // ---------- Success screen ----------
    if (complete) {
        return <CheckoutSuccess transaction={transaction} total={total} />;
    }

    // ---------- Pending screen ----------
    if (transaction && transaction.status === "pending") {
        return (
            <CheckoutPending
                transaction={transaction}
                operatorLabel={operatorIconMeta.label}
                onOpenPay={openPayWindow}
                onManualCheck={manualCheck}
                checkingNow={checkingNow}
                onCancel={() => { closePayWindow(); localStorage.removeItem(PENDING_TX_KEY); setTransaction(null); }}
            />
        );
    }

    // ---------- Empty cart guard ----------
    if (items.length === 0) {
        return (
            <div className="container mx-auto px-5 py-24 text-center">
                <h1 className="font-display text-4xl mb-3">{t("Panier vide")}</h1>
                <p className="text-muted-foreground mb-6">{t("Ajoutez des produits avant de commander.")}</p>
                <Button asChild className="rounded-full"><Link to="/boutique">{t("Voir la boutique")}</Link></Button>
            </div>
        );
    }

    const steps = [
        { n: 1, label: t("Adresse") },
        { n: 2, label: t("Livraison") },
        { n: 3, label: t("Paiement") },
    ];

    return (
        <div className="container mx-auto px-5 py-10 md:py-14">
            <Link to="/panier" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-6">
                <ArrowLeft className="h-4 w-4" /> {t("Retour au panier")}
            </Link>
            <h1 className="font-display text-4xl sm:text-5xl font-medium tracking-tight mb-8">{t("Commande")}</h1>

            {/* Stepper */}
            <div className="flex items-center gap-2 sm:gap-4 mb-10">
                {steps.map((s, i) => (
                    <div key={s.n} className="flex items-center gap-2 sm:gap-4 flex-1">
                        <div className={`h-8 w-8 rounded-full flex items-center justify-center text-sm font-medium shrink-0 ${step >= s.n ? "bg-ink text-ink-foreground" : "bg-muted text-muted-foreground"}`}>
                            {step > s.n ? <Check className="h-4 w-4" /> : s.n}
                        </div>
                        <span className={`text-sm font-medium ${step >= s.n ? "text-foreground" : "text-muted-foreground"} hidden sm:inline`}>{s.label}</span>
                        {i < steps.length - 1 && <div className={`flex-1 h-px ${step > s.n ? "bg-ink" : "bg-border"}`} />}
                    </div>
                ))}
            </div>

            <div className="grid lg:grid-cols-[1fr_380px] gap-10">
                <div className="space-y-8 order-2 lg:order-1">
                    {step === 1 && (
                        <AddressStep
                            buyer={buyer}
                            setBuyer={setBuyer}
                            prefix={prefix}
                            selectedCountry={selectedCountry}
                            onCountryChange={changeCountry}
                            onContinue={() => {
                                if (!buyerValid()) { toast.error(t("Veuillez remplir tous les champs requis")); return; }
                                setStep(2);
                            }}
                        />
                    )}

                    {step === 2 && (
                        <div className="space-y-5 bg-card p-6 md:p-8 rounded-2xl shadow-card">
                            <h2 className="font-display text-2xl">{t("Mode de livraison")}</h2>
                            <DeliveryOptions value={deliveryMode} onChange={setDeliveryMode} />
                            <div className="flex gap-2 pt-2">
                                <Button type="button" variant="outline" onClick={() => setStep(1)} className="rounded-full h-11 px-6">{t("Retour")}</Button>
                                <Button type="button" onClick={() => setStep(3)} className="bg-ink text-ink-foreground hover:bg-ink/90 rounded-full h-11 px-8">{t("Continuer")}</Button>
                            </div>
                        </div>
                    )}

                    {step === 3 && (
                        <div className="space-y-5 bg-card p-6 md:p-8 rounded-2xl shadow-card">
                            <div className="flex items-center justify-between">
                                <h2 className="font-display text-2xl">{t("Paiement")}</h2>
                            </div>

                            {paxityConfig && !paxityConfig.configured && (
                                <div className="flex gap-3 p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-sm">
                                    <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" />
                                    <div>
                                        <p className="font-medium">{t("Paiement momentanément indisponible")}</p>
                                        <p className="text-xs mt-1 opacity-90">
                                            {t("Le paiement en ligne est en cours de maintenance. Veuillez réessayer dans quelques instants.")}
                                        </p>
                                    </div>
                                </div>
                            )}

                            {paxityDirectAvailable() && (
                                <div className="flex gap-3 p-3 rounded-xl bg-primary/5 border border-primary/20 text-xs">
                                    <ShieldCheck className="h-4 w-4 shrink-0 text-primary mt-0.5" />
                                    <div className="text-muted-foreground">
                                        <span className="font-medium text-foreground">Paiement résilient activé.</span>{" "}
                                        Si le serveur ne peut pas joindre Paxity, la transaction bascule automatiquement sur un appel direct depuis votre navigateur.
                                    </div>
                                </div>
                            )}

                            {paxityError && (
                                <div data-testid="paxity-error-banner" className="flex gap-3 p-4 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-sm">
                                    <XCircle className="h-5 w-5 shrink-0 mt-0.5" />
                                    <div className="flex-1">{paxityError}</div>
                                </div>
                            )}

                            <PaymentMethodPicker
                                methods={paxityConfig?.methods}
                                value={paymentMethod}
                                onSelect={(m) => {
                                    setPaymentMethod(m.code);
                                    if (m.prefix !== "*") setPrefix(m.prefix);
                                }}
                                onSelectCard={CARD_PAYMENT_ENABLED ? () => setPaymentMethod("CARD") : undefined}
                            />

                            {CARD_PAYMENT_ENABLED && paymentMethod === "CARD" && (
                                <PaxityCardPanel
                                    total={total}
                                    processing={processing}
                                    onBack={() => setStep(2)}
                                    onPay={handleCardPayment}
                                />
                            )}

                            {selectedMethod && (
                                <PaxityPhoneForm
                                    buyer={buyer}
                                    setBuyer={setBuyer}
                                    prefix={prefix}
                                    setPrefix={setPrefix}
                                    otp={otp}
                                    setOtp={setOtp}
                                    processing={processing}
                                    disabled={!paxityConfig?.configured}
                                    total={total}
                                    onSubmit={handlePayment}
                                    onBack={() => setStep(2)}
                                />
                            )}
                        </div>
                    )}
                </div>

                <CheckoutSummary items={items} />
            </div>
        </div>
    );
}
