import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Check, ShieldCheck, ArrowLeft, Loader2, MapPin, Smartphone, CreditCard, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PaxityWidget } from "@/components/PaxityWidget";
import { useCart } from "@/context/CartContext";
import { useCurrency } from "@/context/CurrencyContext";
import { apiErrorMessage, ordersAPI, paymentsAPI } from "@/lib/api";
import { formatMinor, formatMoney, formatPrice } from "@/lib/money";
import { SHIPPING_METHODS, shippingFee } from "@/lib/shipping";
import { toast } from "sonner";

const COUNTRIES = [
    { code: "SN", label: "Sénégal" },
    { code: "CI", label: "Côte d'Ivoire" },
];

// Wave / Orange Money are paid in F CFA; cards in € or $ (see backend/orders.py).
const PAYMENT_OPTIONS = [
    { id: "mobile_money", icon: Smartphone, label: "Wave / Orange Money", hint: "Payez en F CFA depuis votre téléphone", online: true },
    { id: "carte", icon: CreditCard, label: "Carte bancaire", hint: "Payez en euros ou en dollars", online: true },
    { id: "livraison", icon: Truck, label: "Paiement à la livraison", hint: "Réglez en F CFA à la réception du colis", online: false },
];
const CARD_CURRENCIES = [
    { code: "EUR", label: "€ Euro" },
    { code: "USD", label: "$ Dollar" },
];

