import { useEffect, useState } from "react";
import { Mail, RefreshCw, AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { emailsAPI } from "@/lib/api";

// Statut de livraison → apparence du badge
const STATUS_META = {
    sent: { label: "Envoyé", cls: "bg-blue-500/10 text-blue-700 border-blue-200" },
    delivered: { label: "Délivré ✓", cls: "bg-emerald-500/10 text-emerald-700 border-emerald-200" },
    opened: { label: "Ouvert ✓✓", cls: "bg-emerald-500/15 text-emerald-800 border-emerald-300" },
    clicked: { label: "Cliqué", cls: "bg-emerald-500/15 text-emerald-800 border-emerald-300" },
    delivery_delayed: { label: "Retardé", cls: "bg-amber-500/10 text-amber-700 border-amber-200" },
    bounced: { label: "Rejeté ✗", cls: "bg-destructive/10 text-destructive border-destructive/30" },
    complained: { label: "Marqué spam", cls: "bg-destructive/10 text-destructive border-destructive/30" },
    send_failed: { label: "Échec d'envoi", cls: "bg-destructive/10 text-destructive border-destructive/30" },
};

const TAG_LABELS = {
    merchant: "Notification marchand",
    "customer-confirm": "Confirmation client",
    tracking: "Suivi de colis",
    recovery: "Relance panier",
    unknown: "—",
};

const fmtDate = (iso) => {
    try {
        return new Date(iso).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
    } catch {
        return iso;
    }
};

export default function Emails() {
    const [emails, setEmails] = useState(null);
    const [loading, setLoading] = useState(false);

    const load = () => {
        setLoading(true);
        emailsAPI.log()
            .then((data) => setEmails(data.emails || []))
            .catch(() => setEmails([]))
            .finally(() => setLoading(false));
    };
    useEffect(load, []);

    return (
        <div className="space-y-4" data-testid="seller-emails-page">
            <div className="flex items-center justify-between gap-3">
                <p className="text-sm text-muted-foreground">
                    Chaque email envoyé par la boutique (confirmations, suivi) apparaît ici avec son statut de livraison réel.
                </p>
                <Button variant="outline" size="sm" onClick={load} disabled={loading} className="rounded-full shrink-0" data-testid="emails-refresh-btn">
                    <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /> Actualiser
                </Button>
            </div>

            <div className="rounded-xl border border-border/60 bg-emerald-500/5 p-3 text-xs text-muted-foreground flex gap-2">
                <AlertTriangle className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
                <span>
                    Le statut est vérifié automatiquement auprès de Resend à chaque actualisation :
                    « Délivré ✓ » = arrivé dans la boîte du destinataire · « Rejeté ✗ » = adresse inexistante ou erreur (raison affichée) · « Marqué spam » = à surveiller.
                </span>
            </div>

            {emails === null ? (
                <p className="py-16 text-center text-sm text-muted-foreground">Chargement…</p>
            ) : emails.length === 0 ? (
                <div className="py-16 text-center text-muted-foreground">
                    <Mail className="h-8 w-8 mx-auto mb-3 opacity-40" />
                    <p className="text-sm">Aucun email envoyé pour l&apos;instant.</p>
                </div>
            ) : (
                <div className="bg-card rounded-2xl shadow-card border border-border/50 overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground border-b border-border">
                                <th className="px-4 py-3">Date</th>
                                <th className="px-4 py-3">Type</th>
                                <th className="px-4 py-3">Destinataire(s)</th>
                                <th className="px-4 py-3 hidden md:table-cell">Sujet</th>
                                <th className="px-4 py-3">Statut</th>
                            </tr>
                        </thead>
                        <tbody>
                            {emails.map((e) => {
                                const meta = STATUS_META[e.delivery_status] || STATUS_META.sent;
                                return (
                                    <tr key={e.resend_id || `${e.at}-${e.subject}`} className="border-b border-border/40 last:border-0" data-testid="email-log-row">
                                        <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">{fmtDate(e.at)}</td>
                                        <td className="px-4 py-3 whitespace-nowrap">{TAG_LABELS[e.tag] || e.tag}</td>
                                        <td className="px-4 py-3 max-w-[220px] truncate">{(e.to || []).join(", ")}</td>
                                        <td className="px-4 py-3 hidden md:table-cell max-w-[280px] truncate text-muted-foreground">{e.subject}</td>
                                        <td className="px-4 py-3">
                                            <Badge variant="outline" className={`rounded-full text-[11px] ${meta.cls}`}>{meta.label}</Badge>
                                            {(e.error || e.bounce_reason) && (
                                                <p className="mt-1 text-[11px] text-destructive max-w-[220px] truncate" title={e.error || e.bounce_reason}>
                                                    {e.error || e.bounce_reason}
                                                </p>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
