import { useEffect, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { ArrowLeft, Heart, ShoppingBag, Truck, ShieldCheck, Minus, Plus, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ProductCard, formatPrice } from "@/components/ProductCard";
import { categories } from "@/data/products";
import { useCatalog } from "@/context/CatalogContext";
import { useCart } from "@/context/CartContext";
import { toast } from "sonner";
import { usePageTitle } from "@/hooks/usePageTitle";

export default function ProductDetail() {
    const { id } = useParams();
    const navigate = useNavigate();
    const { addItem, setDrawerOpen } = useCart();
    const { products: allProducts, loaded } = useCatalog();
    const product = allProducts.find((p) => p.id === id);
    usePageTitle(product?.name || "Produit", product?.description);
    const [qty, setQty] = useState(1);
    const [imgIdx, setImgIdx] = useState(0);
    useEffect(() => { setImgIdx(0); }, [id]);
    const [color, setColor] = useState(product?.colors?.[0]);
    const [size, setSize] = useState("M");

    if (!product) {
        if (!loaded) {
            return (
                <div className="container mx-auto px-5 py-24 text-center" data-testid="product-loading">
                    <p className="text-muted-foreground">Chargement du produit…</p>
                </div>
            );
        }
        return (
            <div className="container mx-auto px-5 py-24 text-center">
                <h2 className="font-display text-3xl mb-4">Produit introuvable</h2>
                <Button asChild variant="outline" className="rounded-full"><Link to="/boutique">Retour à la boutique</Link></Button>
            </div>
        );
    }

    const category = categories.find((c) => c.id === product.category);
    const related = allProducts.filter((p) => p.id !== product.id && p.category === product.category).slice(0, 4);
    if (related.length < 4) {
        const fill = allProducts.filter((p) => p.id !== product.id && p.category !== product.category);
        related.push(...fill.slice(0, 4 - related.length));
    }

    const handleAdd = () => {
        addItem(product, qty);
        toast.success("Ajouté au panier", { description: `${product.name} × ${qty}` });
    };

    const handleBuyNow = () => {
        addItem(product, qty);
        setDrawerOpen(false);
        navigate("/commande");
    };

    return (
        <div>
            <div className="container mx-auto px-5 py-8">
                <button onClick={() => navigate(-1)} className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-6">
                    <ArrowLeft className="h-4 w-4" /> Retour
                </button>

                <div className="grid lg:grid-cols-2 gap-10 lg:gap-16">
                    {/* Gallery */}
                    <div className="space-y-3">
                        {(() => {
                            const gallery = (product.images?.length ? product.images : [product.image]).filter(Boolean);
                            const current = gallery[imgIdx] || gallery[0];
                            return (
                                <>
                                    <div className="aspect-square overflow-hidden rounded-3xl bg-muted relative">
                                        {product.badge && (
                                            <Badge className="absolute top-5 left-5 z-10 bg-background text-foreground rounded-full px-3 py-1 hover:bg-background">
                                                {product.badge}
                                            </Badge>
                                        )}
                                        <img src={current} alt={product.name} className="h-full w-full object-cover" data-testid="product-main-image" />
                                    </div>
                                    {gallery.length > 1 && (
                                        <div className="grid grid-cols-5 gap-3" data-testid="product-gallery-thumbnails">
                                            {gallery.map((src, i) => (
                                                <button
                                                    key={i}
                                                    type="button"
                                                    onClick={() => setImgIdx(i)}
                                                    data-testid={`product-thumb-${i}`}
                                                    className={`aspect-square rounded-xl overflow-hidden bg-muted border-2 transition-all ${i === imgIdx ? "border-primary" : "border-transparent hover:border-border"}`}
                                                >
                                                    <img src={src} alt="" className="h-full w-full object-cover" />
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </>
                            );
                        })()}
                    </div>

                    {/* Info */}
                    <div className="flex flex-col">
                        <nav className="text-xs text-muted-foreground mb-2">
                            <Link to="/boutique" className="hover:text-foreground">Boutique</Link>
                            <span className="mx-2">/</span>
                            <Link to={`/boutique/${category?.id}`} className="hover:text-foreground">{category?.name}</Link>
                        </nav>
                        <h1 className="font-display text-3xl sm:text-4xl lg:text-5xl font-medium leading-tight tracking-tight">
                            {product.name}
                        </h1>

                        <div className="mt-6 flex items-baseline gap-3">
                            <span className="font-display text-4xl font-semibold">{formatPrice(product.price)}</span>
                            {product.oldPrice && (
                                <>
                                    <span className="text-lg text-muted-foreground line-through">{formatPrice(product.oldPrice)}</span>
                                    <Badge className="bg-primary/10 text-primary hover:bg-primary/10 rounded-full">
                                        −{Math.round((1 - product.price / product.oldPrice) * 100)}%
                                    </Badge>
                                </>
                            )}
                        </div>

                        <p className="mt-6 text-muted-foreground leading-relaxed">{product.description}</p>

                        {/* Colors */}
                        {product.colors && (
                            <div className="mt-8">
                                <p className="text-sm font-medium mb-3">Couleur : <span className="text-muted-foreground font-normal">Sélectionnée</span></p>
                                <div className="flex gap-2">
                                    {product.colors.map((c) => (
                                        <button
                                            key={c}
                                            onClick={() => setColor(c)}
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

                        {/* Size */}
                        <div className="mt-6">
                            <p className="text-sm font-medium mb-3">Taille</p>
                            <div className="flex gap-2">
                                {["S", "M", "L", "XL"].map((s) => (
                                    <button
                                        key={s}
                                        onClick={() => setSize(s)}
                                        className={`h-10 min-w-[48px] px-3 rounded-full border text-sm font-medium transition-colors ${size === s ? "bg-ink text-ink-foreground border-ink" : "border-border hover:border-foreground"}`}
                                    >
                                        {s}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Qty + CTA */}
                        <div className="mt-8 flex flex-col sm:flex-row gap-3">
                            <div className="inline-flex items-center border rounded-full h-12 px-2">
                                <button onClick={() => setQty(Math.max(1, qty - 1))} className="h-8 w-8 flex items-center justify-center rounded-full hover:bg-muted">
                                    <Minus className="h-4 w-4" />
                                </button>
                                <span className="w-10 text-center font-medium">{qty}</span>
                                <button onClick={() => setQty(qty + 1)} className="h-8 w-8 flex items-center justify-center rounded-full hover:bg-muted">
                                    <Plus className="h-4 w-4" />
                                </button>
                            </div>
                            <Button onClick={handleAdd} size="lg" className="flex-1 bg-ink hover:bg-ink/90 text-ink-foreground rounded-full h-12">
                                <ShoppingBag className="h-4 w-4" /> Ajouter au panier
                            </Button>
                            <Button onClick={handleBuyNow} size="lg" variant="outline" className="rounded-full h-12 border-primary text-primary hover:bg-primary hover:text-primary-foreground">
                                <Heart className="h-4 w-4" />
                            </Button>
                        </div>
                        <Button onClick={handleBuyNow} variant="link" className="mt-3 text-primary self-start px-0">
                            Acheter maintenant →
                        </Button>

                        <Separator className="my-8" />

                        <div className="grid grid-cols-2 gap-4 text-center">
                            {[
                                { icon: Truck, label: "Livré en 10–20 jours" },
                                { icon: ShieldCheck, label: "Garantie 2 ans" },
                            ].map((f) => (
                                <div key={f.label} className="flex flex-col items-center gap-2">
                                    <f.icon className="h-5 w-5 text-primary" />
                                    <span className="text-xs text-muted-foreground leading-tight">{f.label}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Description tabs */}
                <div className="mt-16 md:mt-24 max-w-3xl">
                    <Tabs defaultValue="desc">
                        <TabsList className="bg-transparent p-0 border-b rounded-none w-full justify-start gap-8">
                            <TabsTrigger value="desc" className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-0 pb-3">Description</TabsTrigger>
                            <TabsTrigger value="specs" className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-0 pb-3">Caractéristiques</TabsTrigger>
                            <TabsTrigger value="ship" className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-0 pb-3">Livraison</TabsTrigger>
                        </TabsList>
                        <TabsContent value="desc" className="pt-6 text-muted-foreground leading-relaxed">
                            <p>{product.description} Conçu pour durer et vivre avec vous, ce produit combine matériaux nobles et savoir-faire moderne. Chaque détail a été pensé pour une expérience quotidienne agréable et sans friction.</p>
                        </TabsContent>
                        <TabsContent value="specs" className="pt-6">
                            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                {[
                                    ["Référence", `SEC-${product.id.toUpperCase()}`],
                                    ["Catégorie", category?.name],
                                    ["Poids", "280 g"],
                                    ["Origine", "Chine · Contrôle qualité UE"],
                                    ["Garantie", "2 ans"],
                                    ["Matériaux", "Premium, hypoallergéniques"],
                                ].map(([k, v]) => (
                                    <div key={k} className="flex justify-between py-2 border-b">
                                        <dt className="text-muted-foreground">{k}</dt>
                                        <dd className="font-medium">{v}</dd>
                                    </div>
                                ))}
                            </dl>
                        </TabsContent>
                        <TabsContent value="ship" className="pt-6 text-muted-foreground leading-relaxed space-y-2">
                            <p><span className="text-foreground font-medium">Livraison Chine → Dakar</span> en 10–20 jours — offerte dès 30 000 F.</p>
                        </TabsContent>
                    </Tabs>
                </div>

                {/* Related */}
                <div className="mt-20 md:mt-28">
                    <h2 className="font-display text-3xl sm:text-4xl font-medium mb-10">Vous aimerez aussi</h2>
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
