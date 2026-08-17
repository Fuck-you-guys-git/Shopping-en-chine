import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import {
    Search, Package, Plane, Landmark, Truck, Home as HomeIcon,
    Check, Loader2, XCircle, MapPin,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { formatPrice } from "@/components/ProductCard";
import { trackingAPI } from "@/lib/api";
import { orderNo } from "@/lib/utils";
import { t, getLocale } from "@/lib/locale";

const STEP_ICONS = {
    ordered: Package,
    shipped: Plane,
    customs: Landmark,
    delivery: Truck,
    delivered: HomeIcon,
};

const formatDate = (iso) => {
    if (!iso) return null;
    try {
        const loc = getLocale().lang === "en" ? "en-US" : "fr-FR";
        return new Date(iso).toLocaleDateString(loc, { day: "numeric", month: "long", year: "numeric" });
    } catch {
        return null;
    }
};

const PAYMENT_BADGES = {
    success: { label: "Paiement confirmé", cls: "bg-success/15 text-success" },
    pending: { label: "Paiement en attente", cls: "bg-amber-100 text-amber-700" },
    failed: { label: "Paiement échoué", cls: "bg-destructive/10 text-destructive" },
};

export default function TrackOrder() {
    const { orderId } = useParams();
    const navigate = useNavigate();
    const [query, setQuery] = useState(orderId || "");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [data, setData] = useState(null);

    const lookup = async (id) => {
        if (!id?.trim()) return;
        setLoading(true);
        setError(null);
        setData(null);
        try {
            // tolère le format "#1000"
            const res = await trackingAPI.track(id.trim().replace(/^#/, ""));
            setData(res);
        } catch (err) {
            setError(err.response?.data?.detail || t("Commande introuvable. Vérifiez votre numéro de commande."));
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (orderId) lookup(orderId);
    }, [orderId]);

    const onSubmit = (e) => {
        e.preventDefault();
        const id = query.trim().replace(/^#/, "");
        if (!id) return;
        navigate(`/suivi/${encodeURIComponent(id)}`, { replace: !!orderId });
        lookup(id);
    };

    const badge = data ? (PAYMENT_BADGES[data.payment_status] || PAYMENT_BADGES.pending) : null;

    return (
        <div className="container mx-auto px-5 py-12 md:py-16">
            <div className="max-w-2xl mx-auto">
                {/* Header + search */}
                <div className="text-center mb-10">
                    <div className="h-14 w-14 mx-auto rounded-2xl bg-primary/10 text-primary flex items-center justify-center mb-4">
                        <Truck className="h-7 w-7" />
                    </div>
                    <h1 className="font-display text-4xl sm:text-5xl font-medium tracking-tight mb-3">
                        {t("Où est mon colis ?")}
                    </h1>
                    <p className="text-muted-foreground text-sm md:text-base">
                        {t("Entrez votre numéro de commande (reçu après le paiement) pour suivre votre colis de la Chine jusqu'à Dakar.")}
                    </p>
                </div>

                <form onSubmit={onSubmit} className="flex gap-2 mb-10">
                    <div className="relative flex-1">
                        <Search className="h-4 w-4 absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground" />
                        <Input
                            data-testid="tracking-order-input"
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            placeholder="Ex : ord_a1b2c3d4e5f6"
                            className="pl-11 h-12 rounded-full font-mono text-sm"
                        />
                    </div>
                    <Button
                        type="submit"
                        disabled={loading || !query.trim()}
                        data-testid="tracking-submit-btn"
                        className="rounded-full h-12 px-7 bg-ink text-ink-foreground hover:bg-ink/90"
                    >
                        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : t("Suivre")}
                    </Button>
                </form>

                {/* Error */}
                {error && (
                    <div
                        data-testid="tracking-error"
                        className="flex gap-3 p-4 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-sm mb-8"
                    >
                        <XCircle className="h-5 w-5 shrink-0 mt-0.5" />
                        <div>
                            <p className="font-medium">{error}</p>
                            <p className="text-xs mt-1 opacity-80">
                                {t("Le numéro figure sur l'écran de confirmation et commence par « ord_ ».")}
                            </p>
                        </div>
                    </div>
                )}

                {/* Result */}
                {data && (
                    <div data-testid="tracking-result" className="space-y-6">
                        {/* Order summary card */}
                        <div className="bg-card rounded-2xl shadow-card p-6">
                            <div className="flex flex-wrap items-center justify-between gap-3 mb-1">
                                <p className="font-mono text-sm text-muted-foreground" data-testid="tracking-order-id">
                                    {t("Commande")} {orderNo(data.order_id)}
                                </p>
                                <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${badge.cls}`} data-testid="tracking-payment-badge">
                                    {t(badge.label)}
                                </span>
                            </div>
                            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                                <span>{t("Passée le")} {formatDate(data.created_at)}</span>
                                {data.city && (
                                    <span className="inline-flex items-center gap-1">
                                        <MapPin className="h-3 w-3" /> {data.city}
                                    </span>
                                )}
                            </div>

                            {!data.delivered && (
                                <div className="mt-4 p-3 rounded-xl bg-primary/5 border border-primary/15 text-sm" data-testid="tracking-eta">
                                    <span className="text-muted-foreground">{t("Livraison estimée :")} </span>
                                    <span className="font-medium text-foreground">
                                        {t("entre le")} {formatDate(data.eta_start)} {t("et le")} {formatDate(data.eta_end)}
                                    </span>
                                </div>
                            )}
                        </div>

                        {/* Timeline */}
                        <div className="bg-card rounded-2xl shadow-card p-6" data-testid="tracking-timeline">
                            <h2 className="text-base md:text-lg font-medium mb-6">{t("Suivi du colis")}</h2>
                            <ol className="relative space-y-0">
                                {data.steps.map((s, i) => {
                                    const Icon = STEP_ICONS[s.code] || Package;
                                    const done = i <= data.tracking_step_index;
                                    const current = i === data.tracking_step_index;
                                    const historyEntry = [...(data.tracking_history || [])]
                                        .reverse()
                                        .find((h) => h.step === s.code);
                                    const isLast = i === data.steps.length - 1;
                                    return (
                                        <li key={s.code} className="flex gap-4" data-testid={`tracking-step-${s.code}`}>
                                            <div className="flex flex-col items-center">
                                                <div
                                                    className={`h-10 w-10 rounded-full flex items-center justify-center shrink-0 ${
                                                        done
                                                            ? "bg-primary text-primary-foreground"
                                                            : "bg-muted text-muted-foreground"
                                                    } ${current && !data.delivered ? "ring-4 ring-primary/20" : ""}`}
                                                >
                                                    {done && !current ? <Check className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
                                                </div>
                                                {!isLast && (
                                                    <div className={`w-0.5 flex-1 min-h-[28px] ${i < data.tracking_step_index ? "bg-primary" : "bg-border"}`} />
                                                )}
                                            </div>
                                            <div className={`pb-7 ${isLast ? "pb-0" : ""}`}>
                                                <p className={`text-sm font-medium leading-10 ${done ? "text-foreground" : "text-muted-foreground"}`}>
                                                    {t(s.label)}
                                                    {s.code === "delivery" && data.city ? ` · ${data.city}` : ""}
                                                    {current && !data.delivered && (
                                                        <span className="ml-2 text-[10px] uppercase tracking-widest bg-primary/10 text-primary px-2 py-0.5 rounded-full align-middle">
                                                            {t("En cours")}
                                                        </span>
                                                    )}
                                                </p>
                                                {historyEntry && done && (
                                                    <p className="text-xs text-muted-foreground -mt-2">{formatDate(historyEntry.at)}</p>
                                                )}
                                            </div>
                                        </li>
                                    );
                                })}
                            </ol>
                        </div>

                        {/* Items */}
                        {data.items?.length > 0 && (
                            <div className="bg-card rounded-2xl shadow-card p-6" data-testid="tracking-items">
                                <h2 className="text-base md:text-lg font-medium mb-4">
                                    {t("Articles")} ({data.items.length})
                                </h2>
                                <div className="space-y-3">
                                    {data.items.map((it, i) => (
                                        <div key={`${it.product_id || it.name}-${i}`} className="flex justify-between text-sm">
                                            <span className="text-muted-foreground">
                                                {it.name} <span className="text-xs">× {it.qty}</span>
                                            </span>
                                            <span className="font-medium">{formatPrice(it.price * it.qty)}</span>
                                        </div>
                                    ))}
                                </div>
                                <Separator className="my-4" />
                                <div className="flex justify-between items-baseline">
                                    <span className="font-medium">{t("Total")}</span>
                                    <span className="font-display text-xl font-semibold">
                                        {formatPrice(data.amount)}
                                    </span>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* Help */}
                {!data && !error && !loading && (
                    <div className="text-center text-sm text-muted-foreground">
                        <p>
                            {t("Vous n'avez pas encore commandé ?")}{" "}
                            <Link to="/boutique" className="text-primary hover:underline">{t("Découvrir la boutique")}</Link>
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
}
