import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
    Check, CreditCard, ShieldCheck, ArrowLeft, Phone, Loader2, XCircle, AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { useCart } from "@/context/CartContext";
import { formatPrice } from "@/components/ProductCard";
import { toast } from "sonner";
import { paxityAPI, stripeAPI } from "@/lib/api";
import { paxityDirectPayin, paxityDirectAvailable } from "@/lib/paxityDirect";
import { OrderSummary } from "@/components/OrderSummary";
import { StripeEmbedded } from "@/components/StripeEmbedded";
import { DeliveryOptions } from "@/components/DeliveryOptions";
import { orderNo } from "@/lib/utils";
import { t, getLocale, unitAmount, fmtAmount, cartDisplayTotal } from "@/lib/locale";
import { COUNTRIES, findCountry, countryName, STATES } from "@/lib/countries";

const OPERATOR_META = {
    "orange-money": { label: "Orange Money", color: "#FF7900", bg: "bg-[#FF7900]/10" },
    wave: { label: "Wave", color: "#1DC7FA", bg: "bg-[#1DC7FA]/10" },
    mtn: { label: "MTN", color: "#FFCC00", bg: "bg-[#FFCC00]/15" },
    moov: { label: "Moov", color: "#0060A9", bg: "bg-[#0060A9]/10" },
    card: { label: "Carte", color: "#111", bg: "bg-secondary" },
};

