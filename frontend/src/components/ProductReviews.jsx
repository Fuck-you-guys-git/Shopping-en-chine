import { useEffect, useState } from "react";
import { Star, BadgeCheck, Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { reviewsAPI, getSellerToken } from "@/lib/api";
import { t, getLocale } from "@/lib/locale";
import { toast } from "sonner";

const Stars = ({ value, className = "h-4 w-4" }) => (
    <span className="inline-flex items-center gap-0.5" aria-label={`${value}/5`}>
        {[1, 2, 3, 4, 5].map((n) => (
            <Star key={n} className={`${className} ${n <= Math.round(value) ? "fill-amber-400 text-amber-400" : "text-border"}`} />
        ))}
    </span>
);

const fmtDate = (iso) => {
    try {
        return new Date(iso).toLocaleDateString(getLocale().lang === "en" ? "en-US" : "fr-FR",
            { day: "numeric", month: "short", year: "numeric" });
    } catch {
        return "";
    }
};

// Avis clients VÉRIFIÉS d'un produit : moyenne + liste + formulaire
// (n° de commande + email de commande exigés — vérifiés côté serveur).
export const ProductReviews = ({ productId }) => {
    const [data, setData] = useState({ reviews: [], count: 0, average: null });
    const [showForm, setShowForm] = useState(false);
    const [form, setForm] = useState({ order_id: "", email: "", rating: 0, comment: "" });
    const [sending, setSending] = useState(false);
    const isSeller = Boolean(getSellerToken());

    useEffect(() => {
        if (!productId) return;
        reviewsAPI.list(productId).then(setData).catch(() => {});
    }, [productId]);

    const submit = async (e) => {
        e.preventDefault();
        if (!form.order_id.trim() || !form.email.trim() || !form.rating) {
            toast.error(t("Champs requis"), { description: t("N° de commande, email et note sont obligatoires.") });
            return;
        }
        setSending(true);
        try {
            const rev = await reviewsAPI.submit({ product_id: productId, ...form, order_id: form.order_id.trim(), email: form.email.trim() });
            setData((d) => {
                const reviews = [rev, ...d.reviews];
                const count = d.count + 1;
                const average = Math.round((reviews.reduce((s, r) => s + r.rating, 0) / count) * 10) / 10;
                return { reviews, count, average };
            });
            setShowForm(false);
            setForm({ order_id: "", email: "", rating: 0, comment: "" });
            toast.success(t("Merci pour votre avis !"), { description: t("Il est maintenant visible sous le produit.") });
        } catch (err) {
            toast.error(t("Avis impossible"), { description: err.response?.data?.detail || t("Réessayez plus tard.") });
        } finally {
            setSending(false);
        }
    };

    const removeReview = async (id) => {
        try {
            await reviewsAPI.remove(id);
            setData((d) => {
                const reviews = d.reviews.filter((r) => r.id !== id);
                const count = reviews.length;
                const average = count ? Math.round((reviews.reduce((s, r) => s + r.rating, 0) / count) * 10) / 10 : null;
                return { reviews, count, average };
            });
            toast.success(t("Avis supprimé"));
        } catch {
            toast.error(t("Suppression impossible"));
        }
    };

    return (
        <div className="mt-16 md:mt-24 max-w-3xl" id="avis" data-testid="product-reviews">
            <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
                <div>
                    <h2 className="font-display text-2xl sm:text-3xl font-medium">{t("Avis clients")}</h2>
                    {data.count > 0 ? (
                        <p className="mt-2 flex items-center gap-2 text-sm text-muted-foreground" data-testid="reviews-average">
                            <Stars value={data.average} className="h-5 w-5" />
                            <span className="font-semibold text-foreground">{data.average}/5</span>
                            · {data.count} {t("avis vérifiés")}
                        </p>
                    ) : (
                        <p className="mt-2 text-sm text-muted-foreground">{t("Aucun avis pour le moment — soyez le premier !")}</p>
                    )}
                </div>
                <Button variant="outline" className="rounded-full border-2" onClick={() => setShowForm((v) => !v)} data-testid="review-toggle-form-btn">
                    {showForm ? t("Annuler") : t("Donner mon avis")}
                </Button>
            </div>

            {showForm && (
                <form onSubmit={submit} className="bg-card border border-border/60 rounded-2xl p-5 md:p-6 shadow-card mb-8 space-y-4" data-testid="review-form">
                    <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                        <BadgeCheck className="h-4 w-4 text-success shrink-0" />
                        {t("Seuls les clients ayant acheté ce produit peuvent laisser un avis.")}
                    </p>
                    <div className="grid sm:grid-cols-2 gap-3">
                        <Input value={form.order_id} onChange={(e) => setForm((f) => ({ ...f, order_id: e.target.value }))}
                            placeholder={t("N° de commande (ex : 1024)")} data-testid="review-order-input" />
                        <Input type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                            placeholder={t("Email utilisé pour la commande")} data-testid="review-email-input" />
                    </div>
                    <div className="flex items-center gap-3">
                        <span className="text-sm text-muted-foreground">{t("Votre note")} :</span>
                        <span className="inline-flex gap-1" data-testid="review-star-picker">
                            {[1, 2, 3, 4, 5].map((n) => (
                                <button key={n} type="button" onClick={() => setForm((f) => ({ ...f, rating: n }))}
                                    className="p-0.5" aria-label={`${n}/5`} data-testid={`review-star-${n}`}>
                                    <Star className={`h-6 w-6 transition-colors ${n <= form.rating ? "fill-amber-400 text-amber-400" : "text-border hover:text-amber-300"}`} />
                                </button>
                            ))}
                        </span>
                    </div>
                    <Textarea value={form.comment} onChange={(e) => setForm((f) => ({ ...f, comment: e.target.value }))}
                        placeholder={t("Votre commentaire (facultatif)")} rows={3} maxLength={1000} data-testid="review-comment-input" />
                    <Button type="submit" disabled={sending} className="bg-primary hover:bg-primary/90 text-primary-foreground rounded-full h-11 px-8" data-testid="review-submit-btn">
                        {sending ? <><Loader2 className="h-4 w-4 animate-spin" /> {t("Envoi…")}</> : t("Publier mon avis")}
                    </Button>
                </form>
            )}

            <div className="space-y-4" data-testid="reviews-list">
                {data.reviews.map((r) => (
                    <div key={r.id} className="bg-card border border-border/50 rounded-2xl p-5 shadow-card" data-testid={`review-${r.id}`}>
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                            <Stars value={r.rating} />
                            <span className="font-medium text-sm">{r.author}</span>
                            <span className="inline-flex items-center gap-1 text-xs text-success font-medium">
                                <BadgeCheck className="h-3.5 w-3.5" /> {t("Achat vérifié")}
                            </span>
                            <span className="text-xs text-muted-foreground ml-auto">{fmtDate(r.created_at)}</span>
                            {isSeller && (
                                <button type="button" onClick={() => removeReview(r.id)} aria-label="Supprimer"
                                    className="text-muted-foreground hover:text-destructive transition-colors" data-testid={`review-delete-${r.id}`}>
                                    <Trash2 className="h-4 w-4" />
                                </button>
                            )}
                        </div>
                        {r.comment && <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{r.comment}</p>}
                    </div>
                ))}
            </div>
        </div>
    );
};
