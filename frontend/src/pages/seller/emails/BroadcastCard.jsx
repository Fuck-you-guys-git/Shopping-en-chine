import { useEffect, useState } from "react";
import { Send, Users, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { emailsAPI } from "@/lib/api";

// Email de masse : un clic pour écrire à TOUS les clients ayant commandé.
export const BroadcastCard = () => {
    const [customers, setCustomers] = useState([]);
    const [showList, setShowList] = useState(false);
    const [subject, setSubject] = useState("");
    const [message, setMessage] = useState("");
    const [sending, setSending] = useState(false);

    useEffect(() => {
        emailsAPI.customers().then((d) => setCustomers(d.customers || [])).catch(() => {});
    }, []);

    const send = async () => {
        if (!subject.trim() || !message.trim()) {
            toast.error("Sujet et message requis");
            return;
        }
        if (!window.confirm(`Envoyer cet email à ${customers.length} client(s) ?`)) return;
        setSending(true);
        try {
            const res = await emailsAPI.broadcast({ subject, message });
            toast.success(`Email envoyé à ${res.sent} client(s)`, {
                description: res.failed ? `${res.failed} échec(s) — voir le journal` : "Tous les envois ont réussi",
            });
            setSubject("");
            setMessage("");
        } catch (e) {
            toast.error("Envoi impossible", { description: e?.response?.data?.detail || e.message });
        } finally {
            setSending(false);
        }
    };

    return (
        <div className="bg-card rounded-2xl p-5 shadow-card border border-border/50 space-y-3" data-testid="broadcast-card">
            <div className="flex items-center justify-between gap-3 flex-wrap">
                <h3 className="font-display text-lg font-medium flex items-center gap-2">
                    <Send className="h-4 w-4 text-primary" /> Email de masse
                </h3>
                <button
                    data-testid="broadcast-customers-toggle"
                    onClick={() => setShowList((v) => !v)}
                    className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
                >
                    <Users className="h-3.5 w-3.5" /> {customers.length} client(s) avec email
                    <ChevronDown className={`h-3.5 w-3.5 transition-transform ${showList ? "rotate-180" : ""}`} />
                </button>
            </div>
            {showList && (
                <div className="max-h-44 overflow-y-auto rounded-xl border border-border/60 divide-y divide-border/40" data-testid="broadcast-customers-list">
                    {customers.map((c) => (
                        <div key={c.email} className="flex items-center justify-between gap-2 px-3 py-1.5 text-xs">
                            <span className="truncate">{c.name || "—"} · <span className="text-muted-foreground">{c.email}</span></span>
                            <span className="text-muted-foreground shrink-0">{c.orders} cmd</span>
                        </div>
                    ))}
                    {customers.length === 0 && <p className="px-3 py-2 text-xs text-muted-foreground">Aucun client avec email pour l&apos;instant.</p>}
                </div>
            )}
            <Input
                data-testid="broadcast-subject-input"
                placeholder="Sujet (ex : Nouveautés de la semaine)"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
            />
            <Textarea
                data-testid="broadcast-message-input"
                placeholder="Votre message… (chaque ligne devient un paragraphe)"
                rows={4}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
            />
            <Button
                data-testid="broadcast-send-btn"
                onClick={send}
                disabled={sending || customers.length === 0}
                className="rounded-full bg-ink text-ink-foreground hover:bg-ink/90"
            >
                <Send className="h-4 w-4" /> {sending ? "Envoi en cours…" : `Envoyer à tous les clients (${customers.length})`}
            </Button>
        </div>
    );
};