export default function Checkout() {
    const { items, subtotal, clear } = useCart();
    const { currency: displayCurrency, rates, paxity } = useCurrency();
    const [step, setStep] = useState(1);

    const [buyer, setBuyer] = useState({
        firstName: "", lastName: "", email: "",
        phone: "", address: "", zip: "", city: "", country: "SN",
    });
    const [shippingMethod, setShippingMethod] = useState("standard");
    const [paymentChoice, setPaymentChoice] = useState(null);
    const [cardCurrency, setCardCurrency] = useState(displayCurrency === "USD" ? "USD" : "EUR");

    const [processing, setProcessing] = useState(false);
    const [pendingOrder, setPendingOrder] = useState(null); // created, waiting for the Paxity widget
    const [doneOrder, setDoneOrder] = useState(null);
    const paymentBox = useRef(null);

    // The widget replaces the payment choices: bring it into view.
    useEffect(() => {
        if (pendingOrder) paymentBox.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, [pendingOrder]);

    const shipping = shippingFee(shippingMethod, subtotal);
    const total = subtotal + shipping;
    const paymentOptions = PAYMENT_OPTIONS.filter((o) => paxity.enabled || !o.online);
    const payment = paymentOptions.some((o) => o.id === paymentChoice) ? paymentChoice : paymentOptions[0].id;
    const paymentCurrency = payment === "carte" ? cardCurrency : "XOF";

    const buyerValid = () =>
        buyer.firstName && buyer.lastName && buyer.email && buyer.phone && buyer.address && buyer.city;

    const finish = (order) => {
        setPendingOrder(null);
        setDoneOrder(order);
        clear();
        toast.success("Commande confirmée ✦", { description: `Commande ${order.id}` });
    };

    const handleSubmit = async () => {
        setProcessing(true);
        try {
            const order = await ordersAPI.create({
                customer: {
                    first_name: buyer.firstName,
                    last_name: buyer.lastName,
                    email: buyer.email,
                    phone: buyer.phone,
                    address: buyer.address,
                    zip: buyer.zip,
                    city: buyer.city,
                    country: buyer.country,
                },
                // Only ids and quantities: the server prices the order from its catalog.
                items: items.map((it) => ({ product_id: it.id, qty: it.qty })),
                shipping_method: shippingMethod,
                payment_method: payment,
                payment_currency: paymentCurrency,
            });
            if (order.payment_method === "livraison") finish(order);
            else setPendingOrder(order);
        } catch (err) {
            toast.error("Impossible d'enregistrer la commande", { description: apiErrorMessage(err) });
        } finally {
            setProcessing(false);
        }
    };

    const paxityHandlers = {
        onSuccess: async () => {
            const order = pendingOrder;
            try {
                await paymentsAPI.reportPaxity(order.id);
            } catch {
                // The payment itself went through; the shop owner checks it in the Paxity dashboard anyway.
            }
            finish(order);
        },
        onFailure: (reason) =>
            toast.error("Paiement refusé", { description: reason ? String(reason) : "Réessayez ou choisissez un autre moyen de paiement." }),
        onCancel: () => {
            setPendingOrder(null);
            toast("Paiement annulé");
        },
        onError: (message) => {
            setPendingOrder(null);
            toast.error("Paiement indisponible", { description: message ? String(message) : "Réessayez dans un instant." });
        },
    };

    // ---------- Success screen ----------
    if (doneOrder) {
        const paidOnline = doneOrder.payment_method !== "livraison";
        return (
            <div className="container mx-auto px-5 py-24 text-center">
                <div className="max-w-lg mx-auto">
                    <div className="h-20 w-20 mx-auto rounded-full bg-success/10 text-success flex items-center justify-center mb-6">
                        <Check className="h-10 w-10" />
                    </div>
                    <h1 className="font-display text-4xl sm:text-5xl mb-3">Commande confirmée !</h1>
                    <p className="text-muted-foreground mb-2">
                        {paidOnline ? (
                            <>
                                Merci ! Votre paiement de{" "}
                                <span className="font-semibold text-foreground">{formatMinor(doneOrder.amount_minor, doneOrder.payment_currency)}</span>{" "}
                                a bien été transmis. Nous vérifions sa réception, puis préparons votre colis.
                            </>
                        ) : (
                            <>
                                Merci ! Votre commande de <span className="font-semibold text-foreground">{formatPrice(doneOrder.total)}</span> est confirmée.
                                Vous réglerez à la livraison.
                            </>
                        )}
                    </p>
                    <p className="text-xs font-mono text-muted-foreground mb-8">Commande {doneOrder.id}</p>
                    <div className="flex flex-wrap gap-3 justify-center">
                        <Button asChild size="lg" className="rounded-full bg-ink text-ink-foreground hover:bg-ink/90">
                            <Link to="/">Retour à l'accueil</Link>
                        </Button>
                        <Button asChild size="lg" variant="outline" className="rounded-full">
                            <Link to="/boutique">Continuer les achats</Link>
                        </Button>
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

    const submitLabel =
        payment === "livraison"
            ? `Confirmer la commande · ${formatPrice(total)}`
            : payment === "carte"
                ? `Payer ${formatMoney(total, cardCurrency, rates)} par carte`
                : `Payer ${formatPrice(total)}`;

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
                <div className="space-y-8">
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
                                <div className="space-y-1.5">
                                    <Label>Pays</Label>
                                    <Select value={buyer.country} onValueChange={(country) => setBuyer({ ...buyer, country })}>
                                        <SelectTrigger aria-label="Pays"><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                            {COUNTRIES.map((c) => <SelectItem key={c.code} value={c.code}>{c.label}</SelectItem>)}
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="space-y-1.5"><Label>Téléphone</Label><Input required type="tel" placeholder="77 XXX XX XX" value={buyer.phone} onChange={(e) => setBuyer({ ...buyer, phone: e.target.value })} /></div>
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
                            <RadioGroup value={shippingMethod} onValueChange={setShippingMethod} className="space-y-3">
                                {SHIPPING_METHODS.map((m) => {
                                    const fee = shippingFee(m.id, subtotal);
                                    return (
                                        <label key={m.id} className="flex items-center gap-4 p-4 border rounded-xl cursor-pointer hover:border-primary transition-colors">
                                            <RadioGroupItem value={m.id} />
                                            <i className={`fa-solid ${m.icon} text-primary w-5 text-center`} />
                                            <div className="flex-1">
                                                <p className="font-medium">{m.label}</p>
                                                <p className="text-xs text-muted-foreground">{m.delay}</p>
                                            </div>
                                            <span className={`font-medium ${fee === 0 ? "text-success" : ""}`}>{fee === 0 ? "Offerte" : formatPrice(fee)}</span>
                                        </label>
                                    );
                                })}
                            </RadioGroup>
                            <div className="flex gap-2 pt-2">
                                <Button type="button" variant="outline" onClick={() => setStep(1)} className="rounded-full h-11 px-6">Retour</Button>
                                <Button type="button" onClick={() => setStep(3)} className="bg-ink text-ink-foreground hover:bg-ink/90 rounded-full h-11 px-8">Continuer</Button>
                            </div>
                        </div>
                    )}

                    {step === 3 && pendingOrder && (
                        <div ref={paymentBox} className="space-y-5 bg-card p-6 md:p-8 rounded-2xl shadow-card scroll-mt-28">
                            <div className="flex items-baseline justify-between gap-4">
                                <h2 className="font-display text-2xl">Paiement sécurisé</h2>
                                <span className="font-display text-xl font-semibold">
                                    {formatMinor(pendingOrder.amount_minor, pendingOrder.payment_currency)}
                                </span>
                            </div>
                            <p className="text-xs text-muted-foreground">Commande {pendingOrder.id} · paiement traité par Paxity</p>
                            <PaxityWidget order={pendingOrder} orgId={paxity.org_id} {...paxityHandlers} />
                            <Button type="button" variant="outline" onClick={() => setPendingOrder(null)} className="rounded-full h-11 px-6">
                                Choisir un autre moyen de paiement
                            </Button>
                        </div>
                    )}

                    {step === 3 && !pendingOrder && (
                        <div className="space-y-5 bg-card p-6 md:p-8 rounded-2xl shadow-card">
                            <h2 className="font-display text-2xl">Paiement</h2>

                            <RadioGroup value={payment} onValueChange={setPaymentChoice} className="space-y-3">
                                {paymentOptions.map((o) => (
                                    <label key={o.id} className={`block p-4 border rounded-xl cursor-pointer transition-colors ${payment === o.id ? "border-primary bg-primary/5" : "hover:border-primary"}`}>
                                        <div className="flex items-center gap-4">
                                            <RadioGroupItem value={o.id} />
                                            <o.icon className="h-5 w-5 text-primary" />
                                            <div className="flex-1">
                                                <p className="font-medium">{o.label}</p>
                                                <p className="text-xs text-muted-foreground">{o.hint}</p>
                                            </div>
                                        </div>
                                        {o.id === "carte" && payment === "carte" && (
                                            <div className="mt-3 ml-9 flex flex-wrap items-center gap-2">
                                                {CARD_CURRENCIES.map((c) => (
                                                    <button
                                                        key={c.code}
                                                        type="button"
                                                        onClick={() => setCardCurrency(c.code)}
                                                        className={`h-8 px-3 rounded-full border text-xs font-medium ${cardCurrency === c.code ? "bg-ink text-ink-foreground border-ink" : "border-border hover:border-foreground"}`}
                                                    >
                                                        {c.label}
                                                    </button>
                                                ))}
                                                <span className="text-xs text-muted-foreground">
                                                    soit {formatMoney(total, cardCurrency, rates)} pour {formatPrice(total)}
                                                </span>
                                            </div>
                                        )}
                                    </label>
                                ))}
                            </RadioGroup>

                            <div className="p-4 rounded-xl border text-sm space-y-1">
                                <div className="flex items-center justify-between">
                                    <p className="font-medium flex items-center gap-2"><MapPin className="h-4 w-4 text-primary" /> Livraison à</p>
                                    <button type="button" onClick={() => setStep(1)} className="text-xs text-muted-foreground hover:text-foreground underline">Modifier</button>
                                </div>
                                <p>{buyer.firstName} {buyer.lastName}</p>
                                <p className="text-muted-foreground">
                                    {buyer.address}{buyer.zip ? `, ${buyer.zip}` : ""} {buyer.city} · {COUNTRIES.find((c) => c.code === buyer.country)?.label}
                                </p>
                                <p className="text-muted-foreground">{buyer.phone} · {buyer.email}</p>
                            </div>

                            {payment !== "livraison" && (
                                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                    <ShieldCheck className="h-4 w-4 text-success" />
                                    Paiement sécurisé par Paxity
                                </div>
                            )}

                            <div className="flex gap-2 pt-2">
                                <Button type="button" variant="outline" onClick={() => setStep(2)} className="rounded-full h-11 px-6">Retour</Button>
                                <Button
                                    type="button"
                                    onClick={handleSubmit}
                                    disabled={processing}
                                    className="bg-primary hover:bg-primary/90 text-primary-foreground rounded-full h-11 px-8 flex-1 sm:flex-none shadow-warm"
                                >
                                    {processing ? (
                                        <>
                                            <Loader2 className="h-4 w-4 animate-spin" />
                                            Enregistrement…
                                        </>
                                    ) : (
                                        submitLabel
                                    )}
                                </Button>
                            </div>
                        </div>
                    )}
                </div>

                <aside>
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
                        {step === 3 && payment === "carte" && (
                            <p className="text-xs text-muted-foreground text-right">Payé par carte : {formatMoney(total, cardCurrency, rates)}</p>
                        )}
                    </div>
                </aside>
            </div>
        </div>
    );
}
