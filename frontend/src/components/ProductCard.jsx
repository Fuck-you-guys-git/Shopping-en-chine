import { Link } from "react-router-dom";
import { Heart, ShoppingBag, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCart } from "@/context/CartContext";
import { toast } from "sonner";

export const formatPrice = (v) =>
    new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(v);

export const ProductCard = ({ product, index = 0 }) => {
    const { addItem } = useCart();

    const handleAdd = (e) => {
        e.preventDefault();
        e.stopPropagation();
        addItem(product);
        toast.success("Ajouté au panier", { description: product.name });
    };

    return (
        <Link
            to={`/produit/${product.id}`}
            className="group flex flex-col fade-in-up"
            style={{ animationDelay: `${index * 60}ms` }}
        >
            <div className="relative aspect-[4/5] overflow-hidden rounded-2xl bg-muted mb-4">
                <img
                    src={product.image}
                    alt={product.name}
                    loading="lazy"
                    className="h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-105"
                />
                {product.badge && (
                    <span className="absolute top-3 left-3 px-2.5 py-1 rounded-full bg-background/90 backdrop-blur text-[10px] font-semibold uppercase tracking-widest text-foreground shadow-soft">
                        {product.badge}
                    </span>
                )}
                <button
                    type="button"
                    onClick={(e) => { e.preventDefault(); toast("Ajouté aux favoris ♥"); }}
                    className="absolute top-3 right-3 h-8 w-8 rounded-full bg-background/90 backdrop-blur flex items-center justify-center text-foreground/70 hover:text-primary transition-colors"
                    aria-label="Ajouter aux favoris"
                >
                    <Heart className="h-4 w-4" />
                </button>
                <div className="absolute inset-x-3 bottom-3 translate-y-2 opacity-0 group-hover:translate-y-0 group-hover:opacity-100 transition-all duration-300">
                    <Button onClick={handleAdd} className="w-full bg-ink text-ink-foreground hover:bg-ink/90 rounded-full h-10">
                        <ShoppingBag className="h-4 w-4" /> Ajouter
                    </Button>
                </div>
            </div>

            <div className="flex flex-col gap-1 flex-1">
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Star className="h-3 w-3 fill-primary stroke-primary" />
                    <span className="font-medium text-foreground">{product.rating}</span>
                    <span>· {product.reviews} avis</span>
                </div>
                <h3 className="font-medium text-sm sm:text-base text-foreground line-clamp-2 leading-snug">
                    {product.name}
                </h3>
                <div className="mt-auto pt-2 flex items-baseline gap-2">
                    <span className="font-display text-lg font-semibold text-foreground">
                        {formatPrice(product.price)}
                    </span>
                    {product.oldPrice && (
                        <span className="text-xs text-muted-foreground line-through">
                            {formatPrice(product.oldPrice)}
                        </span>
                    )}
                </div>
            </div>
        </Link>
    );
};
