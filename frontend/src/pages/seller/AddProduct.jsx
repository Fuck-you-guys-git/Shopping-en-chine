import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Upload, Package, Sparkles, X, ImagePlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { useSeller } from "@/context/SellerContext";
import { categories } from "@/data/products";
import { formatPrice } from "@/components/ProductCard";
import { toast } from "sonner";

const SAMPLE_IMAGES = [
    "https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=600&q=80",
    "https://images.unsplash.com/photo-1546435770-a3e426bf472b?w=600&q=80",
    "https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=600&q=80",
    "https://images.unsplash.com/photo-1602143407151-7111542de6e8?w=600&q=80",
    "https://images.unsplash.com/photo-1560343090-f0409e92791a?w=600&q=80",
    "https://images.unsplash.com/photo-1526170375885-4d8ecf77b99f?w=600&q=80",
];

const PALETTE = ["#111111", "#F5F1EA", "#C64C3A", "#8A5A44", "#C9A26A", "#7A6A54", "#2E7D5A", "#3B5BDB"];

export default function AddProduct() {
    const { addProduct } = useSeller();
    const navigate = useNavigate();
    const { pathname } = useLocation();
    const base = pathname.startsWith("/admin") ? "/admin" : "/vendeur";

    const [form, setForm] = useState({
        name: "",
        category: "",
        price: "",
        oldPrice: "",
        description: "",
        image: SAMPLE_IMAGES[0],
        badge: "",
        colors: [],
        active: true,
    });

    const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
    const toggleColor = (c) => set("colors", form.colors.includes(c) ? form.colors.filter((x) => x !== c) : [...form.colors, c]);

    const submit = (e) => {
        e.preventDefault();
        if (!form.name || !form.category || !form.price) {
            toast.error("Champs requis manquants", { description: "Nom, catégorie et prix sont obligatoires." });
            return;
        }
        const product = {
            name: form.name,
            category: form.category,
            price: Number(form.price),
            oldPrice: form.oldPrice ? Number(form.oldPrice) : undefined,
            description: form.description || "Description à compléter.",
            image: form.image,
            badge: form.badge || undefined,
            colors: form.colors.length ? form.colors : undefined,
        };
        addProduct(product);
        toast.success("Produit ajouté ✦", { description: form.name });
        navigate(`${base}/produits`);
    };

    const catObj = categories.find((c) => c.id === form.category);

    return (
        <form onSubmit={submit} className="grid lg:grid-cols-[1fr_360px] gap-5">
            {/* Main form */}
            <div className="space-y-5">
                <div className="bg-card rounded-2xl p-5 md:p-6 shadow-card border border-border/50">
                    <h3 className="font-display text-lg font-medium mb-1">Informations générales</h3>
                    <p className="text-xs text-muted-foreground mb-5">Renseignez les détails principaux du produit.</p>
                    <div className="space-y-4">
                        <div className="space-y-1.5">
                            <Label htmlFor="name">Nom du produit *</Label>
                            <Input id="name" value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Ex : Sac à dos en cuir tressé" />
                        </div>
                        <div className="grid sm:grid-cols-2 gap-4">
                            <div className="space-y-1.5">
                                <Label>Catégorie *</Label>
                                <Select value={form.category} onValueChange={(v) => set("category", v)}>
                                    <SelectTrigger><SelectValue placeholder="Choisir une catégorie" /></SelectTrigger>
                                    <SelectContent>
                                        {categories.map((c) => (
                                            <SelectItem key={c.id} value={c.id}>
                                                <span className="flex items-center gap-2">
                                                    <i className={`fa-solid ${c.icon} text-primary text-xs`} />
                                                    {c.name}
                                                </span>
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-1.5">
                                <Label htmlFor="badge">Badge (optionnel)</Label>
                                <Select value={form.badge} onValueChange={(v) => set("badge", v === "none" ? "" : v)}>
                                    <SelectTrigger><SelectValue placeholder="Aucun" /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="none">Aucun</SelectItem>
                                        <SelectItem value="Nouveauté">Nouveauté</SelectItem>
                                        <SelectItem value="Bestseller">Bestseller</SelectItem>
                                        <SelectItem value="Édition limitée">Édition limitée</SelectItem>
                                        <SelectItem value="Promo">Promo</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="desc">Description</Label>
                            <Textarea
                                id="desc"
                                rows={4}
                                value={form.description}
                                onChange={(e) => set("description", e.target.value)}
                                placeholder="Décrivez les matériaux, avantages, dimensions…"
                            />
                        </div>
                    </div>
                </div>

                <div className="bg-card rounded-2xl p-5 md:p-6 shadow-card border border-border/50">
                    <h3 className="font-display text-lg font-medium mb-1">Prix</h3>
                    <p className="text-xs text-muted-foreground mb-5">Prix en francs CFA (F).</p>
                    <div className="grid sm:grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                            <Label htmlFor="price">Prix de vente *</Label>
                            <div className="relative">
                                <Input id="price" type="number" min="0" step="500" value={form.price} onChange={(e) => set("price", e.target.value)} placeholder="25000" className="pr-10" />
                                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">F</span>
                            </div>
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="oldPrice">Prix barré (optionnel)</Label>
                            <div className="relative">
                                <Input id="oldPrice" type="number" min="0" step="500" value={form.oldPrice} onChange={(e) => set("oldPrice", e.target.value)} placeholder="35000" className="pr-10" />
                                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">F</span>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="bg-card rounded-2xl p-5 md:p-6 shadow-card border border-border/50">
                    <h3 className="font-display text-lg font-medium mb-1">Image du produit</h3>
                    <p className="text-xs text-muted-foreground mb-5">Choisissez une image depuis nos exemples ou collez une URL.</p>
                    <div className="space-y-4">
                        <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                            {SAMPLE_IMAGES.map((src) => (
                                <button
                                    type="button"
                                    key={src}
                                    onClick={() => set("image", src)}
                                    className={`aspect-square rounded-lg overflow-hidden bg-muted border-2 transition-all ${form.image === src ? "border-primary scale-95" : "border-transparent"}`}
                                >
                                    <img src={src} alt="" className="h-full w-full object-cover" />
                                </button>
                            ))}
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="image-url">Ou URL personnalisée</Label>
                            <div className="relative">
                                <ImagePlus className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                <Input id="image-url" value={form.image} onChange={(e) => set("image", e.target.value)} placeholder="https://…" className="pl-9" />
                            </div>
                        </div>
                    </div>
                </div>

                <div className="bg-card rounded-2xl p-5 md:p-6 shadow-card border border-border/50">
                    <h3 className="font-display text-lg font-medium mb-1">Variantes (optionnel)</h3>
                    <p className="text-xs text-muted-foreground mb-4">Sélectionnez les couleurs disponibles.</p>
                    <div className="flex flex-wrap gap-2">
                        {PALETTE.map((c) => (
                            <button
                                key={c}
                                type="button"
                                onClick={() => toggleColor(c)}
                                className={`h-10 w-10 rounded-full border-2 transition-all ${form.colors.includes(c) ? "border-primary scale-110" : "border-border"}`}
                                style={{ background: c }}
                                aria-label={c}
                            />
                        ))}
                    </div>
                </div>

                <div className="bg-card rounded-2xl p-5 md:p-6 shadow-card border border-border/50 flex items-center justify-between">
                    <div>
                        <p className="font-medium text-sm">Publier immédiatement</p>
                        <p className="text-xs text-muted-foreground mt-0.5">Le produit sera visible sur la boutique dès l'enregistrement.</p>
                    </div>
                    <Switch checked={form.active} onCheckedChange={(v) => set("active", v)} />
                </div>
            </div>

            {/* Preview */}
            <aside className="space-y-4">
                <div className="sticky top-24 space-y-4">
                    <div className="bg-card rounded-2xl p-5 shadow-card border border-border/50">
                        <p className="text-xs uppercase tracking-widest text-muted-foreground mb-3 flex items-center gap-2">
                            <Sparkles className="h-3.5 w-3.5 text-primary" />
                            Aperçu en direct
                        </p>
                        <div className="aspect-[4/5] rounded-xl overflow-hidden bg-muted relative mb-3">
                            {form.image ? (
                                <img src={form.image} alt="" className="h-full w-full object-cover" />
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

                    <div className="flex flex-col gap-2">
                        <Button type="submit" size="lg" className="bg-primary hover:bg-primary/90 text-primary-foreground shadow-warm rounded-full h-12">
                            <Upload className="h-4 w-4" /> Publier le produit
                        </Button>
                        <Button type="button" variant="outline" size="lg" onClick={() => navigate(`${base}/produits`)} className="rounded-full">
                            Annuler
                        </Button>
                    </div>
                </div>
            </aside>
        </form>
    );
}
