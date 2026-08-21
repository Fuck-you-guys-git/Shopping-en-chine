import { Link } from "react-router-dom";
import { Heart, ShoppingBag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCart } from "@/context/CartContext";
import { toast } from "sonner";
import { formatMoney, formatProductMoney, getLocale, t } from "@/lib/locale";

// Formatage des prix : convertit F CFA -> devise d'affichage (FCFA / € / $)
export const formatPrice = (v) => formatMoney(v);

export const ProductCard = ({ product, index = 0 }) => {
    const { addItem } = useCart();
    const soldOut = product.outOfStock === true || product.stock === 0;
    // Couleur obligatoire : l'ajout rapide ouvre la fiche produit pour choisir
    const needsColor = Array.isArray(product.colors) && product.colors.length > 0;

    const handleAdd = (e) => {
        if (soldOut) {
            e.preventDefault();
            e.stopPropagation();
            return;
        }
        if (needsColor) return; // laisse le lien ouvrir la fiche produit
        e.preventDefault();
        e.stopPropagation();
        addItem(product);
        toast.success(t("Ajouté au panier"), { description: product.name });
    };

    return (
        <Link
            to={`/produit/${product.id}`}
            className="group flex flex-col fade-in-up"
            style={{ animationDelay: `${Math.min(index, 8) * 50}ms` }}
        >
            <div className="relative aspect-[4/5] overflow-hidden rounded-2xl bg-muted mb-4">
                <img
                    src={product.image}
                    alt={product.name}
                    loading="lazy"
                    className="h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-105"
                />
                {soldOut ? (
                    <span data-testid="sold-out-badge" className="absolute top-3 left-3 px-2.5 py-1 rounded-full bg-destructive text-destructive-foreground text-[10px] font-semibold uppercase tracking-widest shadow-soft">
                        {t("Rupture de stock")}
                    </span>
                ) : product.badge && (
                    <span className="absolute top-3 left-3 px-2.5 py-1 rounded-full bg-background/90 backdrop-blur text-[10px] font-semibold uppercase tracking-widest text-foreground shadow-soft">
                        {product.badge}
                    </span>
                )}
                <div
                    onClick={(e) => { e.preventDefault(); toast(t("Ajouté aux favoris ♥")); }}
                    className="absolute top-3 right-3 h-8 w-8 rounded-full bg-background/90 backdrop-blur flex items-center justify-center text-foreground/70 hover:text-primary transition-colors cursor-pointer"
                    aria-label="Ajouter aux favoris"
                >
                    <Heart className="h-4 w-4" />
                </div>
            </div>

            <div className="flex flex-col gap-1 flex-1">
                <h3 className="font-medium text-sm sm:text-base text-foreground line-clamp-2 leading-snug">
                    {product.name}
                </h3>
                <div className="mt-auto pt-2 flex items-baseline gap-2">
                    <span className="font-display text-lg font-semibold text-foreground">
                        {formatProductMoney(product)}
                    </span>
                    {product.oldPrice && getLocale().currency === "XOF" && (
                        <span className="text-xs text-muted-foreground line-through">
                            {formatPrice(product.oldPrice)}
                        </span>
                    )}
                </div>
                <Button
                    onClick={handleAdd}
                    disabled={soldOut}
                    data-testid="product-card-add-btn"
                    className="mt-3 w-full bg-ink text-ink-foreground hover:bg-ink/90 rounded-full h-10 disabled:opacity-60"
                >
                    <ShoppingBag className="h-4 w-4" />{" "}
                    {soldOut ? t("Rupture de stock") : needsColor ? t("Choisir la couleur") : t("Ajouter au panier")}
                </Button>
            </div>
        </Link>
    );
};
