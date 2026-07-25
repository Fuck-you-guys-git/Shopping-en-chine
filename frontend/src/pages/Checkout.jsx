import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
    Check, CreditCard, Truck, ShieldCheck, ArrowLeft, Phone, Loader2, XCircle, AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useCart } from "@/context/CartContext";
import { formatPrice } from "@/components/ProductCard";
import { toast } from "sonner";
import { paxityAPI } from "@/lib/api";
import { paxityDirectPayin, paxityDirectAvailable } from "@/lib/paxityDirect";

const OPERATOR_META = {
    "orange-money": { label: "Orange Money", color: "#FF7900", bg: "bg-[#FF7900]/10" },
    wave: { label: "Wave", color: "#1DC7FA", bg: "bg-[#1DC7FA]/10" },
    mtn: { label: "MTN", color: "#FFCC00", bg: "bg-[#FFCC00]/15" },
    moov: { label: "Moov", color: "#0060A9", bg: "bg-[#0060A9]/10" },
    card: { label: "Carte", color: "#111", bg: "bg-secondary" },
};

export default function Checkout() {
    const { items, subtotal, clear } = useCart();
    const navigate = useNavigate();
    const [step, setStep] = useState(1);
    const shipping = subtotal > 30000 || subtotal === 0 ? 0 : 3000;
    const total = subtotal + shipping;

    const [buyer, setBuyer] = useState({
        firstName: "", lastName: "", email: "",
        phone: "", address: "", zip: "", city: "",
    });

    const [paxityConfig, setPaxityConfig] = useState(null);
    const [paxityError, setPaxityError] = useState(null);
    const [paymentMethod, setPaymentMethod] = useState("");
    const [prefix, setPrefix] = useState("221");
    const [otp, setOtp] = useState("");

    const [processing, setProcessing] = useState(false);
    const [transaction, setTransaction] = useState(null); // { transaction_id, status, order_id, ... }
    const [complete, setComplete] = useState(false);

    // Fetch backend config
    useEffect(() => {
        paxityAPI.getConfig()
            .then((cfg) => {
                setPaxityConfig(cfg);
                // Pre-select first available method
                if (cfg.methods && cfg.methods.length > 0) {
                    setPaymentMethod(cfg.methods[0].code);
                    setPrefix(cfg.methods[0].prefix !== "*" ? cfg.methods[0].prefix : "221");
                }
            })
            .catch(() => setPaxityError("Impossible de contacter le service de paiement."));
    }, []);

    // Poll status while pending
    useEffect(() => {
        if (!transaction || transaction.status !== "pending") return;
        const interval = setInterval(async () => {
            try {
                const res = await paxityAPI.getStatus(transaction.transaction_id);
                if (res.status !== transaction.status) {
                    // Merge the full response so amount/order_id survive the
                    // cart clear() and render correctly on the confirmation.
                    setTransaction((prev) => ({ ...prev, ...res }));
                }
                if (res.status === "success") {
                    setComplete(true);
                    clear();
                    toast.success("Paiement confirmé ✦", { description: `Commande ${res.order_id}` });
                    clearInterval(interval);
                } else if (res.status === "failed") {
                    toast.error("Paiement échoué", { description: "Veuillez réessayer" });
                    clearInterval(interval);
                }
            } catch (e) {
                // ignore transient errors
            }
        }, 3500);
        return () => clearInterval(interval);
    }, [transaction, clear]);

    const buyerValid = () =>
        buyer.firstName && buyer.lastName && buyer.email && buyer.phone && buyer.address && buyer.city;

    const selectedMethod = paxityConfig?.methods?.find((m) => m.code === paymentMethod);
    const operatorIconMeta = selectedMethod ? (OPERATOR_META[selectedMethod.icon] || OPERATOR_META.card) : OPERATOR_META.card;

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
            toast.error("Numéro de téléphone invalide", {
                description: `Pour l'indicatif +${prefix}, le numéro doit contenir ${expected} chiffres. Vous avez saisi ${cleanPhone.length} chiffres.`,
            });
            return;
        }

        // Phase 3: block submission when the selected method requires an OTP
        // but the user hasn't filled it in.
        if (selectedMethod?.requires_otp && !otp.trim()) {
            toast.error("Code OTP requis", {
                description: `${selectedMethod.label} exige un code OTP avant de valider le paiement.`,
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
                customer: {
                    name: `${buyer.firstName} ${buyer.lastName}`,
                    email: buyer.email,
                    city: buyer.city,
                },
                items: items.map((it) => ({
                    product_id: it.id,
                    name: it.name,
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

            setTransaction(res);
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

            toast.error("Erreur de paiement", { description: detail });
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
                    <h1 className="font-display text-4xl sm:text-5xl mb-3" data-testid="order-confirmed-title">Votre commande est confirmée 🎉</h1>
                    <p className="text-muted-foreground mb-2">
                        Merci ! Votre paiement de <span className="font-semibold text-foreground">{formatPrice(transaction?.amount ?? total)}</span> a bien été reçu. Nous préparons votre commande pour l&apos;expédition depuis la Chine.
                    </p>
                    {transaction?.order_id && (
                        <p className="text-xs font-mono text-muted-foreground mb-8">Commande {transaction.order_id}</p>
                    )}
                    <div className="flex flex-wrap gap-3 justify-center">
                        {transaction?.order_id && (
                            <Button asChild size="lg" className="rounded-full bg-primary text-primary-foreground hover:bg-primary/90" data-testid="track-order-btn">
                                <Link to={`/suivi/${transaction.order_id}`}>Suivre ma commande</Link>
                            </Button>
                        )}
                        <Button asChild size="lg" className="rounded-full bg-ink text-ink-foreground hover:bg-ink/90">
                            <Link to="/">Retour à l&apos;accueil</Link>
                        </Button>
                        <Button asChild size="lg" variant="outline" className="rounded-full">
                            <Link to="/boutique">Continuer les achats</Link>
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
                    <h1 className="font-display text-3xl sm:text-4xl mb-3">Paiement en cours…</h1>
                    <p className="text-muted-foreground mb-2">
                        Ouvrez l&apos;application <span className="font-semibold text-foreground">{operatorIconMeta.label}</span> sur votre téléphone et validez la transaction.
                    </p>
                    {transaction.payment_link && (
                        <div className="my-6 space-y-4">
                            <Button
                                asChild
                                size="lg"
                                className="rounded-full bg-ink text-ink-foreground hover:bg-ink/90"
                                data-testid="paxity-payment-link-btn"
                            >
                                <a href={transaction.payment_link} target="_blank" rel="noopener noreferrer">
                                    Payer maintenant
                                </a>
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
                    <p className="text-sm text-muted-foreground mb-8">
                        Nous mettrons cette page à jour automatiquement dès la confirmation.
                    </p>
                    <div className="inline-flex items-center gap-2 text-xs text-muted-foreground bg-secondary/50 rounded-full px-3 py-1.5">
                        <span className="relative flex h-2 w-2">
                            <span className="absolute inline-flex h-full w-full rounded-full bg-primary opacity-75 animate-ping" />
                            <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
                        </span>
                        En attente de confirmation Paxity
                    </div>
                </div>
            </div>
        );
    }

    // ---------- Empty cart guard ----------
    if (items.length === 0) {
        return (
            <div className="container mx-auto px-5 py-24 text-center">
                <h1 className="font-display text-4xl mb-3">Panier vide</h1>
                <p className="text-muted-foreground mb-6">Ajoutez des produits avant de commander.</p>
                <Button asChild className="rounded-full"><Link to="/boutique">Voir la boutique</Link></Button>
            </div>
        );
    }

    const steps = [
        { n: 1, label: "Adresse" },
        { n: 2, label: "Livraison" },
        { n: 3, label: "Paiement" },
    ];

    return (
        <div className="container mx-auto px-5 py-10 md:py-14">
            <Link to="/panier" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-6">
                <ArrowLeft className="h-4 w-4" /> Retour au panier
            </Link>
            <h1 className="font-display text-4xl sm:text-5xl font-medium tracking-tight mb-8">Commande</h1>

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
                            <h2 className="font-display text-2xl">Adresse de livraison</h2>
                            <div className="grid sm:grid-cols-2 gap-4">
                                <div className="space-y-1.5"><Label>Prénom</Label><Input required placeholder="Marie" value={buyer.firstName} onChange={(e) => setBuyer({ ...buyer, firstName: e.target.value })} /></div>
                                <div className="space-y-1.5"><Label>Nom</Label><Input required placeholder="Dupont" value={buyer.lastName} onChange={(e) => setBuyer({ ...buyer, lastName: e.target.value })} /></div>
                                <div className="space-y-1.5 sm:col-span-2"><Label>Email</Label><Input required type="email" placeholder="marie@exemple.com" value={buyer.email} onChange={(e) => setBuyer({ ...buyer, email: e.target.value })} /></div>
                                <div className="space-y-1.5 sm:col-span-2"><Label>Adresse</Label><Input required placeholder="Rue, quartier…" value={buyer.address} onChange={(e) => setBuyer({ ...buyer, address: e.target.value })} /></div>
                                <div className="space-y-1.5"><Label>Code postal</Label><Input placeholder="10000" value={buyer.zip} onChange={(e) => setBuyer({ ...buyer, zip: e.target.value })} /></div>
                                <div className="space-y-1.5"><Label>Ville</Label><Input required placeholder="Dakar" value={buyer.city} onChange={(e) => setBuyer({ ...buyer, city: e.target.value })} /></div>
                                <div className="space-y-1.5 sm:col-span-2"><Label>Téléphone</Label><Input required type="tel" placeholder="77 XXX XX XX" value={buyer.phone} onChange={(e) => setBuyer({ ...buyer, phone: e.target.value })} /></div>
                            </div>
                            <Button
                                type="button"
                                onClick={() => {
                                    if (!buyerValid()) { toast.error("Veuillez remplir tous les champs requis"); return; }
                                    setStep(2);
                                }}
                                className="w-full sm:w-auto bg-ink text-ink-foreground hover:bg-ink/90 rounded-full h-11 px-8"
                            >
                                Continuer
                            </Button>
                        </div>
                    )}

                    {step === 2 && (
                        <div className="space-y-5 bg-card p-6 md:p-8 rounded-2xl shadow-card">
                            <h2 className="font-display text-2xl">Mode de livraison</h2>
                            <RadioGroup defaultValue="std" className="space-y-3">
                                <label className="flex items-center gap-4 p-4 border rounded-xl cursor-pointer hover:border-primary transition-colors">
                                    <RadioGroupItem value="std" />
                                    <Truck className="h-5 w-5 text-primary" />
                                    <div className="flex-1">
                                        <p className="font-medium">Livraison standard · Chine → Dakar</p>
                                        <p className="text-xs text-muted-foreground">10–20 jours</p>
                                    </div>
                                    <span className="font-medium text-success">Offerte</span>
                                </label>
                            </RadioGroup>
                            <div className="flex gap-2 pt-2">
                                <Button type="button" variant="outline" onClick={() => setStep(1)} className="rounded-full h-11 px-6">Retour</Button>
                                <Button type="button" onClick={() => setStep(3)} className="bg-ink text-ink-foreground hover:bg-ink/90 rounded-full h-11 px-8">Continuer</Button>
                            </div>
                        </div>
                    )}

                    {step === 3 && (
                        <div className="space-y-5 bg-card p-6 md:p-8 rounded-2xl shadow-card">
                            <div className="flex items-center justify-between">
                                <h2 className="font-display text-2xl">Paiement Mobile Money</h2>
                                {paxityConfig && (
                                    <span className={`inline-flex items-center gap-1.5 text-[10px] uppercase tracking-widest font-semibold px-2 py-1 rounded-full ${paxityConfig.configured ? "bg-success/15 text-success" : "bg-amber-100 text-amber-700"}`}>
                                        <ShieldCheck className="h-3 w-3" /> Paxity {paxityConfig.environment}
                                    </span>
                                )}
                            </div>

                            {paxityConfig && !paxityConfig.configured && (
                                <div className="flex gap-3 p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-sm">
                                    <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" />
                                    <div>
                                        <p className="font-medium">Paiement momentanément indisponible</p>
                                        <p className="text-xs mt-1 opacity-90">
                                            Le paiement en ligne est en cours de maintenance. Veuillez réessayer dans quelques instants.
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
                                <p className="text-sm font-medium mb-3">Choisissez votre moyen de paiement</p>
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
                                </div>
                            </div>

                            {/* Phone form */}
                            {selectedMethod && (
                                <form onSubmit={handlePayment} className="space-y-4">
                                    <div className="grid grid-cols-[100px_1fr] gap-2">
                                        <div className="space-y-1.5">
                                            <Label>Indicatif</Label>
                                            <div className="relative">
                                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">+</span>
                                                <Input value={prefix} onChange={(e) => setPrefix(e.target.value.replace(/\D/g, ""))} className="pl-6" />
                                            </div>
                                        </div>
                                        <div className="space-y-1.5">
                                            <Label>Numéro de téléphone</Label>
                                            <Input
                                                required
                                                type="tel"
                                                placeholder="77 XXX XX XX"
                                                value={buyer.phone}
                                                onChange={(e) => setBuyer({ ...buyer, phone: e.target.value })}
                                            />
                                            <p className="text-[11px] text-muted-foreground">
                                                {(() => {
                                                    const digits = buyer.phone.replace(/\D/g, "").length;
                                                    const expected = { "221": "9 chiffres", "225": "10 chiffres", "226": "8 chiffres", "227": "8 chiffres", "228": "8 chiffres", "233": "9 chiffres", "237": "9 chiffres" }[prefix] || "8 à 10 chiffres";
                                                    return `+${prefix} — attendu : ${expected} · saisi : ${digits}`;
                                                })()}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="space-y-1.5">
                                        <Label>
                                            Code OTP <span className="text-muted-foreground text-xs">(facultatif)</span>
                                        </Label>
                                        <Input
                                            data-testid="paxity-otp-input"
                                            value={otp}
                                            onChange={(e) => setOtp(e.target.value)}
                                            placeholder="Laissez vide si non requis"
                                            className="font-mono tracking-wider"
                                        />
                                        <p className="text-[11px] text-muted-foreground">
                                            Après validation, vous recevrez un lien de paiement à confirmer. Si votre opérateur vous a déjà fourni un code, saisissez-le ici.
                                        </p>
                                    </div>

                                    <div className="flex items-center gap-2 text-xs text-muted-foreground pt-2">
                                        <ShieldCheck className="h-4 w-4 text-success" />
                                        Paiement sécurisé via Paxity · Chiffrement bout-en-bout
                                    </div>

                                    <div className="flex gap-2 pt-2">
                                        <Button type="button" variant="outline" onClick={() => setStep(2)} className="rounded-full h-11 px-6">Retour</Button>
                                        <Button
                                            type="submit"
                                            disabled={processing || !paxityConfig?.configured}
                                            className="bg-primary hover:bg-primary/90 text-primary-foreground rounded-full h-11 px-8 flex-1 sm:flex-none shadow-warm"
                                        >
                                            {processing ? (
                                                <>
                                                    <Loader2 className="h-4 w-4 animate-spin" />
                                                    Traitement…
                                                </>
                                            ) : (
                                                <>Payer {formatPrice(total)}</>
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
                        <h3 className="font-display text-xl">Votre commande</h3>
                        <div className="space-y-3 max-h-[280px] overflow-y-auto">
                            {items.map((it) => (
                                <div key={it.id} className="flex gap-3">
                                    <div className="relative h-14 w-14 rounded-lg overflow-hidden bg-muted shrink-0">
                                        <img src={it.image} alt="" className="h-full w-full object-cover" />
                                        <span className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-ink text-ink-foreground text-[10px] font-medium flex items-center justify-center">{it.qty}</span>
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-medium truncate">{it.name}</p>
                                        <p className="text-xs text-muted-foreground">Taille M</p>
                                    </div>
                                    <span className="text-sm font-medium">{formatPrice(it.price * it.qty)}</span>
                                </div>
                            ))}
                        </div>
                        <Separator />
                        <div className="space-y-2 text-sm">
                            <div className="flex justify-between"><span className="text-muted-foreground">Sous-total</span><span>{formatPrice(subtotal)}</span></div>
                            <div className="flex justify-between"><span className="text-muted-foreground">Livraison</span><span>{shipping === 0 ? <span className="text-success">Offerte</span> : formatPrice(shipping)}</span></div>
                        </div>
                        <Separator />
                        <div className="flex justify-between items-baseline">
                            <span className="font-medium">Total</span>
                            <span className="font-display text-2xl font-semibold">{formatPrice(total)}</span>
                        </div>
                    </div>
                </aside>
            </div>
        </div>
    );
}
