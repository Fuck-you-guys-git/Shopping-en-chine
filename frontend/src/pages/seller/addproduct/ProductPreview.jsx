import { Package, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { categories } from "@/data/products";
import { formatCfa as formatPrice } from "@/lib/locale";

// Aperçu en direct de la fiche produit (colonne latérale)
export const ProductPreview = ({ form, photos, mainImage }) => {
    const catObj = categories.find((c) => c.id === form.category);
    return (
        <div className="bg-card rounded-2xl p-5 shadow-card border border-border/50">
            <p className="text-xs uppercase tracking-widest text-muted-foreground mb-3 flex items-center gap-2">
                <Sparkles className="h-3.5 w-3.5 text-primary" />
                Aperçu en direct
            </p>
            <div className="aspect-[4/5] rounded-xl overflow-hidden bg-muted relative mb-3">
                {mainImage ? (
                    <img src={mainImage} alt="" className="h-full w-full object-cover" />
                ) : (
                    <div className="h-full w-full flex items-center justify-center text-muted-foreground">
                        <Package className="h-10 w-10 opacity-40" />
                    </div>
                )}
                {form.badge && (
                    <Badge className="absolute top-3 left-3 bg-background text-foreground hover:bg-background rounded-full">
                        {form.badge}
                    </Badge>
                )}
            </div>
            {photos.length > 1 && (
                <div className="flex gap-1.5 mb-3">
                    {photos.slice(0, 5).map((src, i) => (
                        <span key={`${src.slice(-32)}-${i}`} className={`h-9 w-9 rounded-md overflow-hidden border ${i === 0 ? "border-primary" : "border-border"}`}>
                            <img src={src} alt="" className="h-full w-full object-cover" />
                        </span>
                    ))}
                </div>
            )}
            {catObj && (
                <p className="text-xs text-muted-foreground mb-1">
                    <i className={`fa-solid ${catObj.icon} text-primary text-[10px] mr-1.5`} />
                    {catObj.name}
                </p>
            )}
            <p className="font-medium text-sm mb-1 line-clamp-2">{form.name || "Nom du produit"}</p>
            {form.colors.length > 0 && (
                <div className="flex gap-1 mb-2">
                    {form.colors.map((c) => (
                        <span key={c} className="h-4 w-4 rounded-full border border-border" style={{ background: c }} />
                    ))}
                </div>
            )}
            <div className="flex items-baseline gap-2">
                <span className="font-display text-lg font-semibold">{form.price ? formatPrice(Number(form.price)) : "0 F"}</span>
                {form.oldPrice && <span className="text-xs text-muted-foreground line-through">{formatPrice(Number(form.oldPrice))}</span>}
            </div>
        </div>
    );
};
