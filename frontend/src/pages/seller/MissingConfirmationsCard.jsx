import { useCallback, useEffect, useState } from "react";
import { MailWarning, Loader2, Send } from "lucide-react";
import { toast } from "sonner";
import { ordersAPI } from "@/lib/api";
import { formatPaid } from "@/lib/locale";

const fmtDate = (raw) => {
    const d = new Date(raw);
    return Number.isNaN(d.getTime())
        ? ""
        : d.toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "2-digit" });
};

/**
 * Alerte « confirmations manquantes » : liste les clients qui ont payé mais
 * n'ont jamais reçu leur email de confirmation, et permet de les renvoyer
 * (client + notification marchand). La carte disparaît quand tout est à jour.
 */
export const MissingConfirmationsCard = () => {
    const [orders, setOrders] = useState([]);
    const [loading, setLoading] = useState(true);
    const [sending, setSending] = useState(false);

    const load = useCallback(async () => {
        try {
            const r = await ordersAPI.missingConfirmations();
            setOrders(r.orders || []);
        } catch {
            setOrders([]);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    const send = async () => {
        setSending(true);
        try {
            const r = await ordersAPI.resendConfirmations();
            toast.success(
                `${r.customer_sent} confirmation${r.customer_sent > 1 ? "s" : ""} client envoyée${r.customer_sent > 1 ? "s" : ""}`,
                { description: `${r.merchant_sent} notification${r.merchant_sent > 1 ? "s" : ""} reçue${r.merchant_sent > 1 ? "s" : ""} sur votre boîte marchande.` },
            );
            if (r.customer_failed > 0) {
                toast.warning(
                    `${r.customer_failed} client${r.customer_failed > 1 ? "s" : ""} non joignable${r.customer_failed > 1 ? "s" : ""}`,
                    { description: "Adresse email invalide ou refusée. Contactez-les par téléphone." },
                );
            }
            await load();
        } catch {
            toast.error("Envoi impossible", { description: "Réessayez dans un instant." });
        } finally {
            setSending(false);
        }
    };

    if (loading || orders.length === 0) return null;

    return (
        <div
            className="rounded-2xl border border-amber-300/70 bg-amber-50 p-5 md:p-6"
            data-testid="missing-confirmations-card"
        >
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex gap-3">
                    <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-700">
                        <MailWarning className="h-4 w-4" />
                    </span>
                    <div>
                        <h3 className="font-display text-lg font-medium text-amber-900">
                            {orders.length} commande{orders.length > 1 ? "s" : ""} payée{orders.length > 1 ? "s" : ""} sans email de confirmation
                        </h3>
                        <p className="mt-0.5 text-xs text-amber-800/80">
                            Ces clients ont payé mais n&apos;ont jamais reçu leur confirmation. Un clic
                            leur envoie l&apos;email et vous envoie la notification marchande.
                        </p>
                    </div>
                </div>
                <button
                    type="button"
                    onClick={send}
                    disabled={sending}
                    data-testid="resend-confirmations-btn"
                    className="inline-flex h-10 shrink-0 items-center gap-2 rounded-full bg-amber-600 px-5 text-sm font-semibold text-white transition-colors hover:bg-amber-700 disabled:opacity-60"
                >
                    {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    Envoyer les confirmations
                </button>
            </div>

            <ul className="mt-4 divide-y divide-amber-200/70 rounded-xl bg-white/70" data-testid="missing-confirmations-list">
                {orders.slice(0, 20).map((o) => (
                    <li key={o.id} className="flex items-center gap-3 px-4 py-2.5">
                        <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium">{o.name || "Client"}</span>
                            <span className="block truncate text-xs text-muted-foreground">
                                {o.email || "email manquant"} · {o.id} · {fmtDate(o.created_at)}
                            </span>
                        </span>
                        <span className="shrink-0 whitespace-nowrap text-sm font-medium">
                            {formatPaid(o.amount, o.currency)}
                        </span>
                    </li>
                ))}
                {orders.length > 20 && (
                    <li className="px-4 py-2 text-xs text-muted-foreground">
                        + {orders.length - 20} autre{orders.length - 20 > 1 ? "s" : ""}
                    </li>
                )}
            </ul>
        </div>
    );
};
