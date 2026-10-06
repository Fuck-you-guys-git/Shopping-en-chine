import { useState } from "react";
import { ChevronDown, Download, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { useSeller } from "@/context/SellerContext";
import { ordersAPI, paxityAPI } from "@/lib/api";
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
    const { metrics, refreshOrders } = useSeller();
    const dist = metrics.paymentDist || [];
    const [open, setOpen] = useState(null);
    const [downloading, setDownloading] = useState(false);
    const [checking, setChecking] = useState(false);

    const checkPending = async () => {
        setChecking(true);
        try {
            const r = await paxityAPI.reconcile();
            if (r.confirmed > 0) {
                toast.success(
                    `${r.confirmed} paiement${r.confirmed > 1 ? "s" : ""} confirmé${r.confirmed > 1 ? "s" : ""}`,
                    { description: "Les emails de confirmation viennent de partir." },
                );
                await refreshOrders();
            } else {
                toast.success("Aucun paiement en attente à confirmer", {
                    description: `${r.checked} transaction${r.checked > 1 ? "s" : ""} vérifiée${r.checked > 1 ? "s" : ""} auprès de Paxity.`,
                });
            }
        } catch {
            toast.error("Vérification impossible", { description: "Réessayez dans un instant." });
        } finally {
            setChecking(false);
        }
    };

    const grandTotal = dist.reduce((s, g) => s + g.total, 0);
    const grandCount = dist.reduce((s, g) => s + g.count, 0);

    const download = async () => {
        setDownloading(true);
        try {
            const res = await ordersAPI.exportCsv();
            const name =
                /filename="?([^"]+)"?/.exec(res.headers?.["content-disposition"] || "")?.[1] ||
                "commandes-paxity.csv";
            const url = URL.createObjectURL(res.data);
            const a = document.createElement("a");
            a.href = url;
            a.download = name;
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(url);
            toast.success("Fichier téléchargé", { description: name });
        } catch {
            toast.error("Téléchargement impossible", { description: "Réessayez dans un instant." });
        } finally {
            setDownloading(false);
        }
    };

    return (
        <div
            className="bg-card rounded-2xl shadow-card border border-border/50"
            data-testid="payment-methods-card"
        >
            <div className="p-5 md:p-6 pb-4 flex flex-wrap items-start justify-between gap-3">
                <div>
                    <h3 className="font-display text-lg font-medium">Paiements par moyen</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">
                        Qui a payé par carte, Wave, Orange Money ou MTN — et combien au total
                    </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <button
                        type="button"
                        onClick={checkPending}
                        disabled={checking}
                        data-testid="reconcile-payments-btn"
                        className="inline-flex h-10 shrink-0 items-center gap-2 rounded-full border-2 border-border bg-card px-4 text-sm font-semibold transition-colors hover:border-primary hover:text-primary disabled:opacity-60"
                    >
                        <RefreshCw className={`h-4 w-4 ${checking ? "animate-spin" : ""}`} />
                        Vérifier les paiements en attente
                    </button>
                    <button
                        type="button"
                        onClick={download}
                        disabled={downloading}
                        data-testid="export-orders-csv-btn"
                        className="inline-flex h-10 shrink-0 items-center gap-2 rounded-full border-2 border-border bg-card px-4 text-sm font-semibold transition-colors hover:border-primary hover:text-primary disabled:opacity-60"
                    >
                        {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                        Télécharger le fichier
                    </button>
                </div>
            </div>
            <p className="px-5 md:px-6 -mt-2 pb-4 text-[11px] text-muted-foreground">
                Le fichier (Excel/CSV) liste toutes les commandes payées (Wave, Orange Money) avec leurs totaux.
            </p>

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
