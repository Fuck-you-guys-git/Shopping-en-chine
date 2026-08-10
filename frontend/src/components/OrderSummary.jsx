import { useEffect, useState } from "react";
import { MapPin, Phone, Mail } from "lucide-react";
import { paxityAPI } from "@/lib/api";
import { formatPrice } from "@/components/ProductCard";
import { t } from "@/lib/locale";

/**
 * Récapitulatif complet d'une commande (articles + coordonnées de livraison).
 * Affiché sur les pages de confirmation Paxity et Stripe.
 */
export const OrderSummary = ({ orderId }) => {
    const [order, setOrder] = useState(null);

    useEffect(() => {
        if (!orderId) return;
        paxityAPI.getOrder(orderId).then(setOrder).catch(() => {});
    }, [orderId]);

    if (!order) return null;
    const c = order.customer || {};

    return (
        <div className="mt-8 text-left bg-card border border-border/60 rounded-2xl p-5 shadow-card max-w-md mx-auto" data-testid="order-summary-card">
            <p className="text-xs uppercase tracking-widest text-muted-foreground mb-3">Votre commande</p>
            <div className="space-y-2 mb-3" data-testid="order-summary-items">
                {(order.items || []).map((it, i) => (
                    <div key={i} className="flex items-baseline justify-between gap-3 text-sm">
                        <span className="min-w-0">
                            {it.name} <span className="text-muted-foreground whitespace-nowrap">× {it.qty || 1}</span>
                        </span>
                        <span className="font-medium whitespace-nowrap">{formatPrice((it.price || 0) * (it.qty || 1))}</span>
                    </div>
                ))}
            </div>
            <div className="flex justify-between items-baseline border-t border-border pt-3 mb-5">
                <span className="text-sm font-medium">{t("Total")}</span>
                <span className="font-display text-lg font-semibold">{formatPrice(order.amount || 0)}</span>
            </div>
            <p className="text-xs uppercase tracking-widest text-muted-foreground mb-2">{t("Livraison")}</p>
            <div className="text-sm space-y-1.5" data-testid="order-summary-customer">
                <p className="font-medium">{c.name || "—"}</p>
                {c.phone && (
                    <p className="flex items-center gap-2 text-muted-foreground">
                        <Phone className="h-3.5 w-3.5 shrink-0" /> {c.phone}
                    </p>
                )}
                {(c.address || c.city) && (
                    <p className="flex items-center gap-2 text-muted-foreground">
                        <MapPin className="h-3.5 w-3.5 shrink-0" /> {[c.address, c.city].filter(Boolean).join(", ")}
                    </p>
                )}
                {c.email && (
                    <p className="flex items-center gap-2 text-muted-foreground">
                        <Mail className="h-3.5 w-3.5 shrink-0" /> {c.email}
                    </p>
                )}
            </div>
        </div>
    );
};
