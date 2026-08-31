import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { useSeller } from "@/context/SellerContext";
import { formatCfa } from "@/lib/locale";
import { PAYMENT_CODE_LABELS } from "@/lib/payments";

const fmtDate = (ts) =>
    new Date(ts).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "2-digit" });

/**
 * « Paiements par moyen » : nombre de clients et total encaissé par carte
 * bancaire / Wave / Orange Money / MTN, avec la liste des clients dépliable.
 * 100 % dérivé des commandes PAYÉES réelles — aucune donnée inventée.
 */
export const PaymentMethodsCard = () => {
    const { metrics } = useSeller();
    const dist = metrics.paymentDist || [];
    const [open, setOpen] = useState(null);

    const grandTotal = dist.reduce((s, g) => s + g.total, 0);
    const grandCount = dist.reduce((s, g) => s + g.count, 0);

    return (
        <div
            className="bg-card rounded-2xl shadow-card border border-border/50"
            data-testid="payment-methods-card"
        >
            <div className="p-5 md:p-6 pb-4">
                <h3 className="font-display text-lg font-medium">Paiements par moyen</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                    Qui a payé par carte, Wave, Orange Money ou MTN — et combien au total
                </p>
            </div>

            {dist.length === 0 ? (
                <p className="px-5 md:px-6 pb-8 text-sm text-muted-foreground text-center">
                    Aucun paiement enregistré pour le moment
                </p>
            ) : (
                <>
                    <div className="divide-y divide-border border-t border-border">
                        {dist.map((g) => {
                            const isOpen = open === g.id;
                            const share = grandTotal > 0 ? Math.round((g.total / grandTotal) * 100) : 0;
                            return (
                                <div key={g.id} data-testid={`payment-group-${g.id}`}>
                                    <button
                                        type="button"
                                        onClick={() => setOpen(isOpen ? null : g.id)}
                                        data-testid={`payment-group-toggle-${g.id}`}
                                        aria-expanded={isOpen}
                                        className="flex w-full items-center gap-3 px-5 md:px-6 py-3.5 text-left transition-colors hover:bg-muted/50"
                                    >
                                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                                            <i className={`fa-solid ${g.icon} text-sm`} aria-hidden="true" />
                                        </span>
                                        <span className="min-w-0 flex-1">
                                            <span className="block truncate text-sm font-medium">{g.label}</span>
                                            <span className="block text-xs text-muted-foreground">
                                                {g.count} {g.count > 1 ? "clients" : "client"} · {share}% du total
                                            </span>
                                        </span>
                                        <span className="shrink-0 whitespace-nowrap font-display text-sm font-semibold" data-testid={`payment-group-total-${g.id}`}>
                                            {formatCfa(g.total)}
                                        </span>
                                        <ChevronDown
                                            className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
                                        />
                                    </button>

                                    {isOpen && (
                                        <ul
                                            className="divide-y divide-border/60 bg-muted/30"
                                            data-testid={`payment-group-list-${g.id}`}
                                        >
                                            {g.orders.map((o) => (
                                                <li key={o.id} className="flex items-center gap-3 px-5 md:px-6 py-2.5 pl-[68px] md:pl-[76px]">
                                                    <span className="min-w-0 flex-1">
                                                        <span className="block truncate text-sm">{o.customer}</span>
                                                        <span className="block truncate text-xs text-muted-foreground">
                                                            {o.id} · {fmtDate(o.createdAt)}
                                                            {o.paymentMethod && PAYMENT_CODE_LABELS[o.paymentMethod?.toUpperCase()]
                                                                ? ` · ${PAYMENT_CODE_LABELS[o.paymentMethod.toUpperCase()]}`
                                                                : ""}
                                                        </span>
                                                    </span>
                                                    <span className="shrink-0 whitespace-nowrap text-sm font-medium">
                                                        {formatCfa(o.total)}
                                                    </span>
                                                </li>
                                            ))}
                                        </ul>
                                    )}
                                </div>
                            );
                        })}
                    </div>

                    <div className="flex items-center justify-between gap-3 px-5 md:px-6 py-4 border-t border-border">
                        <span className="text-sm font-medium">
                            Total encaissé
                            <span className="ml-2 text-xs font-normal text-muted-foreground">
                                {grandCount} {grandCount > 1 ? "paiements" : "paiement"}
                            </span>
                        </span>
                        <span className="font-display text-lg font-semibold" data-testid="payment-grand-total">
                            {formatCfa(grandTotal)}
                        </span>
                    </div>
                </>
            )}
        </div>
    );
};
