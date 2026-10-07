import { useState } from "react";
import { Link } from "react-router-dom";
import { Check, Truck, ShieldCheck, ArrowLeft, Loader2, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useCart } from "@/context/CartContext";
import { formatPrice } from "@/components/ProductCard";
import { toast } from "sonner";
import { ordersAPI } from "@/lib/api";

export default function Checkout() {
    const { items, subtotal, clear } = useCart();
    const [step, setStep] = useState(1);
    const shipping = subtotal > 30000 || subtotal === 0 ? 0 : 3000;
    const total = subtotal + shipping;

    const [buyer, setBuyer] = useState({
        firstName: "", lastName: "", email: "",
        phone: "", address: "", zip: "", city: "",
    });

    const [processing, setProcessing] = useState(false);
    const [order, setOrder] = useState(null); // order returned by the backend once confirmed

    const buyerValid = () =>
        buyer.firstName && buyer.lastName && buyer.email && buyer.phone && buyer.address && buyer.city;

    const handleConfirm = async () => {
        setProcessing(true);
        try {
            const res = await ordersAPI.create({
                customer: {
                    first_name: buyer.firstName,
                    last_name: buyer.lastName,
                    email: buyer.email,
                    phone: buyer.phone,
                    address: buyer.address,
                    zip: buyer.zip,
                    city: buyer.city,
                },
                items: items.map((it) => ({
                    product_id: it.id,
                    name: it.name,
                    price: it.price,
                    qty: it.qty,
                })),
                shipping,
            });
            setOrder(res);
            clear();
            toast.success("Commande confirmée ✦", { description: `Commande ${res.id}` });
        } catch (err) {
            const detail = err.response?.data?.detail;
            toast.error("Impossible d'enregistrer la commande", {
                description: typeof detail === "string"
                    ? detail
                    : "Vérifiez que le serveur est démarré, puis réessayez.",
            });
        } finally {
            setProcessing(false);
        }
    };

    // ---------- Success screen ----------
    if (order) {
        return (
            <div className="container mx-auto px-5 py-24 text-center">
                <div className="max-w-lg mx-auto">
                    <div className="h-20 w-20 mx-auto rounded-full bg-success/10 text-success flex items-center justify-center mb-6">
                        <Check className="h-10 w-10" />
                    </div>
                    <h1 className="font-display text-4xl sm:text-5xl mb-3">Commande confirmée !</h1>
                    <p className="text-muted-foreground mb-2">
                        Merci ! Votre commande de <span className="font-semibold text-foreground">{formatPrice(order.total)}</span> est confirmée.
                        Vous réglerez à la livraison.
                    </p>
                    <p className="text-xs font-mono text-muted-foreground mb-8">Commande {order.id}</p>
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
        { n: 3, label: "Confirmation" },
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
                                        <p className="font-medium">Livraison standard</p>
                                        <p className="text-xs text-muted-foreground">2–4 jours ouvrés</p>
                                    </div>
                                    <span className="font-medium text-success">Offerte</span>
                                </label>
                                <label className="flex items-center gap-4 p-4 border rounded-xl cursor-pointer hover:border-primary transition-colors">
                                    <RadioGroupItem value="exp" />
                                    <i className="fa-solid fa-bolt text-primary" />
                                    <div className="flex-1">
                                        <p className="font-medium">Livraison express</p>
                                        <p className="text-xs text-muted-foreground">24–48h chrono</p>
                                    </div>
                                    <span className="font-medium">5 000 F</span>
                                </label>
                                <label className="flex items-center gap-4 p-4 border rounded-xl cursor-pointer hover:border-primary transition-colors">
                                    <RadioGroupItem value="pickup" />
                                    <i className="fa-solid fa-store text-primary" />
                                    <div className="flex-1">
                                        <p className="font-medium">Point relais</p>
                                        <p className="text-xs text-muted-foreground">3–5 jours · 500+ points</p>
                                    </div>
                                    <span className="font-medium">2 000 F</span>
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
                            <h2 className="font-display text-2xl">Confirmation</h2>

                            <div className="flex gap-3 p-4 rounded-xl bg-primary/5 border border-primary/20 text-sm">
                                <ShieldCheck className="h-5 w-5 shrink-0 text-primary mt-0.5" />
                                <div>
                                    <p className="font-medium">Paiement à la livraison</p>
                                    <p className="text-xs text-muted-foreground mt-1">
                                        Aucun paiement en ligne : vous réglez {formatPrice(total)} à la réception de votre colis.
                                    </p>
                                </div>
                            </div>

                            <div className="p-4 rounded-xl border text-sm space-y-1">
                                <div className="flex items-center justify-between">
                                    <p className="font-medium flex items-center gap-2"><MapPin className="h-4 w-4 text-primary" /> Livraison à</p>
                                    <button type="button" onClick={() => setStep(1)} className="text-xs text-muted-foreground hover:text-foreground underline">Modifier</button>
                                </div>
                                <p>{buyer.firstName} {buyer.lastName}</p>
                                <p className="text-muted-foreground">{buyer.address}{buyer.zip ? `, ${buyer.zip}` : ""} {buyer.city}</p>
                                <p className="text-muted-foreground">{buyer.phone} · {buyer.email}</p>
                            </div>

                            <div className="flex gap-2 pt-2">
                                <Button type="button" variant="outline" onClick={() => setStep(2)} className="rounded-full h-11 px-6">Retour</Button>
                                <Button
                                    type="button"
                                    onClick={handleConfirm}
                                    disabled={processing}
                                    className="bg-primary hover:bg-primary/90 text-primary-foreground rounded-full h-11 px-8 flex-1 sm:flex-none shadow-warm"
                                >
                                    {processing ? (
                                        <>
                                            <Loader2 className="h-4 w-4 animate-spin" />
                                            Enregistrement…
                                        </>
                                    ) : (
                                        <>Confirmer la commande · {formatPrice(total)}</>
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
                    </div>
                </aside>
            </div>
        </div>
    );
}
