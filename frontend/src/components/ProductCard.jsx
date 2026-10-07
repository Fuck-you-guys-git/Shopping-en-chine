import { Link } from "react-router-dom";
import { ShoppingBag, Star } from "lucide-react";
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
    const isXof = getLocale().currency === "XOF";
    // Remise affichée uniquement si l'ancien prix existe réellement et
    // que l'on est en devise de référence (aucune conversion automatique).
    const showOld = Boolean(product.oldPrice) && product.oldPrice > product.price && isXof;
    const discount = showOld ? Math.round((1 - product.price / product.oldPrice) * 100) : 0;

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
            data-testid={`product-card-${product.id}`}
            className="group flex flex-col fade-in-up"
            style={{ animationDelay: `${Math.min(index, 8) * 40}ms` }}
        >
            <div className="relative mb-3 aspect-[4/5] overflow-hidden rounded-xl bg-muted">
                <img
                    src={product.image}
                    alt={product.name}
                    loading={index < 4 ? "eager" : "lazy"}
                    decoding="async"
                    className="h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.05]"
                />
                <div className="pointer-events-none absolute inset-0 rounded-xl ring-1 ring-inset ring-foreground/5" />
                {soldOut ? (
                    <span
                        data-testid="sold-out-badge"
                        className="absolute left-2.5 top-2.5 rounded-full bg-foreground/85 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-background backdrop-blur"
                    >
                        {t("Rupture de stock")}
                    </span>
                ) : discount > 0 ? (
                    <span
                        data-testid="discount-badge"
                        className="absolute left-2.5 top-2.5 rounded-full bg-primary px-2.5 py-1 text-[11px] font-bold text-primary-foreground"
                    >
                        −{discount}%
                    </span>
                ) : product.badge ? (
                    <span className="absolute left-2.5 top-2.5 rounded-full bg-background/95 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-foreground backdrop-blur">
                        {product.badge}
                    </span>
                ) : null}
            </div>

            <div className="flex flex-1 flex-col">
                <h3 className="line-clamp-2 text-sm font-medium leading-snug text-foreground">
                    {product.name}
                </h3>
                {product.reviews > 0 && (
                    <span className="mt-1.5 inline-flex items-center gap-1 text-xs text-muted-foreground" data-testid="card-rating">
                        <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" aria-hidden="true" />
                        {product.rating}
                        <span className="opacity-70">({product.reviews})</span>
                    </span>
                )}
                <div className="mt-auto flex flex-wrap items-baseline gap-x-2 pt-2">
                    <span className="text-base font-bold tracking-tight text-foreground sm:text-lg">
                        {formatProductMoney(product)}
                    </span>
                    {showOld && (
                        <span className="text-xs text-muted-foreground line-through">
                            {formatPrice(product.oldPrice)}
                        </span>
                    )}
                </div>
                <button
                    type="button"
                    onClick={handleAdd}
                    disabled={soldOut}
                    data-testid="product-card-add-btn"
                    className="mt-3 inline-flex h-10 w-full items-center justify-center gap-2 rounded-full bg-foreground text-sm font-semibold text-background transition-colors duration-200 hover:bg-foreground/85 disabled:cursor-not-allowed disabled:opacity-50"
                >
                    <ShoppingBag className="h-4 w-4" aria-hidden="true" />
                    {soldOut ? t("Rupture de stock") : needsColor ? t("Choisir la couleur") : t("Ajouter au panier")}
                </button>
            </div>
        </Link>
    );
};
