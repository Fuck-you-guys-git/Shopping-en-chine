import { Separator } from "@/components/ui/separator";
import { t, unitAmount, fmtAmount, cartDisplayTotal } from "@/lib/locale";

// Récapitulatif du panier (colonne latérale du checkout)
export const CheckoutSummary = ({ items }) => (
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
);