// La transaction en attente est persistée : si le client part payer dans
// l'app Wave/Orange Money et que le navigateur recharge la page au retour,
// on restaure l'attente et on affiche la confirmation dès que c'est payé.
const PENDING_TX_KEY = "sec_pending_paxity_tx_v1";

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
    const [checkingNow, setCheckingNow] = useState(false);
    const [stripeClientSecret, setStripeClientSecret] = useState(null);

    // Restaurer une transaction en attente (retour depuis l'app de paiement)
    useEffect(() => {
        try {
            const raw = localStorage.getItem(PENDING_TX_KEY);
            if (!raw) return;
            const tx = JSON.parse(raw);
            if (tx?.transaction_id && tx.status === "pending") setTransaction(tx);
            else localStorage.removeItem(PENDING_TX_KEY);
        } catch {
            localStorage.removeItem(PENDING_TX_KEY);
        }
    }, []);

    // Persister tant que le paiement est en attente
    useEffect(() => {
        if (!transaction) return;
        if (transaction.status === "pending") {
            localStorage.setItem(PENDING_TX_KEY, JSON.stringify(transaction));
        } else {
            localStorage.removeItem(PENDING_TX_KEY);
        }
    }, [transaction]);

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

    // Paiement dans le MÊME onglet : aucune nouvelle fenêtre ne s'ouvre.
    // Au retour (redirection paxity → site, ou bouton retour), la transaction
    // en attente est restaurée depuis localStorage et confirmée par polling.
    const openPayWindow = (url) => {
        window.location.href = url;
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
                    setComplete(true);
                    clear();
                    localStorage.removeItem(PENDING_TX_KEY);
                    toast.success(t("Paiement confirmé ✦"), { description: `${t("Commande")} ${orderNo(res.order_id)}` });
                } else if (res.status === "failed") {
                    localStorage.removeItem(PENDING_TX_KEY);
                    toast.error(t("Paiement échoué"), { description: t("Veuillez réessayer") });
                }
            } catch (e) {
                // ignore transient errors
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
                setTransaction((prev) => ({ ...prev, ...res }));
                setComplete(true);
                clear();
                localStorage.removeItem(PENDING_TX_KEY);
                toast.success(t("Paiement confirmé ✦"), { description: `${t("Commande")} ${orderNo(res.order_id)}` });
            } else if (res.status === "failed") {
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

    const handleStripeCheckout = async () => {
        setProcessing(true);
        try {
            const res = await stripeAPI.checkout({
                origin_url: window.location.origin,
                locale: getLocale().lang, // formulaire Stripe en fr ou en
                currency: getLocale().currency, // le client paie dans SA devise (XOF / EUR / USD)
                delivery_mode: deliveryMode,
                customer: {
                    name: `${buyer.firstName} ${buyer.lastName}`,
                    email: buyer.email,
                    city: buyer.city,
                    phone: buyer.phone ? `+${prefix} ${buyer.phone}` : undefined,
                    address: [buyer.address, buyer.zip, buyer.state, selectedCountry ? countryName(selectedCountry) : null].filter(Boolean).join(", ") || undefined,
                },
                items: items.map((it) => ({ product_id: it.id, qty: it.qty, size: it.size || undefined })),
            });
            if (res.client_secret) {
                // Paiement intégré : le formulaire carte s'affiche dans la page
                setStripeClientSecret(res.client_secret);
                window.scrollTo({ top: 0, behavior: "smooth" });
                setProcessing(false);
                return;
            }
            if (res.checkout_url) {
                window.location.href = res.checkout_url;
                return;
            }
            throw new Error("no url");
        } catch (err) {
            console.error("[Stripe] checkout error", err);
            toast.error(t("Paiement carte indisponible"), { description: t("Réessayez ou utilisez Mobile Money.") });
            setProcessing(false);
        }
    };

    const handlePayment = async (e) => {
        e.preventDefault();

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
                    name: it.size ? `${it.name} — Taille ${it.size}` : it.name,
                    price: it.price,
                    qty: it.qty,
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
        return (
            <div className="container mx-auto px-5 py-24 text-center">
                <div className="max-w-lg mx-auto">
                    <div className="h-20 w-20 mx-auto rounded-full bg-success/10 text-success flex items-center justify-center mb-6">
                        <Check className="h-10 w-10" />
                    </div>
                    <h1 className="font-display text-4xl sm:text-5xl mb-3" data-testid="order-confirmed-title">{t("Votre commande est confirmée 🎉")}</h1>
                    <p className="text-muted-foreground mb-2">
                        {t("Merci ! Votre paiement de")} <span className="font-semibold text-foreground">{formatPrice(transaction?.amount ?? total)}</span> {t("a bien été reçu. Nous préparons votre commande pour l'expédition depuis la Chine.")}
                    </p>
                    {transaction?.order_id && (
                        <p className="text-xs font-mono text-muted-foreground mb-8">{t("Commande")} {orderNo(transaction.order_id)}</p>
                    )}
                    {transaction?.order_id && <OrderSummary orderId={transaction.order_id} />}
                    <div className="flex flex-wrap gap-3 justify-center mt-8">
                        {transaction?.order_id && (
                            <Button asChild size="lg" className="rounded-full bg-primary text-primary-foreground hover:bg-primary/90" data-testid="track-order-btn">
                                <Link to={`/suivi/${transaction.order_id}`}>{t("Suivre ma commande")}</Link>
                            </Button>
                        )}
                        <Button asChild size="lg" className="rounded-full bg-ink text-ink-foreground hover:bg-ink/90">
                            <Link to="/">{t("Retour à l'accueil")}</Link>
                        </Button>
                        <Button asChild size="lg" variant="outline" className="rounded-full">
                            <Link to="/boutique">{t("Continuer les achats")}</Link>
                        </Button>
                    </div>
                </div>
            </div>
        );
    }

    // ---------- Pending screen ----------
    if (transaction && transaction.status === "pending") {
        return (
            <div className="container mx-auto px-5 py-24 text-center">
                <div className="max-w-lg mx-auto">
                    <div className="h-20 w-20 mx-auto rounded-full bg-primary/10 text-primary flex items-center justify-center mb-6">
                        <Loader2 className="h-10 w-10 animate-spin" />
                    </div>
                    <h1 className="font-display text-3xl sm:text-4xl mb-3">{t("Paiement en cours…")}</h1>
                    <p className="text-muted-foreground mb-2">
                        {t("Ouvrez l'application")} <span className="font-semibold text-foreground">{transaction.operator_label || operatorIconMeta.label}</span> {t("sur votre téléphone et validez la transaction.")}
                    </p>
                    <p className="text-xs text-muted-foreground mb-2" data-testid="paxity-return-hint">
                        {t("Après validation, revenez sur cette page : votre confirmation s'affichera automatiquement et vous recevrez un email. Vous pouvez fermer la page de paiement.")}
                    </p>
                    {transaction.payment_link && (
                        <div className="my-6 space-y-4">
                            <Button
                                size="lg"
                                className="rounded-full bg-ink text-ink-foreground hover:bg-ink/90"
                                onClick={() => openPayWindow(transaction.payment_link)}
                                data-testid="paxity-payment-link-btn"
                            >
                                {t("Payer maintenant")}
                            </Button>
                            {transaction.qr_code && (
                                <div className="flex justify-center">
                                    <img
                                        src={transaction.qr_code.startsWith("data:") ? transaction.qr_code : `data:image/png;base64,${transaction.qr_code}`}
                                        alt="QR code de paiement"
                                        className="h-40 w-40 rounded-lg border border-border bg-white p-2"
                                        data-testid="paxity-qr-code"
                                    />
                                </div>
                            )}
                        </div>
                    )}
                    <p className="text-sm text-muted-foreground mb-6">
                        {t("Après le paiement,")} <span className="font-medium text-foreground">{t("revenez sur cet onglet")}</span>{t(": votre confirmation s'affichera ici automatiquement.")}
                    </p>
                    <div className="mb-8">
                        <Button
                            size="lg"
                            variant="outline"
                            onClick={manualCheck}
                            disabled={checkingNow}
                            className="rounded-full border-primary text-primary hover:bg-primary hover:text-primary-foreground"
                            data-testid="paxity-manual-check-btn"
                        >
                            {checkingNow ? (
                                <><Loader2 className="h-4 w-4 animate-spin" /> {t("Vérification…")}</>
                            ) : (
                                <><Check className="h-4 w-4" /> {t("J'ai payé — Vérifier")}</>
                            )}
                        </Button>
                    </div>
                    <div className="inline-flex items-center gap-2 text-xs text-muted-foreground bg-secondary/50 rounded-full px-3 py-1.5">
                        <span className="relative flex h-2 w-2">
                            <span className="absolute inline-flex h-full w-full rounded-full bg-primary opacity-75 animate-ping" />
                            <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
                        </span>
                        {t("En attente de confirmation Paxity")}
                    </div>
                    <div className="mt-6">
                        <button
                            type="button"
                            onClick={() => { localStorage.removeItem(PENDING_TX_KEY); setTransaction(null); }}
                            className="text-xs text-muted-foreground underline hover:text-foreground"
                            data-testid="paxity-cancel-pending-btn"
                        >
                            {t("Annuler et choisir un autre moyen de paiement")}
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    // ---------- Paiement par carte intégré (le client reste sur le site) ----------
    if (stripeClientSecret) {
        return (
            <div className="container mx-auto px-5 py-10 md:py-14">
                <StripeEmbedded clientSecret={stripeClientSecret} onBack={() => setStripeClientSecret(null)} />
            </div>
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
                        <div className="space-y-5 bg-card p-6 md:p-8 rounded-2xl shadow-card">
                            <h2 className="font-display text-2xl">{t("Adresse de livraison")}</h2>
                            <div className="grid sm:grid-cols-2 gap-4">
                                <div className="space-y-1.5"><Label>{t("Prénom")}</Label><Input required value={buyer.firstName} onChange={(e) => setBuyer({ ...buyer, firstName: e.target.value })} /></div>
                                <div className="space-y-1.5"><Label>{t("Nom")}</Label><Input required value={buyer.lastName} onChange={(e) => setBuyer({ ...buyer, lastName: e.target.value })} /></div>
                                <div className="space-y-1.5 sm:col-span-2"><Label>Email</Label><Input required type="email" value={buyer.email} onChange={(e) => setBuyer({ ...buyer, email: e.target.value })} /></div>
                                <div className="space-y-1.5 sm:col-span-2"><Label>{t("Adresse")}</Label><Input required value={buyer.address} onChange={(e) => setBuyer({ ...buyer, address: e.target.value })} /></div>
                                <div className="space-y-1.5"><Label>{t("Code postal")}</Label><Input value={buyer.zip} onChange={(e) => setBuyer({ ...buyer, zip: e.target.value })} /></div>
                                <div className="space-y-1.5"><Label>{t("Ville")}</Label><Input required value={buyer.city} onChange={(e) => setBuyer({ ...buyer, city: e.target.value })} /></div>
                                <div className="space-y-1.5 sm:col-span-2">
                                    <Label>{t("Pays")}</Label>
                                    <Select value={buyer.country} onValueChange={changeCountry}>
                                        <SelectTrigger data-testid="country-select">
                                            <SelectValue placeholder={t("Choisissez votre pays")} />
                                        </SelectTrigger>
                                        <SelectContent className="max-h-[300px]">
                                            {COUNTRIES.map((c) => (
                                                <SelectItem key={c.code} value={c.code} data-testid={`country-option-${c.code}`}>
                                                    {c.flag} {countryName(c)} (+{c.dial})
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                                {STATES[buyer.country] && (
                                    <div className="space-y-1.5 sm:col-span-2">
                                        <Label>{buyer.country === "CA" ? t("Province") : t("État")}</Label>
                                        <Select value={buyer.state} onValueChange={(s) => setBuyer({ ...buyer, state: s })}>
                                            <SelectTrigger data-testid="state-select">
                                                <SelectValue placeholder={buyer.country === "CA" ? t("Choisissez votre province") : t("Choisissez votre état")} />
                                            </SelectTrigger>
                                            <SelectContent className="max-h-[300px]">
                                                {STATES[buyer.country].map((s) => (
                                                    <SelectItem key={s} value={s} data-testid={`state-option-${s.replace(/\s+/g, "-")}`}>
                                                        {s}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                )}
                                <div className="space-y-1.5 sm:col-span-2">
                                    <Label>{t("Téléphone")}</Label>
                                    <div className="flex">
                                        <span data-testid="phone-prefix" className="inline-flex items-center gap-1 px-3 rounded-l-md border border-r-0 border-input bg-muted/60 text-sm text-foreground whitespace-nowrap">
                                            {selectedCountry?.flag} +{prefix}
                                        </span>
                                        <Input required type="tel" value={buyer.phone} onChange={(e) => setBuyer({ ...buyer, phone: e.target.value })} className="rounded-l-none" data-testid="phone-input" />
                                    </div>
                                </div>
                            </div>
                            <Button
                                type="button"
                                onClick={() => {
                                    if (!buyerValid()) { toast.error(t("Veuillez remplir tous les champs requis")); return; }
                                    setStep(2);
                                }}
                                className="w-full sm:w-auto bg-ink text-ink-foreground hover:bg-ink/90 rounded-full h-11 px-8"
                            >
                                {t("Continuer")}
                            </Button>
                        </div>
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

                            {/* Method picker */}
                            <div>
                                <p className="text-sm font-medium mb-3">{t("Choisissez votre moyen de paiement")}</p>
                                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                                    {paxityConfig?.methods?.map((m) => {
                                        const meta = OPERATOR_META[m.icon] || OPERATOR_META.card;
                                        const active = paymentMethod === m.code;
                                        return (
                                            <button
                                                key={m.code}
                                                type="button"
                                                onClick={() => {
                                                    setPaymentMethod(m.code);
                                                    if (m.prefix !== "*") setPrefix(m.prefix);
                                                }}
                                                className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 transition-all ${active ? "border-primary bg-primary/5" : "border-border hover:border-foreground/30"}`}
                                            >
                                                <span className={`h-10 w-10 rounded-full flex items-center justify-center ${meta.bg}`}>
                                                    {m.icon === "card" ? (
                                                        <CreditCard className="h-4 w-4" style={{ color: meta.color }} />
                                                    ) : (
                                                        <Phone className="h-4 w-4" style={{ color: meta.color }} />
                                                    )}
                                                </span>
                                                <span className="text-xs font-medium text-center leading-tight">{m.label}</span>
                                            </button>
                                        );
                                    })}
                                    <button
                                        type="button"
                                        data-testid="stripe-card-method-btn"
                                        onClick={() => setPaymentMethod("CARD")}
                                        className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 transition-all ${paymentMethod === "CARD" ? "border-primary bg-primary/5" : "border-border hover:border-foreground/30"}`}
                                    >
                                        <span className="h-10 w-10 rounded-full flex items-center justify-center bg-indigo-500/10">
                                            <CreditCard className="h-4 w-4 text-indigo-600" />
                                        </span>
                                        <span className="text-xs font-medium text-center leading-tight">{t("Carte bancaire")}</span>
                                    </button>
                                </div>
                            </div>

                            {/* Card payment (Stripe) */}
                            {paymentMethod === "CARD" && (
                                <div className="space-y-4" data-testid="stripe-card-panel">
                                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                        <ShieldCheck className="h-4 w-4 text-success" />
                                        {t("Paiement sécurisé via Stripe · Chiffrement bout-en-bout")}
                                    </div>
                                    {getLocale().currency !== "XOF" && (
                                        <p className="text-[11px] text-muted-foreground" data-testid="stripe-currency-note">
                                            {t("Vous payez par carte dans votre devise :")} <span className="font-medium text-foreground">{fmtAmount(cartDisplayTotal(items))}</span>
                                        </p>
                                    )}
                                    <div className="flex gap-2 pt-2">
                                        <Button type="button" variant="outline" onClick={() => setStep(2)} className="rounded-full h-11 px-6">{t("Retour")}</Button>
                                        <Button
                                            type="button"
                                            data-testid="stripe-pay-btn"
                                            onClick={handleStripeCheckout}
                                            disabled={processing}
                                            className="bg-primary hover:bg-primary/90 text-primary-foreground rounded-full h-11 px-8 flex-1 sm:flex-none shadow-warm"
                                        >
                                            {processing ? (
                                                <><Loader2 className="h-4 w-4 animate-spin" /> {t("Chargement…")}</>
                                            ) : (
                                                <>{t("Payer par carte")} {fmtAmount(cartDisplayTotal(items))}</>
                                            )}
                                        </Button>
                                    </div>
                                </div>
                            )}

                            {/* Phone form */}
                            {selectedMethod && (
                                <form onSubmit={handlePayment} className="space-y-4">
                                    <div className="grid grid-cols-[100px_1fr] gap-2">
                                        <div className="space-y-1.5">
                                            <Label>{t("Indicatif")}</Label>
                                            <div className="relative">
                                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">+</span>
                                                <Input value={prefix} onChange={(e) => setPrefix(e.target.value.replace(/\D/g, ""))} className="pl-6" />
                                            </div>
                                        </div>
                                        <div className="space-y-1.5">
                                            <Label>{t("Numéro de téléphone")}</Label>
                                            <Input
                                                required
                                                type="tel"
                                                value={buyer.phone}
                                                onChange={(e) => setBuyer({ ...buyer, phone: e.target.value })}
                                            />
                                            <p className="text-[11px] text-muted-foreground">
                                                {(() => {
                                                    const digits = buyer.phone.replace(/\D/g, "").length;
                                                    const expected = { "221": `9 ${t("chiffres")}`, "225": `10 ${t("chiffres")}`, "226": `8 ${t("chiffres")}`, "227": `8 ${t("chiffres")}`, "228": `8 ${t("chiffres")}`, "233": `9 ${t("chiffres")}`, "237": `9 ${t("chiffres")}` }[prefix] || `8 à 10 ${t("chiffres")}`;
                                                    return `+${prefix} — ${t("attendu :")} ${expected} · ${t("saisi :")} ${digits}`;
                                                })()}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="space-y-1.5">
                                        <Label>
                                            {t("Code OTP")} <span className="text-muted-foreground text-xs">{t("(facultatif)")}</span>
                                        </Label>
                                        <Input
                                            data-testid="paxity-otp-input"
                                            value={otp}
                                            onChange={(e) => setOtp(e.target.value)}
                                            placeholder={t("Laissez vide si non requis")}
                                            className="font-mono tracking-wider"
                                        />
                                        <p className="text-[11px] text-muted-foreground">
                                            {t("Après validation, vous recevrez un lien de paiement à confirmer. Si votre opérateur vous a déjà fourni un code, saisissez-le ici.")}
                                        </p>
                                    </div>

                                    <div className="flex items-center gap-2 text-xs text-muted-foreground pt-2">
                                        <ShieldCheck className="h-4 w-4 text-success" />
                                        {t("Paiement sécurisé via Paxity · Chiffrement bout-en-bout")}
                                    </div>

                                    <div className="flex gap-2 pt-2">
                                        <Button type="button" variant="outline" onClick={() => setStep(2)} className="rounded-full h-11 px-6">{t("Retour")}</Button>
                                        <Button
                                            type="submit"
                                            disabled={processing || !paxityConfig?.configured}
                                            className="bg-primary hover:bg-primary/90 text-primary-foreground rounded-full h-11 px-8 flex-1 sm:flex-none shadow-warm"
                                        >
                                            {processing ? (
                                                <>
                                                    <Loader2 className="h-4 w-4 animate-spin" />
                                                    {t("Traitement…")}
                                                </>
                                            ) : (
                                                <>{t("Payer")} {formatPrice(total)}</>
                                            )}
                                        </Button>
                                    </div>
                                </form>
                            )}
                        </div>
                    )}
                </div>

                <aside className="order-1 lg:order-2">
                    <div className="sticky top-24 bg-secondary/40 rounded-2xl p-6 space-y-4">
                        <h3 className="font-display text-xl">{t("Votre commande")}</h3>
                        <div className="space-y-3 max-h-[280px] overflow-y-auto">
                            {items.map((it) => (
                                <div key={it.line || it.id} className="flex gap-3">
                                    <div className="relative h-14 w-14 rounded-lg overflow-hidden bg-muted shrink-0">
                                        {it.image ? <img src={it.image} alt="" className="h-full w-full object-cover" /> : null}
                                        <span className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-ink text-ink-foreground text-[10px] font-medium flex items-center justify-center">{it.qty}</span>
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-medium truncate">{it.name}</p>
                                        {it.size && <p className="text-xs text-muted-foreground">{t("Taille")} {it.size}</p>}
                                    </div>
                                    <span className="text-sm font-medium">{fmtAmount(unitAmount(it) * it.qty)}</span>
                                </div>
                            ))}
                        </div>
                        <Separator />
                        <div className="space-y-2 text-sm">
                            <div className="flex justify-between"><span className="text-muted-foreground">{t("Sous-total")}</span><span>{fmtAmount(cartDisplayTotal(items))}</span></div>
                            <div className="flex justify-between"><span className="text-muted-foreground">{t("Livraison Chine → Monde entier")}</span><span className="text-muted-foreground">{t("10–20 jours")}</span></div>
                        </div>
                        <Separator />
                        <div className="flex justify-between items-baseline">
                            <span className="font-medium">{t("Total")}</span>
                            <span className="font-display text-2xl font-semibold">{fmtAmount(cartDisplayTotal(items))}</span>
                        </div>
                    </div>
                </aside>
            </div>
        </div>
    );
}
