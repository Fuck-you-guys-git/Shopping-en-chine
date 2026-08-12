import { Link } from "react-router-dom";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Minus, Plus, Trash2, ShoppingBag } from "lucide-react";
import { useCart } from "@/context/CartContext";
import { formatPrice } from "@/components/ProductCard";
import { t, formatEquivalents } from "@/lib/locale";
import { useLocale } from "@/context/LocaleContext";

export const CartDrawer = () => {
    const { items, drawerOpen, setDrawerOpen, updateQty, removeItem, subtotal, count } = useCart();
    useLocale(); // re-render au changement de langue/devise
    const shipping = 0;
    const total = subtotal + shipping;

    return (
        <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
            <SheetContent className="w-full sm:max-w-md p-0 flex flex-col">
                <SheetHeader className="px-6 pt-6 pb-4 border-b">
                    <SheetTitle className="font-display text-2xl">
                        {t("Votre panier")} {count > 0 && <span className="text-muted-foreground text-base font-sans">· {count}</span>}
                    </SheetTitle>
                </SheetHeader>

                {items.length === 0 ? (
                    <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
                        <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center mb-4">
                            <ShoppingBag className="h-7 w-7 text-muted-foreground" />
                        </div>
                        <h3 className="font-display text-xl mb-2">{t("Votre panier est vide")}</h3>
                        <p className="text-sm text-muted-foreground mb-6">{t("Découvrez notre sélection et ajoutez vos coups de cœur.")}</p>
                        <Button onClick={() => setDrawerOpen(false)} asChild className="bg-ink text-ink-foreground hover:bg-ink/90 rounded-full">
                            <Link to="/boutique">{t("Explorer la boutique")}</Link>
                        </Button>
                    </div>
                ) : (
                    <>
                        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
                            {items.map((item) => (
                                <div key={item.line} className="flex gap-3">
                                    <Link to={`/produit/${item.id}`} onClick={() => setDrawerOpen(false)} className="h-24 w-20 shrink-0 rounded-lg overflow-hidden bg-muted">
                                        <img src={item.image} alt={item.name} className="h-full w-full object-cover" />
                                    </Link>
                                    <div className="flex-1 flex flex-col">
                                        <div className="flex items-start justify-between gap-2">
                                            <div>
                                                <h4 className="text-sm font-medium leading-snug line-clamp-2">{item.name}</h4>
                                                {item.size && <p className="text-xs text-muted-foreground mt-0.5">{t("Taille")} {item.size}</p>}
                                            </div>
                                            <button onClick={() => removeItem(item.line)} className="text-muted-foreground hover:text-destructive">
                                                <Trash2 className="h-4 w-4" />
                                            </button>
                                        </div>
                                        <div className="mt-auto flex items-center justify-between">
                                            <div className="inline-flex items-center border rounded-full">
                                                <button onClick={() => updateQty(item.line, item.qty - 1)} className="h-7 w-7 flex items-center justify-center text-muted-foreground hover:text-foreground">
                                                    <Minus className="h-3 w-3" />
                                                </button>
                                                <span className="w-7 text-center text-xs font-medium">{item.qty}</span>
                                                <button onClick={() => updateQty(item.line, item.qty + 1)} className="h-7 w-7 flex items-center justify-center text-muted-foreground hover:text-foreground">
                                                    <Plus className="h-3 w-3" />
                                                </button>
                                            </div>
                                            <span className="font-display font-semibold">{formatPrice(item.price * item.qty)}</span>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>

                        <div className="border-t px-6 py-5 space-y-3 bg-muted/30">
                            <div className="flex justify-between text-sm text-muted-foreground">
                                <span>{t("Sous-total")}</span>
                                <span>{formatPrice(subtotal)}</span>
                            </div>
                            <div className="flex justify-between text-sm text-muted-foreground">
                                <span>{t("Livraison Chine → Monde entier")}</span>
                                <span>{t("10–20 jours")}</span>
                            </div>
                            <Separator />
                            <div className="flex justify-between items-baseline">
                                <span className="font-medium">{t("Total")}</span>
                                <span className="font-display text-2xl font-semibold">{formatPrice(total)}</span>
                            </div>
                            {formatEquivalents(total) && (
                                <p className="text-[11px] text-muted-foreground text-right -mt-2">{formatEquivalents(total)}</p>
                            )}
                            <Button asChild size="lg" className="w-full bg-ink text-ink-foreground hover:bg-ink/90 rounded-full h-12">
                                <Link to="/commande" onClick={() => setDrawerOpen(false)}>{t("Passer commande")}</Link>
                            </Button>
                            <p className="text-[11px] text-center text-muted-foreground">
                                <i className="fa-solid fa-lock mr-1" /> {t("Paiement 100% sécurisé")}
                            </p>
                        </div>
                    </>
                )}
            </SheetContent>
        </Sheet>
    );
};
