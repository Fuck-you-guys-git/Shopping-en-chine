import { useEffect, useRef, useState } from "react";
import { RadioTower, Search, Filter, MapPin, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useSeller } from "@/context/SellerContext";
import { formatPrice } from "@/components/ProductCard";
import { toast } from "sonner";

const timeAgo = (ts) => {
    const s = Math.floor((Date.now() - ts) / 1000);
    if (s < 60) return `il y a ${s}s`;
    if (s < 3600) return `il y a ${Math.floor(s / 60)}min`;
    if (s < 86400) return `il y a ${Math.floor(s / 3600)}h`;
    return `il y a ${Math.floor(s / 86400)}j`;
};

export default function Orders() {
    const { orders, updateOrderStatus, STATUS_LABELS, STATUSES } = useSeller();
    const [tab, setTab] = useState("toutes");
    const [query, setQuery] = useState("");
    const [selected, setSelected] = useState(null);
    const [tick, setTick] = useState(0);

    // Force re-render every 30s to update "il y a Xmin" labels
    useEffect(() => {
        const t = setInterval(() => setTick((x) => x + 1), 30000);
        return () => clearInterval(t);
    }, []);

    const prevOrderIds = useRef(new Set(orders.map((o) => o.id)));
    useEffect(() => {
        const currentIds = new Set(orders.map((o) => o.id));
        for (const id of currentIds) {
            if (!prevOrderIds.current.has(id)) {
                const o = orders.find((x) => x.id === id);
                if (o) {
                    toast.success("Nouvelle commande ✦", {
                        description: `${o.customer} · ${o.city} · ${formatPrice(o.total)}`,
                    });
                }
            }
        }
        prevOrderIds.current = currentIds;
    }, [orders]);

    const filtered = orders.filter((o) => {
        if (tab !== "toutes" && o.status !== tab) return false;
        if (query && !`${o.id} ${o.customer} ${o.city}`.toLowerCase().includes(query.toLowerCase())) return false;
        return true;
    });

    const counts = {
        toutes: orders.length,
        nouvelle: orders.filter((o) => o.status === "nouvelle").length,
        confirmée: orders.filter((o) => o.status === "confirmée").length,
        préparation: orders.filter((o) => o.status === "préparation").length,
        expédiée: orders.filter((o) => o.status === "expédiée").length,
        livrée: orders.filter((o) => o.status === "livrée").length,
    };

    return (
        <div className="space-y-5">
            {/* Live indicator + search */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                    <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-success/15 text-success text-xs font-medium">
                        <span className="relative flex h-2 w-2">
                            <span className="absolute inline-flex h-full w-full rounded-full bg-success opacity-75 animate-ping" />
                            <span className="relative inline-flex h-2 w-2 rounded-full bg-success" />
                        </span>
                        Suivi en temps réel actif
                    </div>
                    <span className="text-xs text-muted-foreground hidden sm:inline">Mise à jour toutes les 6s</span>
                </div>
                <div className="relative w-full md:w-72">
                    <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Client, ville, N° de commande…" className="pl-9" />
                </div>
            </div>

            {/* Status tabs */}
            <Tabs value={tab} onValueChange={setTab}>
                <TabsList className="bg-muted/50 h-auto flex-wrap justify-start p-1">
                    {[
                        { k: "toutes", l: "Toutes" },
                        { k: "nouvelle", l: "Nouvelles" },
                        { k: "confirmée", l: "Confirmées" },
                        { k: "préparation", l: "En préparation" },
                        { k: "expédiée", l: "Expédiées" },
                        { k: "livrée", l: "Livrées" },
                    ].map((s) => (
                        <TabsTrigger key={s.k} value={s.k} className="data-[state=active]:bg-background data-[state=active]:shadow-soft gap-2">
                            {s.l}
                            <span className={`text-[10px] px-1.5 rounded-full ${tab === s.k ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground"}`}>
                                {counts[s.k]}
                            </span>
                        </TabsTrigger>
                    ))}
                </TabsList>
            </Tabs>

            {/* Orders list */}
            <div className="bg-card rounded-2xl shadow-card border border-border/50 overflow-hidden">
                <div className="grid grid-cols-12 gap-4 px-4 md:px-6 py-3 bg-muted/30 border-b border-border text-xs uppercase tracking-widest text-muted-foreground font-medium">
                    <div className="col-span-4 md:col-span-3">Client</div>
                    <div className="col-span-2 hidden md:block">Commande</div>
                    <div className="col-span-3 md:col-span-2">Articles</div>
                    <div className="col-span-3 md:col-span-2">Statut</div>
                    <div className="hidden md:block col-span-1">Écoulé</div>
                    <div className="col-span-2 text-right">Total</div>
                </div>
                <div className="divide-y divide-border max-h-[70vh] overflow-y-auto">
                    {filtered.length === 0 && (
                        <div className="px-6 py-16 text-center text-sm text-muted-foreground">
                            Aucune commande dans cet onglet
                        </div>
                    )}
                    {filtered.map((o) => (
                        <button
                            key={o.id}
                            onClick={() => setSelected(o)}
                            className={`w-full grid grid-cols-12 gap-4 px-4 md:px-6 py-4 items-center text-left hover:bg-muted/30 transition-colors ${o.fresh ? "bg-primary/5" : ""}`}
                        >
                            <div className="col-span-4 md:col-span-3 flex items-center gap-3 min-w-0">
                                <div className="h-9 w-9 rounded-full bg-secondary flex items-center justify-center text-xs font-semibold shrink-0">
                                    {o.customer.split(" ").map((n) => n[0]).join("").slice(0, 2)}
                                </div>
                                <div className="min-w-0">
                                    <p className="text-sm font-medium truncate flex items-center gap-2">
                                        {o.customer}
                                        {o.fresh && <span className="text-[9px] uppercase tracking-widest bg-primary text-primary-foreground px-1.5 py-0.5 rounded">Nouveau</span>}
                                    </p>
                                    <p className="text-xs text-muted-foreground truncate flex items-center gap-1">
                                        <MapPin className="h-3 w-3" /> {o.city}
                                    </p>
                                </div>
                            </div>
                            <div className="col-span-2 hidden md:block text-sm font-mono text-muted-foreground">{o.id}</div>
                            <div className="col-span-3 md:col-span-2 flex -space-x-2">
                                {o.items.slice(0, 3).map((it, i) => (
                                    <div key={i} className="h-8 w-8 rounded-full border-2 border-card bg-muted overflow-hidden">
                                        <img src={it.image} alt="" className="h-full w-full object-cover" />
                                    </div>
                                ))}
                                {o.items.length > 3 && <span className="text-xs text-muted-foreground ml-3 self-center">+{o.items.length - 3}</span>}
                            </div>
                            <div className="col-span-3 md:col-span-2">
                                <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ${STATUS_LABELS[o.status].color}`}>
                                    <span className={`h-1.5 w-1.5 rounded-full ${STATUS_LABELS[o.status].dot}`} />
                                    {STATUS_LABELS[o.status].label}
                                </span>
                            </div>
                            <div className="hidden md:block col-span-1 text-xs text-muted-foreground">
                                <span className="inline-flex items-center gap-1">
                                    <Clock className="h-3 w-3" /> {timeAgo(o.createdAt)}
                                </span>
                            </div>
                            <div className="col-span-2 text-right font-display font-semibold text-sm whitespace-nowrap">
                                {formatPrice(o.total)}
                            </div>
                        </button>
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
                                    Commande {selected.id}
                                </DialogTitle>
                            </DialogHeader>
                            <div className="space-y-5">
                                <div className="flex items-center gap-3 p-4 bg-muted/40 rounded-xl">
                                    <div className="h-11 w-11 rounded-full bg-gradient-accent text-primary-foreground flex items-center justify-center font-semibold">
                                        {selected.customer.split(" ").map((n) => n[0]).join("").slice(0, 2)}
                                    </div>
                                    <div className="flex-1">
                                        <p className="font-medium">{selected.customer}</p>
                                        <p className="text-xs text-muted-foreground flex items-center gap-1">
                                            <MapPin className="h-3 w-3" /> {selected.city} · {timeAgo(selected.createdAt)}
                                        </p>
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
                                                <div className="h-12 w-12 rounded-lg bg-muted overflow-hidden shrink-0">
                                                    <img src={it.image} alt="" className="h-full w-full object-cover" />
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
                                    <Select
                                        value={selected.status}
                                        onValueChange={(v) => {
                                            updateOrderStatus(selected.id, v);
                                            setSelected({ ...selected, status: v });
                                            toast.success(`Statut mis à jour → ${STATUS_LABELS[v].label}`);
                                        }}
                                    >
                                        <SelectTrigger className="flex-1">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {STATUSES.map((s) => (
                                                <SelectItem key={s} value={s}>{STATUS_LABELS[s].label}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                    <Button className="bg-ink text-ink-foreground hover:bg-ink/90">Contacter le client</Button>
                                </div>
                            </div>
                        </>
                    )}
                </DialogContent>
            </Dialog>
        </div>
    );
}
