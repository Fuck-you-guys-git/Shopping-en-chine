import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useParams, Link, useNavigate } from "react-router-dom";
import { ArrowLeft, ShoppingBag, Truck, ShieldCheck, Minus, Plus, Check, X, ChevronLeft, ChevronRight, Star as StarIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ProductCard, formatPrice } from "@/components/ProductCard";
import { categories, subcategoriesByCategory } from "@/data/products";
import { useCatalog } from "@/context/CatalogContext";
import { useCart } from "@/context/CartContext";
import { productsAPI } from "@/lib/api";
import { toast } from "sonner";
import { usePageTitle } from "@/hooks/usePageTitle";
import { colorName } from "@/lib/colors";
import { ProductReviews } from "@/components/ProductReviews";
import { t, formatProductMoney, getLocale } from "@/lib/locale";

// Tailles S–XL : uniquement vêtements & chaussures (pas lunettes, sacs, bijoux, montres, jouets…)
const NON_APPAREL_SUBS = new Set([
    "lunettes", "sacs", "bijoux", "montres", "accessoires",
    "jouets", "accessoires-enfants", "fournitures-scolaires",
]);
const hasSizes = (p) => {
    if (!["mode", "enfants"].includes(p.category)) return false;
    if (p.subcategory) return !NON_APPAREL_SUBS.has(p.subcategory);
    const name = (p.name || "").toLowerCase();
    const subs = subcategoriesByCategory[p.category] || [];
    return !subs.some((s) => NON_APPAREL_SUBS.has(s.id) && s.keywords.some((k) => name.includes(k)));
};

// Vignettes : version miniature des images stockées côté serveur
const thumbOf = (u) => (u && u.includes("/img/") ? u.replace("/img/", "/thumb/") : u);

