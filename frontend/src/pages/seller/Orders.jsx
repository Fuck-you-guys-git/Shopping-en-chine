import { useEffect, useState } from "react";
import { Search, MapPin, Clock, CheckSquare, Printer, Phone } from "lucide-react";
import { orderNo } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useSeller } from "@/context/SellerContext";
import { formatCfa as formatPrice } from "@/lib/locale";
import { toast } from "sonner";

const timeAgo = (ts) => {
    const s = Math.floor((Date.now() - ts) / 1000);
    if (s < 60) return `il y a ${s}s`;
    if (s < 3600) return `il y a ${Math.floor(s / 60)}min`;
    if (s < 86400) return `il y a ${Math.floor(s / 3600)}h`;
    return `il y a ${Math.floor(s / 86400)}j`;
};

// --- Tickets colis imprimables — étiquette 100 × 150 mm (4 × 6 pouces), 1 commande = 1 page ---
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

const ticketHtml = (o) => {
    const addr = [o.address, o.city].filter(Boolean);
    const dateStr = new Date(o.createdAt).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
    return `
    <div class="ticket">
        <div class="top">
            <span class="brand">SHOPPING EN CHINE</span>
            <span class="meta">Commande ${esc(orderNo(o.id))}<br/>${esc(dateStr)}</span>
        </div>
        <p class="ship">Livraison : ${o.deliveryMode === "express" ? "EXPRESS (5–7 jours ouvrés)" : "STANDARD (15–20 jours ouvrés)"}</p>
        <div class="cols">
            <div class="col">
                <p class="label">Expédier à</p>
                <p class="who">${esc(o.customer)}</p>
                ${addr.map((l) => `<p class="addr">${esc(l)}</p>`).join("")}
                ${o.phone ? `<p class="addr">${esc(o.phone)}</p>` : ""}
            </div>
            <div class="col">
                <p class="label">Facturer à</p>
                <p class="who">${esc(o.customer)}</p>
                ${addr.map((l) => `<p class="addr">${esc(l)}</p>`).join("")}
            </div>
        </div>
        <div class="rule"></div>
        <div class="items">
            <div class="items-head"><span>Articles</span><span>Quantité</span></div>
            ${o.items.map((it) => `
                <div class="item">
                    <span class="item-name">${esc(it.name)}</span>
                    <span class="item-qty">${it.qty} sur ${it.qty}</span>
                </div>`).join("")}
        </div>
        <div class="rule"></div>
        <div class="foot">
            <p class="thanks">Merci pour votre achat !</p>
            <p class="fbrand">SHOPPING EN CHINE</p>
            <p class="fline">Guangzhou, 510000 Guangdong, Chine</p>
            <p class="fline">serviceclients@shoppingenchine.com</p>
            <p class="fline">shoppingenchine.com</p>
        </div>
    </div>`;
};

