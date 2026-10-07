import { Link } from "react-router-dom";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Minus, Plus, Trash2, ShoppingBag } from "lucide-react";
import { useCart } from "@/context/CartContext";
import { useCurrency } from "@/context/CurrencyContext";
import { estimateShipping } from "@/lib/shipping";

export const CartDrawer = () => {
    const { items, drawerOpen, setDrawerOpen, updateQty, removeItem, subtotal, count } = useCart();
    const { format: formatPrice } = useCurrency();
    const shipping = estimateShipping(subtotal);
    const total = subtotal + shipping;

    return (
        <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
            <SheetContent className="w-full sm:max-w-md p-0 flex flex-col">
                <SheetHeader className="px-6 pt-6 pb-4 border-b">
                    <SheetTitle className="font-display text-2xl">
                        Votre panier {count > 0 && <span className="text-muted-foreground text-base font-sans">· {count}</span>}
                    </SheetTitle>
                </SheetHeader>

                {items.length === 0 ? (
                    <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
                        <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center mb-4">
                            <ShoppingBag className="h-7 w-7 text-muted-foreground" />
                        </div>
                        <h3 className="font-display text-xl mb-2">Votre panier est vide</h3>
                        <p className="text-sm text-muted-foreground mb-6">Découvrez notre sélection et ajoutez vos coups de cœur.</p>
                        <Button onClick={() => setDrawerOpen(false)} asChild className="bg-ink text-ink-foreground hover:bg-ink/90 rounded-full">
                            <Link to="/boutique">Explorer la boutique</Link>
                        </Button>
                    </div>
                ) : (
                    <>
                        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
                            {items.map((item) => (
                                <div key={item.id} className="flex gap-3">
                                    <Link to={`/produit/${item.id}`} onClick={() => setDrawerOpen(false)} className="h-24 w-20 shrink-0 rounded-lg overflow-hidden bg-muted">
                                        <img src={item.image} alt={item.name} className="h-full w-full object-cover" />
                                    </Link>
                                    <div className="flex-1 flex flex-col">
                                        <div className="flex items-start justify-between gap-2">
                                            <h4 className="text-sm font-medium leading-snug line-clamp-2">{item.name}</h4>
                                            <button onClick={() => removeItem(item.id)} className="text-muted-foreground hover:text-destructive">
                                                <Trash2 className="h-4 w-4" />
                                            </button>
                                        </div>
                                        <div className="mt-auto flex items-center justify-between">
                                            <div className="inline-flex items-center border rounded-full">
                                                <button onClick={() => updateQty(item.id, item.qty - 1)} className="h-7 w-7 flex items-center justify-center text-muted-foreground hover:text-foreground">
                                                    <Minus className="h-3 w-3" />
                                                </button>
                                                <span className="w-7 text-center text-xs font-medium">{item.qty}</span>
                                                <button onClick={() => updateQty(item.id, item.qty + 1)} className="h-7 w-7 flex items-center justify-center text-muted-foreground hover:text-foreground">
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
                                <span>Sous-total</span>
                                <span>{formatPrice(subtotal)}</span>
                            </div>
                            <div className="flex justify-between text-sm text-muted-foreground">
                                <span>Livraison</span>
                                <span>{shipping === 0 ? <span className="text-success">Offerte</span> : formatPrice(shipping)}</span>
                            </div>
                            <Separator />
                            <div className="flex justify-between items-baseline">
                                <span className="font-medium">Total</span>
                                <span className="font-display text-2xl font-semibold">{formatPrice(total)}</span>
                            </div>
                            <Button asChild size="lg" className="w-full bg-ink text-ink-foreground hover:bg-ink/90 rounded-full h-12">
                                <Link to="/commande" onClick={() => setDrawerOpen(false)}>Passer commande</Link>
                            </Button>
                            <p className="text-[11px] text-center text-muted-foreground">
                                <i className="fa-solid fa-truck mr-1" /> Paiement à la livraison
                            </p>
                        </div>
                    </>
                )}
            </SheetContent>
        </Sheet>
    );
};
