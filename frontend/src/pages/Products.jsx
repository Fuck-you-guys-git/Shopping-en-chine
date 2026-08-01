import { useMemo, useState } from "react";
import { useParams, useSearchParams, Link } from "react-router-dom";
import { Filter, SlidersHorizontal, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetTrigger, SheetTitle, SheetHeader } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ProductCard } from "@/components/ProductCard";
import { categories, subcategoriesByCategory } from "@/data/products";
import { useCatalog } from "@/context/CatalogContext";
import { usePageTitle } from "@/hooks/usePageTitle";
import { productMatchesQuery } from "@/lib/search";

export default function Products() {
    const { categoryId } = useParams();
    const { products } = useCatalog();
    const [searchParams] = useSearchParams();
    const searchQuery = searchParams.get("q") || "";
    const subId = searchParams.get("sub") || "";
    const categorySubs = subcategoriesByCategory[categoryId] || [];
    const activeSub = categorySubs.find((s) => s.id === subId);

    const [priceRange, setPriceRange] = useState([0, 200000]);
    const [selectedCats, setSelectedCats] = useState(categoryId ? [categoryId] : []);
    const [sortBy, setSortBy] = useState("pertinence");

    const activeCategory = categories.find((c) => c.id === categoryId);
    usePageTitle(
        activeSub ? activeSub.name : activeCategory ? activeCategory.name : "Boutique",
        "Livraison Chine → Dakar en 10 à 20 jours. Paiement Mobile Money et carte bancaire.",
    );

    const toggleCat = (id) =>
        setSelectedCats((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

    const filtered = useMemo(() => {
        let list = products.filter(
            (p) => p.price >= priceRange[0] && (priceRange[1] >= 200000 || p.price <= priceRange[1]),
        );
        if (selectedCats.length) {
            list = list.filter((p) => selectedCats.includes(p.category));
        } else if (categoryId) {
            list = list.filter((p) => p.category === categoryId);
        }
        if (activeSub) {
            list = list.filter((p) =>
                p.subcategory === activeSub.id ||
                activeSub.keywords.some((k) => (p.name || "").toLowerCase().includes(k)),
            );
        }
        if (searchQuery) {
            list = list.filter((p) => productMatchesQuery(p, searchQuery));
        }
        switch (sortBy) {
            case "prix-asc":
                list = [...list].sort((a, b) => a.price - b.price); break;
            case "prix-desc":
                list = [...list].sort((a, b) => b.price - a.price); break;
            default: break;
        }
        return list;
    }, [products, priceRange, selectedCats, categoryId, sortBy, searchQuery, activeSub]);

    const FiltersPanel = () => (
        <div className="space-y-8">
            <div>
                <h4 className="font-display text-lg mb-4">Catégories</h4>
                <div className="space-y-3">
                    {categories.map((c) => (
                        <div key={c.id} className="flex items-center gap-3">
                            <Checkbox
                                id={`c-${c.id}`}
                                checked={selectedCats.includes(c.id)}
                                onCheckedChange={() => toggleCat(c.id)}
                            />
                            <Label htmlFor={`c-${c.id}`} className="flex-1 flex items-center justify-between cursor-pointer font-normal">
                                <span className="flex items-center gap-2">
                                    <i className={`fa-solid ${c.icon} text-primary text-xs w-4`} />
                                    {c.name}
                                </span>
                                <span className="text-xs text-muted-foreground">{c.count.toLocaleString("fr-FR")}</span>
                            </Label>
                        </div>
                    ))}
                </div>
            </div>

            <div>
                <h4 className="font-display text-lg mb-4">Prix</h4>
                <Slider
                    value={priceRange}
                    onValueChange={setPriceRange}
                    min={0}
                    max={200000}
                    step={1000}
                    className="mb-3"
                />
                <div className="flex justify-between text-sm text-muted-foreground">
                    <span>{new Intl.NumberFormat("fr-FR").format(priceRange[0])} F</span>
                    <span>{priceRange[1] >= 200000 ? "200 000 F et +" : `${new Intl.NumberFormat("fr-FR").format(priceRange[1])} F`}</span>
                </div>
            </div>
        </div>
    );

    return (
        <div className="container mx-auto px-5 py-10 md:py-14">
            {/* Breadcrumb + Title */}
            <div className="mb-8 md:mb-12">
                <nav className="text-xs text-muted-foreground mb-3">
                    <Link to="/" className="hover:text-foreground">Accueil</Link>
                    <span className="mx-2">/</span>
                    <Link to="/boutique" className="hover:text-foreground">Boutique</Link>
                    {activeCategory && (
                        <>
                            <span className="mx-2">/</span>
                            <span className="text-foreground">{activeCategory.name}</span>
                        </>
                    )}
                </nav>
                <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                    <div>
                        <h1 className="font-display text-2xl sm:text-3xl lg:text-4xl font-medium tracking-tight">
                            {activeSub ? activeSub.name : activeCategory ? activeCategory.name : searchQuery ? `« ${searchQuery} »` : "Toute la boutique"}
                        </h1>
                        <p className="text-muted-foreground mt-2">
                            {filtered.length} produit{filtered.length > 1 ? "s" : ""} · trié{filtered.length > 1 ? "s" : ""} pour vous
                        </p>
                    </div>
                    <div className="flex items-center gap-2">
                        <Sheet>
                            <SheetTrigger asChild>
                                <Button variant="outline" className="lg:hidden rounded-full">
                                    <SlidersHorizontal className="h-4 w-4 mr-2" /> Filtres
                                </Button>
                            </SheetTrigger>
                            <SheetContent side="left" className="w-[300px] overflow-y-auto">
                                <SheetHeader><SheetTitle>Filtres</SheetTitle></SheetHeader>
                                <div className="mt-6"><FiltersPanel /></div>
                            </SheetContent>
                        </Sheet>
                        <Select value={sortBy} onValueChange={setSortBy}>
                            <SelectTrigger className="w-[200px] rounded-full">
                                <SelectValue placeholder="Trier par" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="pertinence">Pertinence</SelectItem>
                                <SelectItem value="prix-asc">Prix croissant</SelectItem>
                                <SelectItem value="prix-desc">Prix décroissant</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </div>

                {/* Sous-catégories */}
                {categorySubs.length > 0 && (
                    <div className="flex flex-wrap items-center gap-2 mt-5" data-testid="subcategory-pills">
                        <Link
                            to={`/boutique/${categoryId}`}
                            className={`px-3.5 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                                !activeSub ? "bg-primary text-primary-foreground border-primary" : "bg-card border-border text-foreground/70 hover:border-primary/40 hover:text-foreground"
                            }`}
                        >
                            Tout
                        </Link>
                        {categorySubs.map((s) => (
                            <Link
                                key={s.id}
                                to={`/boutique/${categoryId}?sub=${s.id}`}
                                data-testid={`sub-pill-${s.id}`}
                                className={`px-3.5 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                                    activeSub?.id === s.id ? "bg-primary text-primary-foreground border-primary" : "bg-card border-border text-foreground/70 hover:border-primary/40 hover:text-foreground"
                                }`}
                            >
                                {s.name}
                            </Link>
                        ))}
                    </div>
                )}

                {(selectedCats.length > 0 || priceRange[0] > 0 || priceRange[1] < 200000) && (
                    <div className="flex flex-wrap items-center gap-2 mt-4">
                        {selectedCats.map((id) => {
                            const c = categories.find((x) => x.id === id);
                            return (
                                <Badge key={id} variant="secondary" className="rounded-full px-3 py-1 gap-1">
                                    {c?.name}
                                    <button onClick={() => toggleCat(id)}><X className="h-3 w-3" /></button>
                                </Badge>
                            );
                        })}
                        {(priceRange[0] > 0 || priceRange[1] < 200000) && (
                            <Badge variant="secondary" className="rounded-full px-3 py-1 gap-1">
                                {new Intl.NumberFormat("fr-FR").format(priceRange[0])}–{new Intl.NumberFormat("fr-FR").format(priceRange[1])} F
                                <button onClick={() => setPriceRange([0, 200000])}><X className="h-3 w-3" /></button>
                            </Badge>
                        )}
                        <button onClick={() => { setSelectedCats([]); setPriceRange([0, 200000]); }} className="text-xs text-primary hover:underline ml-2">Effacer tout</button>
                    </div>
                )}
            </div>

            <div className="grid lg:grid-cols-[240px_1fr] gap-10">
                {/* Desktop sidebar */}
                <aside className="hidden lg:block">
                    <div className="sticky top-24">
                        <div className="flex items-center gap-2 mb-6">
                            <Filter className="h-4 w-4" />
                            <h3 className="font-medium">Filtres</h3>
                        </div>
                        <FiltersPanel />
                    </div>
                </aside>

                <div>
                    {filtered.length === 0 ? (
                        <div className="text-center py-24 border-2 border-dashed border-border rounded-2xl">
                            <div className="text-5xl mb-4 opacity-40">🌿</div>
                            <h3 className="font-display text-xl mb-2">Aucun produit trouvé</h3>
                            <p className="text-muted-foreground text-sm mb-6">Essayez d&apos;ajuster vos filtres.</p>
                            <Button onClick={() => { setSelectedCats([]); setPriceRange([0, 200000]); }} variant="outline" className="rounded-full">
                                Réinitialiser les filtres
                            </Button>
                        </div>
                    ) : (
                        <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-x-4 gap-y-10 md:gap-x-6 md:gap-y-12">
                            {filtered.map((p, i) => (
                                <ProductCard key={p.id} product={p} index={i} />
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