export default function ProductDetail() {
    const { id } = useParams();
    const navigate = useNavigate();
    const { addItem, setDrawerOpen } = useCart();
    const { products: allProducts, loaded } = useCatalog();
    const catalogProduct = allProducts.find((p) => p.id === id);
    // La liste publique est allégée (sans galerie) → on charge la fiche complète
    const [fullProduct, setFullProduct] = useState(null);
    useEffect(() => {
        setFullProduct(null);
        productsAPI.get(id).then(setFullProduct).catch(() => {});
    }, [id]);
    const product = fullProduct?.id === id ? fullProduct : catalogProduct;
    usePageTitle(product?.name || "Produit", product?.description);
    const [qty, setQty] = useState(1);
    const [imgIdx, setImgIdx] = useState(0);
    useEffect(() => { setImgIdx(0); setSize(null); }, [id]);
    const touchRef = useRef({ x: 0, y: 0 });
    // Visionneuse plein écran (tap sur la photo)
    const [lightbox, setLightbox] = useState(false);
    useEffect(() => {
        document.body.style.overflow = lightbox ? "hidden" : "";
        return () => { document.body.style.overflow = ""; };
    }, [lightbox]);
    // Couleur OBLIGATOIRE : aucune pré-sélection, le client doit choisir
    const [color, setColor] = useState(null);
    const [size, setSize] = useState(null);
    const colorRef = useRef(null);

    if (!product) {
        if (!loaded) {
            return (
                <div className="container mx-auto px-5 py-24 text-center" data-testid="product-loading">
                    <p className="text-muted-foreground">{t("Chargement du produit…")}</p>
                </div>
            );
        }
        return (
            <div className="container mx-auto px-5 py-24 text-center">
                <h2 className="font-display text-3xl mb-4">{t("Produit introuvable")}</h2>
                <Button asChild variant="outline" className="rounded-full"><Link to="/boutique">{t("Retour à la boutique")}</Link></Button>
            </div>
        );
    }

    const category = categories.find((c) => c.id === product.category);
    const gallery = (product.images?.length ? product.images : [product.image]).filter(Boolean);
    // Tailles : celles définies par le vendeur, sinon S–XL pour les vêtements
    const sizeOptions = product.sizes?.length ? product.sizes : (hasSizes(product) ? ["S", "M", "L", "XL"] : []);

    // Swipe tactile : glisser le doigt sur la photo pour changer d'image
    const onTouchStart = (e) => {
        touchRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    };
    const onTouchEnd = (e) => {
        if (gallery.length < 2) return;
        const dx = e.changedTouches[0].clientX - touchRef.current.x;
        const dy = e.changedTouches[0].clientY - touchRef.current.y;
        if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy)) {
            setImgIdx((i) => (dx < 0 ? (i + 1) % gallery.length : (i - 1 + gallery.length) % gallery.length));
        }
    };
    const nextImg = () => setImgIdx((i) => (i + 1) % gallery.length);
    const prevImg = () => setImgIdx((i) => (i - 1 + gallery.length) % gallery.length);
    const related = allProducts.filter((p) => p.id !== product.id && p.category === product.category).slice(0, 4);
    if (related.length < 4) {
        const fill = allProducts.filter((p) => p.id !== product.id && p.category !== product.category);
        related.push(...fill.slice(0, 4 - related.length));
    }

    const soldOut = product.outOfStock === true || product.stock === 0;
    const needsColor = Array.isArray(product.colors) && product.colors.length > 0;

    // La couleur est obligatoire quand le produit en propose
    const requireColor = () => {
        if (needsColor && !color) {
            toast.error(t("Veuillez choisir une couleur"), { description: t("Sélectionnez une couleur avant d'ajouter au panier.") });
            colorRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
            return false;
        }
        return true;
    };

    const handleAdd = () => {
        if (soldOut || !requireColor()) return;
        addItem(product, qty, size, color);
        const details = [size ? `${t("Taille")} ${size}` : null, color ? colorName(color) : null].filter(Boolean).join(" · ");
        toast.success(t("Ajouté au panier"), { description: `${product.name}${details ? ` · ${details}` : ""} × ${qty}` });
    };

    const handleBuyNow = () => {
        if (soldOut || !requireColor()) return;
        addItem(product, qty, size, color);
        setDrawerOpen(false);
        navigate("/commande");
    };

    return (
        <div>
            <div className="container mx-auto px-5 py-8">
                <button onClick={() => navigate(-1)} className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-6">
                    <ArrowLeft className="h-4 w-4" /> {t("Retour")}
                </button>

                <div className="grid lg:grid-cols-2 gap-10 lg:gap-16">
                    {/* Gallery */}
                    <div className="space-y-3">
                        <div
                            className="aspect-[4/5] overflow-hidden rounded-3xl bg-muted relative touch-pan-y select-none"
                            onTouchStart={onTouchStart}
                            onTouchEnd={onTouchEnd}
                            data-testid="product-gallery-swipe-area"
                        >
                            {product.badge && (
                                <Badge className="absolute top-5 left-5 z-10 bg-background text-foreground rounded-full px-3 py-1 hover:bg-background">
                                    {product.badge}
                                </Badge>
                            )}
                            <img
                                key={imgIdx}
                                src={gallery[imgIdx] || gallery[0]}
                                alt={product.name}
                                draggable={false}
                                onClick={() => setLightbox(true)}
                                className="h-full w-full object-contain img-swap cursor-zoom-in"
                                data-testid="product-main-image"
                            />
                            {gallery.length > 1 && (
                                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 flex gap-1.5" data-testid="product-gallery-dots">
                                    {gallery.map((_, i) => (
                                        <span
                                            key={i}
                                            className={`h-1.5 rounded-full transition-all duration-300 ${i === imgIdx ? "w-5 bg-primary" : "w-1.5 bg-background/80"}`}
                                        />
                                    ))}
                                </div>
                            )}
                        </div>
                        {gallery.length > 1 && (
                            <div className="grid grid-cols-5 gap-3" data-testid="product-gallery-thumbnails">
                                {gallery.map((src, i) => (
                                    <button
                                        key={`${src.slice(-24)}-${i}`}
                                        type="button"
                                        onClick={() => setImgIdx(i)}
                                        data-testid={`product-thumb-${i}`}
                                        className={`aspect-square rounded-xl overflow-hidden bg-muted border-2 transition-all ${i === imgIdx ? "border-primary" : "border-transparent hover:border-border"}`}
                                    >
                                        <img src={thumbOf(src)} alt="" loading="lazy" className="h-full w-full object-cover" />
                                    </button>
                                ))}
                            </div>
                        )}

                        {/* Visionneuse plein écran — tap sur la photo pour l'ouvrir */}
                        {lightbox && createPortal(
                            <div
                                className="fixed inset-0 z-[100] bg-black/95 flex items-center justify-center"
                                onClick={() => setLightbox(false)}
                                onTouchStart={onTouchStart}
                                onTouchEnd={onTouchEnd}
                                data-testid="image-lightbox"
                            >
                                <button
                                    type="button"
                                    onClick={() => setLightbox(false)}
                                    aria-label="Fermer"
                                    data-testid="lightbox-close-btn"
                                    className="absolute top-4 right-4 z-10 h-11 w-11 rounded-full bg-white/10 text-white flex items-center justify-center hover:bg-white/20 transition-colors"
                                >
                                    <X className="h-5 w-5" />
                                </button>
                                <img
                                    key={imgIdx}
                                    src={gallery[imgIdx] || gallery[0]}
                                    alt={product.name}
                                    draggable={false}
                                    onClick={(e) => e.stopPropagation()}
                                    className="max-h-[88vh] max-w-[94vw] object-contain img-swap select-none"
                                    data-testid="lightbox-image"
                                />
                                {gallery.length > 1 && (
                                    <>
                                        <button
                                            type="button"
                                            onClick={(e) => { e.stopPropagation(); prevImg(); }}
                                            aria-label="Photo précédente"
                                            data-testid="lightbox-prev-btn"
                                            className="absolute left-3 top-1/2 -translate-y-1/2 h-11 w-11 rounded-full bg-white/10 text-white hidden sm:flex items-center justify-center hover:bg-white/20 transition-colors"
                                        >
                                            <ChevronLeft className="h-5 w-5" />
                                        </button>
                                        <button
                                            type="button"
                                            onClick={(e) => { e.stopPropagation(); nextImg(); }}
                                            aria-label="Photo suivante"
                                            data-testid="lightbox-next-btn"
                                            className="absolute right-3 top-1/2 -translate-y-1/2 h-11 w-11 rounded-full bg-white/10 text-white hidden sm:flex items-center justify-center hover:bg-white/20 transition-colors"
                                        >
                                            <ChevronRight className="h-5 w-5" />
                                        </button>
                                        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex gap-1.5">
                                            {gallery.map((_, i) => (
                                                <span
                                                    key={i}
                                                    className={`h-1.5 rounded-full transition-all duration-300 ${i === imgIdx ? "w-5 bg-primary" : "w-1.5 bg-white/50"}`}
                                                />
                                            ))}
                                        </div>
                                    </>
                                )}
                            </div>,
                            document.body
                        )}
                    </div>

                    {/* Info */}
                    <div className="flex flex-col">
                        <nav className="text-xs text-muted-foreground mb-2">
                            <Link to="/boutique" className="hover:text-foreground">{t("Boutique")}</Link>
                            <span className="mx-2">/</span>
                            <Link to={`/boutique/${category?.id}`} className="hover:text-foreground">{t(category?.name)}</Link>
                        </nav>
                        <h1 className="font-display text-xl sm:text-2xl lg:text-3xl font-medium leading-tight tracking-tight">
                            {product.name}
                        </h1>

                        {product.reviews > 0 && (
                            <a href="#avis" className="mt-2 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors" data-testid="product-rating-link">
                                <span className="inline-flex items-center gap-0.5">
                                    {[1, 2, 3, 4, 5].map((n) => (
                                        <StarIcon key={n} className={`h-4 w-4 ${n <= Math.round(product.rating) ? "fill-amber-400 text-amber-400" : "text-border"}`} />
                                    ))}
                                </span>
                                <span className="font-medium text-foreground">{product.rating}</span>
                                ({product.reviews} {t("avis vérifiés")})
                            </a>
                        )}

                        <div className="mt-4 flex items-baseline gap-3 flex-wrap">
                            <span className="font-display text-xl sm:text-2xl font-semibold">{formatProductMoney(product)}</span>
                            {product.oldPrice && getLocale().currency === "XOF" && (
                                <>
                                    <span className="text-base text-muted-foreground line-through">{formatPrice(product.oldPrice)}</span>
                                    <Badge className="bg-primary/10 text-primary hover:bg-primary/10 rounded-full">
                                        −{Math.round((1 - product.price / product.oldPrice) * 100)}%
                                    </Badge>
                                </>
                            )}
                        </div>

                        {product.description && product.description !== "Description à compléter." && (
                            <p className="mt-6 text-muted-foreground leading-relaxed">{product.description}</p>
                        )}

                        {/* Colors — cliquer une couleur affiche la photo associée */}
                        {needsColor && (
                            <div className="mt-8" ref={colorRef}>
                                <p className="text-sm font-medium mb-3">
                                    {t("Couleur :")}{" "}
                                    {color ? (
                                        <span className="text-muted-foreground font-normal">{colorName(color)}</span>
                                    ) : (
                                        <span className="text-destructive font-normal" data-testid="color-required-hint">{t("choisissez une couleur")} *</span>
                                    )}
                                </p>
                                <div className="flex gap-2">
                                    {product.colors.map((c) => (
                                        <button
                                            key={c}
                                            onClick={() => {
                                                setColor(c);
                                                const idx = (product.image_colors || []).indexOf(c);
                                                if (idx >= 0 && idx < gallery.length) setImgIdx(idx);
                                            }}
                                            data-testid={`color-option-${c.replace("#", "")}`}
                                            className={`h-9 w-9 rounded-full border-2 flex items-center justify-center transition-all ${color === c ? "border-primary scale-110" : "border-border"}`}
                                            style={{ background: c }}
                                            aria-label={`Couleur ${c}`}
                                        >
                                            {color === c && <Check className="h-4 w-4 text-primary-foreground" />}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Size — tailles du vendeur (ou S–XL vêtements) */}
                        {sizeOptions.length > 0 && (
                        <div className="mt-6">
                            <p className="text-sm font-medium mb-3">{t("Taille")} {size ? <span className="text-muted-foreground font-normal">· {size}</span> : <span className="text-muted-foreground font-normal">{t("(optionnel)")}</span>}</p>
                            <div className="flex gap-2 flex-wrap" data-testid="product-sizes">
                                {sizeOptions.map((s) => (
                                    <button
                                        key={s}
                                        onClick={() => setSize(size === s ? null : s)}
                                        data-testid={`size-option-${s}`}
                                        className={`h-10 min-w-[48px] px-3 rounded-full border text-sm font-medium transition-colors ${size === s ? "bg-ink text-ink-foreground border-ink" : "border-border hover:border-foreground"}`}
                                    >
                                        {s}
                                    </button>
                                ))}
                            </div>
                        </div>
                        )}

                        {/* Qty + CTA */}
                        {soldOut && (
                            <div data-testid="sold-out-notice" className="mt-8 rounded-2xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm font-medium text-destructive">
                                {t("Rupture de stock")} · {t("Ce produit est actuellement épuisé.")}
                            </div>
                        )}
                        <div className={`${soldOut ? "mt-4" : "mt-8"} flex flex-col sm:flex-row gap-3`}>
                            <div className="inline-flex items-center border rounded-full h-12 px-2">
                                <button onClick={() => setQty(Math.max(1, qty - 1))} className="h-8 w-8 flex items-center justify-center rounded-full hover:bg-muted">
                                    <Minus className="h-4 w-4" />
                                </button>
                                <span className="w-10 text-center font-medium">{qty}</span>
                                <button onClick={() => setQty(qty + 1)} className="h-8 w-8 flex items-center justify-center rounded-full hover:bg-muted">
                                    <Plus className="h-4 w-4" />
                                </button>
                            </div>
                            <Button onClick={handleAdd} disabled={soldOut} size="lg" data-testid="add-to-cart-btn" className="sm:flex-1 h-14 bg-ink hover:bg-ink/90 text-ink-foreground rounded-full text-base font-semibold shadow-warm disabled:opacity-60">
                                <ShoppingBag className="!h-5 !w-5" /> {soldOut ? t("Rupture de stock") : t("Ajouter au panier")}
                            </Button>
                            <Button
                                onClick={handleBuyNow}
                                disabled={soldOut}
                                size="lg"
                                variant="outline"
                                data-testid="buy-now-btn"
                                className="h-12 rounded-full border-primary px-6 text-primary hover:bg-primary hover:text-primary-foreground"
                            >
                                {t("Acheter maintenant")}
                            </Button>
                        </div>
                        {!soldOut && (
                        <Button onClick={handleBuyNow} variant="link" className="mt-3 hidden text-primary self-start px-0">
                            {t("Acheter maintenant →")}
                        </Button>
                        )}

                        <Separator className="my-8" />

                        <div className="grid grid-cols-2 gap-4 text-center">
                            {[
                                { icon: Truck, label: "Livré en 10–20 jours" },
                                { icon: ShieldCheck, label: "Paiement sécurisé" },
                            ].map((f) => (
                                <div key={f.label} className="flex flex-col items-center gap-2">
                                    <f.icon className="h-5 w-5 text-primary" />
                                    <span className="text-xs text-muted-foreground leading-tight">{t(f.label)}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Description tabs */}
                <div className="mt-16 md:mt-24 max-w-3xl">
                    <Tabs defaultValue="desc">
                        <TabsList className="bg-transparent p-0 border-b rounded-none w-full justify-start gap-8">
                            <TabsTrigger value="desc" className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-0 pb-3">{t("Description")}</TabsTrigger>
                            <TabsTrigger value="specs" className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-0 pb-3">{t("Caractéristiques")}</TabsTrigger>
                            <TabsTrigger value="ship" className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-0 pb-3">{t("Livraison")}</TabsTrigger>
                        </TabsList>
                        <TabsContent value="desc" className="pt-6 text-muted-foreground leading-relaxed">
                            {product.description && product.description !== "Description à compléter." ? (
                                <p className="whitespace-pre-line">{product.description}</p>
                            ) : (
                                <p className="text-sm">{t("Aucune description détaillée n'est disponible pour ce produit.")}</p>
                            )}
                        </TabsContent>
                        <TabsContent value="specs" className="pt-6">
                            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                {[
                                    [t("Référence"), `SEC-${product.id.toUpperCase()}`],
                                    ["Catégorie", category?.name],
                                    [t("Origine"), t("Chine · Contrôle qualité UE")],
                                    [t("Matériaux"), t("Premium, hypoallergéniques")],
                                ].map(([k, v]) => (
                                    <div key={k} className="flex justify-between py-2 border-b">
                                        <dt className="text-muted-foreground">{k}</dt>
                                        <dd className="font-medium">{v}</dd>
                                    </div>
                                ))}
                            </dl>
                        </TabsContent>
                        <TabsContent value="ship" className="pt-6 text-muted-foreground leading-relaxed space-y-2">
                            <p><span className="text-foreground font-medium">{t("Livraison Chine → Monde entier")}</span> {t("en 10–20 jours.")}</p>
                        </TabsContent>
                    </Tabs>
                </div>

                {/* Avis clients vérifiés */}
                <ProductReviews productId={product.id} />

                {/* Related */}
                <div className="mt-20 md:mt-28">
                    <h2 className="font-display text-2xl sm:text-3xl font-medium mb-10">{t("Vous aimerez aussi")}</h2>
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-x-4 gap-y-10 md:gap-x-6">
                        {related.map((p, i) => (
                            <ProductCard key={p.id} product={p} index={i} />
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}