const printTickets = (ordersToPrint) => {
    if (!ordersToPrint.length) return false;
    const w = window.open("", "_blank");
    if (!w) return false;
    w.document.write(`<!doctype html><html><head><title>Tickets colis — Shopping en Chine</title><style>
        /* Étiquette 100 × 150 mm (4 × 6 pouces) — une commande par page.
           Le ticket occupe 100% de la page (100vw × 100vh) pour couvrir
           TOUTE la feuille et rester centré quelle que soit l'imprimante. */
        @page{size:100mm 150mm;margin:0}
        *{box-sizing:border-box}
        html,body{width:100%;height:100%}
        body{font-family:Arial,Helvetica,sans-serif;margin:0;padding:0;color:#000;background:#fff}
        p{margin:0}
        .ticket{width:100vw;height:100vh;padding:5mm 6mm;display:flex;flex-direction:column;overflow:hidden;page-break-after:always;break-after:page;border:1px solid #999;color:#000}
        .ticket:last-child{page-break-after:auto;break-after:auto}
        .top{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:3mm}
        .ship{font-size:18px;font-weight:900;border:2.5px solid #000;display:inline-block;padding:1.5mm 3mm;margin-bottom:4mm}
        .brand{font-weight:900;font-size:25px;letter-spacing:.5px}
        .meta{font-size:15px;font-weight:bold;text-align:right;line-height:1.4}
        .cols{display:flex;gap:5mm}
        .col{flex:1;min-width:0}
        .label{font-size:14px;font-weight:900;text-transform:uppercase;letter-spacing:1px;margin-bottom:1.5mm}
        .who{font-size:20px;font-weight:900;line-height:1.3}
        .addr{font-size:17px;font-weight:bold;line-height:1.35}
        .rule{border-top:2.5px solid #000;margin:4mm 0 3mm}
        .items{flex:1 1 auto;min-height:0}
        .items-head{display:flex;justify-content:space-between;font-size:14px;font-weight:900;text-transform:uppercase;letter-spacing:1px;margin-bottom:2.5mm}
        .item{display:flex;justify-content:space-between;gap:4mm;margin-bottom:2.5mm}
        .item-name{font-size:19px;font-weight:900;line-height:1.3}
        .item-qty{font-size:17px;font-weight:bold;white-space:nowrap}
        .foot{text-align:center;margin-top:auto}
        .thanks{font-size:17px;font-weight:bold;margin-bottom:2.5mm}
        .fbrand{font-size:17px;font-weight:900;letter-spacing:.5px;margin-bottom:1mm}
        .fline{font-size:15px;font-weight:bold;line-height:1.45}
        @media screen{body{padding:16px;background:#eee}.ticket{width:100mm;height:150mm;margin:0 auto 14px;background:#fff;box-shadow:0 1px 6px rgba(0,0,0,.2)}}
        @media print{.ticket{border:none}}
    </style></head><body>${ordersToPrint.map(ticketHtml).join("")}</body></html>`);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 400);
    return true;
};

