import { Link } from "react-router-dom";
import { ArrowLeft, Minus, Plus, Trash2, ShoppingBag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { useState } from "react";
import { useCart } from "@/context/CartContext";
import { formatPrice } from "@/components/ProductCard";
import { toast } from "sonner";
import { t, formatEquivalents } from "@/lib/locale";

export default function Cart() {
    const { items, updateQty, removeItem, subtotal, clear } = useCart();
    const [promo, setPromo] = useState("");
    const [discount, setDiscount] = useState(0);
    const shipping = 0;
    const total = Math.max(0, subtotal + shipping - discount);

    const applyPromo = (e) => {
        e.preventDefault();
        if (promo.trim().toUpperCase() === "BIENVENUE10") {
            setDiscount(subtotal * 0.1);
            toast.success(t("Code appliqué · −10%"));
        } else if (promo.trim()) {
            toast.error(t("Code invalide"), { description: `${t("Essayez")} BIENVENUE10` });
        }
    };

    if (items.length === 0) {
        return (
            <div className="container mx-auto px-5 py-24 text-center">
                <div className="max-w-md mx-auto">
                    <div className="h-20 w-20 mx-auto rounded-full bg-muted flex items-center justify-center mb-6">
                        <ShoppingBag className="h-9 w-9 text-muted-foreground" />
                    </div>
                    <h1 className="font-display text-4xl mb-3">{t("Votre panier est vide")}</h1>
                    <p className="text-muted-foreground mb-8">{t("Rien encore ? Laissez-vous inspirer par nos coups de cœur.")}</p>
                    <Button asChild size="lg" className="bg-ink text-ink-foreground hover:bg-ink/90 rounded-full h-12 px-7">
                        <Link to="/boutique">{t("Explorer la boutique")}</Link>
                    </Button>
                </div>
            </div>
        );
    }

    return (
        <div className="container mx-auto px-5 py-10 md:py-14">
            <Link to="/boutique" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-6">
                <ArrowLeft className="h-4 w-4" /> {t("Continuer mes achats")}
            </Link>
            <h1 className="font-display text-4xl sm:text-5xl font-medium tracking-tight mb-2">{t("Mon panier")}</h1>
            <p className="text-muted-foreground mb-10">{items.length} {items.length > 1 ? t("articles") : t("article")} · {t("prêts à partir chez vous")}</p>

            <div className="grid lg:grid-cols-[1fr_380px] gap-10">
                <div className="space-y-4">
                    {items.map((item) => (
                        <div key={item.line} className="flex gap-4 p-4 md:p-6 rounded-2xl bg-card shadow-card">
                            <Link to={`/produit/${item.id}`} className="h-28 w-24 md:h-32 md:w-28 shrink-0 rounded-xl overflow-hidden bg-muted">
                                <img src={item.image} alt={item.name} className="h-full w-full object-cover" />
                            </Link>
                            <div className="flex-1 flex flex-col">
                                <div className="flex items-start justify-between gap-3">
                                    <div>
                                        <Link to={`/produit/${item.id}`} className="font-display text-lg font-medium leading-snug hover:text-primary transition-colors">
                                            {item.name}
                                        </Link>
                                        <p className="text-xs text-muted-foreground mt-1">{item.size ? `${t("Taille")} ${item.size} · ` : ""}{t("En stock")}</p>
                                    </div>
                                    <button onClick={() => removeItem(item.line)} className="text-muted-foreground hover:text-destructive shrink-0">
                                        <Trash2 className="h-4 w-4" />
                                    </button>
                                </div>
                                <div className="mt-auto flex items-center justify-between pt-3">
                                    <div className="inline-flex items-center border rounded-full">
                                        <button onClick={() => updateQty(item.line, item.qty - 1)} className="h-8 w-8 flex items-center justify-center">
                                            <Minus className="h-3.5 w-3.5" />
                                        </button>
                                        <span className="w-9 text-center text-sm font-medium">{item.qty}</span>
                                        <button onClick={() => updateQty(item.line, item.qty + 1)} className="h-8 w-8 flex items-center justify-center">
                                            <Plus className="h-3.5 w-3.5" />
                                        </button>
                                    </div>
                                    <span className="font-display text-xl font-semibold">{formatPrice(item.price * item.qty)}</span>
                                </div>
                            </div>
                        </div>
                    ))}
                    <button onClick={clear} className="text-xs text-muted-foreground hover:text-destructive">{t("Vider le panier")}</button>
                </div>

                <aside>
                    <div className="sticky top-24 bg-secondary/40 rounded-2xl p-6 md:p-7 space-y-5">
                        <h2 className="font-display text-2xl">{t("Récapitulatif")}</h2>

                        <form onSubmit={applyPromo} className="flex gap-2">
                            <Input value={promo} onChange={(e) => setPromo(e.target.value)} placeholder={t("Code promo")} className="bg-background" />
                            <Button type="submit" variant="outline" className="rounded-md">{t("Appliquer")}</Button>
                        </form>
                        <p className="text-[11px] text-muted-foreground -mt-2">💡 {t("Essayez")} <span className="font-mono text-foreground">BIENVENUE10</span></p>

                        <Separator />

                        <div className="space-y-2 text-sm">
                            <div className="flex justify-between">
                                <span className="text-muted-foreground">{t("Sous-total")}</span>
                                <span>{formatPrice(subtotal)}</span>
                            </div>
                            {discount > 0 && (
                                <div className="flex justify-between text-success">
                                    <span>{t("Réduction (−10%)")}</span>
                                    <span>−{formatPrice(discount)}</span>
                                </div>
                            )}
                            <div className="flex justify-between">
                                <span className="text-muted-foreground">{t("Livraison Chine → Dakar")}</span>
                                <span className="text-muted-foreground">{t("10–20 jours")}</span>
                            </div>
                        </div>
                        <Separator />
                        <div className="flex justify-between items-baseline">
                            <span className="font-medium">{t("Total TTC")}</span>
                            <span className="font-display text-3xl font-semibold">{formatPrice(total)}</span>
                        </div>
                        {formatEquivalents(total) && (
                            <p className="text-[11px] text-muted-foreground text-right -mt-3">{formatEquivalents(total)}</p>
                        )}
                        <Button asChild size="lg" className="w-full bg-ink text-ink-foreground hover:bg-ink/90 rounded-full h-12">
                            <Link to="/commande">{t("Passer commande")}</Link>
                        </Button>
                        <div className="flex items-center justify-center gap-4 text-muted-foreground opacity-70">
                            <i className="fa-brands fa-cc-visa text-2xl" />
                            <i className="fa-brands fa-cc-mastercard text-2xl" />
                            <i className="fa-brands fa-cc-paypal text-2xl" />
                            <i className="fa-brands fa-cc-apple-pay text-2xl" />
                        </div>
                    </div>
                </aside>
            </div>
        </div>
    );
}
