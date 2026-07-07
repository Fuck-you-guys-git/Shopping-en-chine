import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Check, CreditCard, Truck, ShieldCheck, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useCart } from "@/context/CartContext";
import { formatPrice } from "@/components/ProductCard";
import { toast } from "sonner";

export default function Checkout() {
    const { items, subtotal, clear } = useCart();
    const navigate = useNavigate();
    const [step, setStep] = useState(1);
    const [payment, setPayment] = useState("card");
    const shipping = subtotal > 49 || subtotal === 0 ? 0 : 4.9;
    const total = subtotal + shipping;
    const [complete, setComplete] = useState(false);

    const handleConfirm = (e) => {
        e.preventDefault();
        setComplete(true);
        clear();
        toast.success("Commande confirmée ✦", {
            description: "Vous recevrez un email de confirmation.",
        });
        setTimeout(() => navigate("/"), 4000);
    };

    if (complete) {
        return (
            <div className="container mx-auto px-5 py-24 text-center">
                <div className="max-w-lg mx-auto">
                    <div className="h-20 w-20 mx-auto rounded-full bg-success/10 text-success flex items-center justify-center mb-6">
                        <Check className="h-10 w-10" />
                    </div>
                    <h1 className="font-display text-4xl sm:text-5xl mb-3">Merci !</h1>
                    <p className="text-muted-foreground mb-8">
                        Votre commande est confirmée. Un email de confirmation vous a été envoyé. Vous serez redirigé dans quelques secondes.
                    </p>
                    <Button asChild size="lg" className="rounded-full bg-ink text-ink-foreground hover:bg-ink/90">
                        <Link to="/">Retour à l'accueil</Link>
                    </Button>
                </div>
            </div>
        );
    }

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

            <form onSubmit={handleConfirm} className="grid lg:grid-cols-[1fr_380px] gap-10">
                <div className="space-y-8">
                    {step === 1 && (
                        <div className="space-y-5 bg-card p-6 md:p-8 rounded-2xl shadow-card">
                            <h2 className="font-display text-2xl">Adresse de livraison</h2>
                            <div className="grid sm:grid-cols-2 gap-4">
                                <div className="space-y-1.5"><Label>Prénom</Label><Input required placeholder="Marie" /></div>
                                <div className="space-y-1.5"><Label>Nom</Label><Input required placeholder="Dupont" /></div>
                                <div className="space-y-1.5 sm:col-span-2"><Label>Email</Label><Input required type="email" placeholder="marie@exemple.fr" /></div>
                                <div className="space-y-1.5 sm:col-span-2"><Label>Adresse</Label><Input required placeholder="12 rue de la Paix" /></div>
                                <div className="space-y-1.5"><Label>Code postal</Label><Input required placeholder="75002" /></div>
                                <div className="space-y-1.5"><Label>Ville</Label><Input required placeholder="Paris" /></div>
                                <div className="space-y-1.5 sm:col-span-2"><Label>Téléphone</Label><Input required type="tel" placeholder="06 12 34 56 78" /></div>
                            </div>
                            <Button type="button" onClick={() => setStep(2)} className="w-full sm:w-auto bg-ink text-ink-foreground hover:bg-ink/90 rounded-full h-11 px-8">
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
                                    <span className="font-medium">7,90 €</span>
                                </label>
                                <label className="flex items-center gap-4 p-4 border rounded-xl cursor-pointer hover:border-primary transition-colors">
                                    <RadioGroupItem value="pickup" />
                                    <i className="fa-solid fa-store text-primary" />
                                    <div className="flex-1">
                                        <p className="font-medium">Point relais</p>
                                        <p className="text-xs text-muted-foreground">3–5 jours · 500+ points en France</p>
                                    </div>
                                    <span className="font-medium">2,90 €</span>
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
                            <h2 className="font-display text-2xl">Paiement</h2>
                            <RadioGroup value={payment} onValueChange={setPayment} className="grid sm:grid-cols-3 gap-3">
                                <label className={`flex flex-col items-center gap-2 p-4 border-2 rounded-xl cursor-pointer transition-colors ${payment === "card" ? "border-primary bg-primary/5" : "border-border"}`}>
                                    <RadioGroupItem value="card" className="sr-only" />
                                    <CreditCard className="h-6 w-6" />
                                    <span className="text-sm font-medium">Carte</span>
                                </label>
                                <label className={`flex flex-col items-center gap-2 p-4 border-2 rounded-xl cursor-pointer transition-colors ${payment === "paypal" ? "border-primary bg-primary/5" : "border-border"}`}>
                                    <RadioGroupItem value="paypal" className="sr-only" />
                                    <i className="fa-brands fa-paypal text-2xl" />
                                    <span className="text-sm font-medium">PayPal</span>
                                </label>
                                <label className={`flex flex-col items-center gap-2 p-4 border-2 rounded-xl cursor-pointer transition-colors ${payment === "apple" ? "border-primary bg-primary/5" : "border-border"}`}>
                                    <RadioGroupItem value="apple" className="sr-only" />
                                    <i className="fa-brands fa-apple-pay text-2xl" />
                                    <span className="text-sm font-medium">Apple Pay</span>
                                </label>
                            </RadioGroup>

                            {payment === "card" && (
                                <div className="space-y-4 pt-2">
                                    <div className="space-y-1.5"><Label>Numéro de carte</Label><Input required placeholder="1234 5678 9012 3456" /></div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-1.5"><Label>Expiration</Label><Input required placeholder="MM / AA" /></div>
                                        <div className="space-y-1.5"><Label>CVC</Label><Input required placeholder="123" /></div>
                                    </div>
                                    <div className="space-y-1.5"><Label>Nom sur la carte</Label><Input required placeholder="Marie Dupont" /></div>
                                </div>
                            )}

                            <div className="flex items-center gap-2 text-xs text-muted-foreground pt-2">
                                <ShieldCheck className="h-4 w-4 text-success" />
                                Paiement sécurisé SSL · 3D Secure
                            </div>

                            <div className="flex gap-2 pt-2">
                                <Button type="button" variant="outline" onClick={() => setStep(2)} className="rounded-full h-11 px-6">Retour</Button>
                                <Button type="submit" className="bg-primary hover:bg-primary/90 text-primary-foreground rounded-full h-11 px-8 flex-1 sm:flex-none shadow-warm">
                                    Confirmer et payer {formatPrice(total)}
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
            </form>
        </div>
    );
}