export default function Orders() {
    const {
        orders, ordersLoaded, updateOrderStatus, bulkUpdateOrderStatus,
        STATUS_LABELS, STATUSES, PAYMENT_LABELS,
    } = useSeller();
    const [tab, setTab] = useState("toutes");
    const [query, setQuery] = useState("");
    const [selected, setSelected] = useState(null);
    const [checkedIds, setCheckedIds] = useState(new Set());
    const [bulkStep, setBulkStep] = useState("");
    const [bulkBusy, setBulkBusy] = useState(false);
    const [, setTick] = useState(0);

    // Re-render every 30s to refresh "il y a Xmin" labels
    useEffect(() => {
        const t = setInterval(() => setTick((x) => x + 1), 30000);
        return () => clearInterval(t);
    }, []);

    const filtered = orders.filter((o) => {
        if (tab !== "toutes" && o.status !== tab) return false;
        if (query && !`${o.id} #${o.id} ${o.customer} ${o.city}`.toLowerCase().includes(query.toLowerCase())) return false;
        return true;
    });

    const counts = { toutes: orders.length };
    STATUSES.forEach((s) => { counts[s] = orders.filter((o) => o.status === s).length; });

    const allChecked = filtered.length > 0 && filtered.every((o) => checkedIds.has(o.id));
    const toggleAll = () => {
        setCheckedIds((prev) => {
            if (allChecked) {
                const next = new Set(prev);
                filtered.forEach((o) => next.delete(o.id));
                return next;
            }
            return new Set([...prev, ...filtered.map((o) => o.id)]);
        });
    };
    const toggleOne = (id) => {
        setCheckedIds((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
        });
    };

    const applyBulk = async () => {
        if (!bulkStep || checkedIds.size === 0) return;
        setBulkBusy(true);
        try {
            const res = await bulkUpdateOrderStatus([...checkedIds], bulkStep);
            toast.success(`${res.updated ?? checkedIds.size} commande(s) → ${STATUS_LABELS[bulkStep].label}`);
            setCheckedIds(new Set());
            setBulkStep("");
        } catch {
            toast.error("Impossible de mettre à jour les commandes. Réessayez.");
        } finally {
            setBulkBusy(false);
        }
    };

    return (
        <div className="space-y-5">
            {/* Live indicator + search */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-success/15 text-success text-xs font-medium w-fit">
                    <span className="relative flex h-2 w-2">
                        <span className="absolute inline-flex h-full w-full rounded-full bg-success opacity-75 animate-ping" />
                        <span className="relative inline-flex h-2 w-2 rounded-full bg-success" />
                    </span>
                    Commandes réelles · actualisation auto
                </div>
                <div className="relative w-full md:w-72">
                    <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Client, ville, N° de commande…" className="pl-9" data-testid="orders-search-input" />
                </div>
            </div>

            {/* Status tabs */}
            <Tabs value={tab} onValueChange={setTab}>
                <TabsList className="bg-muted/50 h-auto flex-wrap justify-start p-1">
                    {[{ k: "toutes", l: "Toutes" }, ...STATUSES.map((s) => ({ k: s, l: STATUS_LABELS[s].label }))].map((s) => (
                        <TabsTrigger key={s.k} value={s.k} className="data-[state=active]:bg-background data-[state=active]:shadow-soft gap-2" data-testid={`orders-tab-${s.k}`}>
                            {s.l}
                            <span className={`text-[10px] px-1.5 rounded-full ${tab === s.k ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground"}`}>
                                {counts[s.k]}
                            </span>
                        </TabsTrigger>
                    ))}
                </TabsList>
            </Tabs>

            {/* Bulk action bar */}
            {checkedIds.size > 0 && (
                <div className="flex flex-col sm:flex-row sm:items-center gap-3 p-3 rounded-xl bg-primary/5 border border-primary/20" data-testid="orders-bulk-bar">
                    <span className="inline-flex items-center gap-2 text-sm font-medium text-primary">
                        <CheckSquare className="h-4 w-4" />
                        {checkedIds.size} commande(s) sélectionnée(s)
                    </span>
                    <div className="flex items-center gap-2 sm:ml-auto flex-wrap">
                        <Button
                            variant="outline"
                            onClick={() => {
                                const sel = orders.filter((o) => checkedIds.has(o.id));
                                if (!printTickets(sel)) toast.error("Autorisez les pop-ups pour imprimer les tickets.");
                            }}
                            className="border-primary text-primary hover:bg-primary hover:text-primary-foreground bg-card"
                            data-testid="orders-print-tickets-btn"
                        >
                            <Printer className="h-4 w-4" /> Imprimer les tickets ({checkedIds.size})
                        </Button>
                        <Select value={bulkStep} onValueChange={setBulkStep}>
                            <SelectTrigger className="w-52 bg-card" data-testid="orders-bulk-status-select">
                                <SelectValue placeholder="Nouveau statut…" />
                            </SelectTrigger>
                            <SelectContent>
                                {STATUSES.map((s) => (
                                    <SelectItem key={s} value={s}>{STATUS_LABELS[s].label}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <Button onClick={applyBulk} disabled={!bulkStep || bulkBusy} className="bg-primary text-primary-foreground hover:bg-primary/90" data-testid="orders-bulk-apply-btn">
                            {bulkBusy ? "Mise à jour…" : "Appliquer"}
                        </Button>
                    </div>
                </div>
            )}

            {/* Orders list */}
            <div className="bg-card rounded-2xl shadow-card border border-border/50 overflow-hidden">
                <div className="grid grid-cols-12 gap-3 px-4 md:px-6 py-3 bg-muted/30 border-b border-border text-xs uppercase tracking-widest text-muted-foreground font-medium items-center">
                    <div className="col-span-1 flex items-center">
                        <Checkbox checked={allChecked} onCheckedChange={toggleAll} aria-label="Tout sélectionner" data-testid="orders-select-all-checkbox" />
                    </div>
                    <div className="col-span-4 md:col-span-3">Client</div>
                    <div className="col-span-2 hidden md:block">Commande</div>
                    <div className="col-span-2 hidden md:block">Paiement</div>
                    <div className="col-span-4 md:col-span-2">Statut</div>
                    <div className="col-span-2 text-right">Total</div>
                </div>
                <div className="divide-y divide-border max-h-[70vh] overflow-y-auto">
                    {filtered.length === 0 && (
                        <div className="px-6 py-16 text-center text-sm text-muted-foreground" data-testid="orders-empty-state">
                            {ordersLoaded ? "Aucune commande dans cet onglet" : "Chargement des commandes…"}
                        </div>
                    )}
                    {filtered.map((o) => (
                        <div key={o.id} className="grid grid-cols-12 gap-3 px-4 md:px-6 py-4 items-center hover:bg-muted/30 transition-colors" data-testid={`order-row-${o.id}`}>
                            <div className="col-span-1 flex items-center">
                                <Checkbox
                                    checked={checkedIds.has(o.id)}
                                    onCheckedChange={() => toggleOne(o.id)}
                                    aria-label={`Sélectionner ${o.id}`}
                                    data-testid={`order-checkbox-${o.id}`}
                                />
                            </div>
                            <button onClick={() => setSelected(o)} className="col-span-4 md:col-span-3 flex items-center gap-3 min-w-0 text-left">
                                <div className="h-9 w-9 rounded-full bg-secondary flex items-center justify-center text-xs font-semibold shrink-0">
                                    {o.customer.split(" ").map((n) => n[0]).join("").slice(0, 2)}
                                </div>
                                <div className="min-w-0">
                                    <p className="text-sm font-medium truncate">{o.customer}</p>
                                    <p className="text-xs text-muted-foreground truncate flex items-center gap-1">
                                        <MapPin className="h-3 w-3" /> {o.city} · <Clock className="h-3 w-3" /> {timeAgo(o.createdAt)}
                                    </p>
                                </div>
                            </button>
                            <div className="col-span-2 hidden md:block min-w-0">
                                <p className="text-xs font-mono text-muted-foreground truncate">{orderNo(o.id)}</p>
                                <span
                                    className={`inline-flex mt-1 text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase tracking-wide ${o.deliveryMode === "express" ? "bg-amber-100 text-amber-700" : "bg-muted text-muted-foreground"}`}
                                    data-testid={`order-delivery-${o.id}`}
                                >
                                    {o.deliveryMode === "express" ? "Express" : "Standard"}
                                </span>
                            </div>
                            <div className="col-span-2 hidden md:block">
                                <span className={`inline-flex text-xs font-medium px-2 py-0.5 rounded-full ${PAYMENT_LABELS[o.payment].color}`}>
                                    {PAYMENT_LABELS[o.payment].label}
                                </span>
                            </div>
                            <div className="col-span-4 md:col-span-2">
                                <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ${STATUS_LABELS[o.status].color}`}>
                                    <span className={`h-1.5 w-1.5 rounded-full ${STATUS_LABELS[o.status].dot}`} />
                                    {STATUS_LABELS[o.status].label}
                                </span>
                            </div>
                            <button onClick={() => setSelected(o)} className="col-span-2 text-right font-display font-semibold text-sm whitespace-nowrap">
                                {formatPrice(o.total)}
                            </button>
                        </div>
                    ))}
                </div>
            </div>

            {/* Order detail dialog */}
            <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
                <DialogContent className="max-w-lg">
                    {selected && (
                        <>
                            <DialogHeader>
                                <DialogTitle className="font-display text-2xl flex items-center gap-3">
                                    Commande {orderNo(selected.id)}
                                </DialogTitle>
                            </DialogHeader>
                            <div className="space-y-5">
                                <div className="flex items-center gap-3 p-4 bg-muted/40 rounded-xl">
                                    <div className="h-11 w-11 rounded-full bg-gradient-accent text-primary-foreground flex items-center justify-center font-semibold">
                                        {selected.customer.split(" ").map((n) => n[0]).join("").slice(0, 2)}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="font-medium">{selected.customer}</p>
                                        <p className="text-xs text-muted-foreground flex items-center gap-1">
                                            <MapPin className="h-3 w-3" /> {[selected.address, selected.city].filter(Boolean).join(", ")} · {timeAgo(selected.createdAt)}
                                        </p>
                                        {selected.phone && (
                                            <p className="text-xs text-muted-foreground flex items-center gap-1" data-testid="order-detail-phone">
                                                <Phone className="h-3 w-3" /> {selected.phone}
                                            </p>
                                        )}
                                        {selected.email && <p className="text-xs text-muted-foreground truncate">{selected.email}</p>}
                                    </div>
                                    <div className="flex flex-col items-end gap-1.5 shrink-0">
                                        <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${PAYMENT_LABELS[selected.payment].color}`}>
                                            {PAYMENT_LABELS[selected.payment].label}
                                        </span>
                                        <span
                                            className={`text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase tracking-wide ${selected.deliveryMode === "express" ? "bg-amber-100 text-amber-700" : "bg-muted text-muted-foreground"}`}
                                            data-testid="order-detail-delivery"
                                        >
                                            Livraison {selected.deliveryMode === "express" ? "Express" : "Standard"}
                                        </span>
                                    </div>
                                </div>

                                {/* Progress */}
                                <div>
                                    <p className="text-xs uppercase tracking-widest text-muted-foreground mb-3">Suivi</p>
                                    <div className="flex items-center gap-1">
                                        {STATUSES.map((s, i) => {
                                            const currentIdx = STATUSES.indexOf(selected.status);
                                            const done = i <= currentIdx;
                                            return (
                                                <div key={s} className="flex-1">
                                                    <div className={`h-1.5 rounded-full ${done ? "bg-primary" : "bg-muted"}`} />
                                                    <p className={`text-[10px] mt-1.5 text-center ${done ? "text-foreground font-medium" : "text-muted-foreground"}`}>
                                                        {STATUS_LABELS[s].label}
                                                    </p>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>

                                {/* Items */}
                                <div>
                                    <p className="text-xs uppercase tracking-widest text-muted-foreground mb-3">Articles ({selected.items.length})</p>
                                    <div className="space-y-2 max-h-52 overflow-y-auto">
                                        {selected.items.map((it, i) => (
                                            <div key={i} className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/30">
                                                <div className="h-12 w-12 rounded-lg bg-muted overflow-hidden shrink-0 flex items-center justify-center">
                                                    {it.image
                                                        ? <img src={it.image} alt="" className="h-full w-full object-cover" />
                                                        : <i className="fa-solid fa-box text-muted-foreground" />}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-sm font-medium truncate">{it.name}</p>
                                                    <p className="text-xs text-muted-foreground">Qté {it.qty}</p>
                                                </div>
                                                <span className="text-sm font-medium whitespace-nowrap">{formatPrice(it.price * it.qty)}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                <div className="flex justify-between items-baseline p-4 bg-secondary/50 rounded-xl">
                                    <span className="font-medium">Total</span>
                                    <span className="font-display text-2xl font-semibold">{formatPrice(selected.total)}</span>
                                </div>

                                {/* Actions */}
                                <div className="flex flex-col sm:flex-row gap-2">
                                    <Button
                                        variant="outline"
                                        onClick={() => {
                                            if (!printTickets([selected])) toast.error("Autorisez les pop-ups pour imprimer le ticket.");
                                        }}
                                        className="border-primary text-primary hover:bg-primary hover:text-primary-foreground"
                                        data-testid="order-print-ticket-btn"
                                    >
                                        <Printer className="h-4 w-4" /> Imprimer le ticket
                                    </Button>
                                    <Select
                                        value={selected.status}
                                        onValueChange={async (v) => {
                                            try {
                                                await updateOrderStatus(selected.id, v);
                                                setSelected({ ...selected, status: v });
                                                toast.success(`Statut mis à jour → ${STATUS_LABELS[v].label}`);
                                            } catch {
                                                toast.error("Mise à jour impossible. Réessayez.");
                                            }
                                        }}
                                    >
                                        <SelectTrigger className="flex-1" data-testid="order-status-select">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {STATUSES.map((s) => (
                                                <SelectItem key={s} value={s}>{STATUS_LABELS[s].label}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>
                        </>
                    )}
                </DialogContent>
            </Dialog>
        </div>
    );
}
