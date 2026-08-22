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
import { SkeletonGrid } from "@/components/SkeletonCard";
import { EmptyState } from "@/components/EmptyState";
import { usePageTitle } from "@/hooks/usePageTitle";
import { productMatchesQuery } from "@/lib/search";
import { t, fmtAmount, unitAmount } from "@/lib/locale";

export default function Products() {
    const { categoryId } = useParams();
    const { products, loaded } = useCatalog();
    const [searchParams] = useSearchParams();
    const searchQuery = searchParams.get("q") || "";
    const subId = searchParams.get("sub") || "";
    const categorySubs = subcategoriesByCategory[categoryId] || [];
    const activeSub = categorySubs.find((s) => s.id === subId);

    const [priceRange, setPriceRange] = useState(null); // null = aucun filtre prix
    const [selectedCats, setSelectedCats] = useState(categoryId ? [categoryId] : []);
    const [sortBy, setSortBy] = useState("pertinence");

    const activeCategory = categories.find((c) => c.id === categoryId);
    usePageTitle(
        activeSub ? activeSub.name : activeCategory ? activeCategory.name : "Boutique",
        "Livraison de la Chine vers le monde entier en 10 à 20 jours. Paiement Mobile Money et carte bancaire.",
    );

    const toggleCat = (id) =>
        setSelectedCats((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

    // Compteurs RÉELS par catégorie (jamais de valeur inventée)
    const catCounts = useMemo(() => {
        const acc = {};
        products.forEach((p) => { acc[p.category] = (acc[p.category] || 0) + 1; });
        return acc;
    }, [products]);

    // Filtre prix exprimé dans la devise RÉELLEMENT affichée (aucune conversion) :
    // les bornes sont dérivées du catalogue courant.
    const displayPrice = (p) => {
        const u = unitAmount(p);
        return u != null ? u : Number(p?.price) || 0;
    };
    const maxPrice = useMemo(() => {
        const vals = products.map(displayPrice).filter((v) => v > 0);
        return vals.length ? Math.ceil(Math.max(...vals)) : 0;
    }, [products]);
    const range = priceRange ?? [0, maxPrice];
    const priceActive = priceRange !== null && maxPrice > 0 && (range[0] > 0 || range[1] < maxPrice);
    const resetFilters = () => { setSelectedCats([]); setPriceRange(null); };

    const filtered = useMemo(() => {
        let list = products;
        if (priceActive) {
            list = list.filter((p) => {
                const v = displayPrice(p);
                return v >= range[0] && v <= range[1];
            });
        }
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
                list = [...list].sort((a, b) => displayPrice(a) - displayPrice(b)); break;
            case "prix-desc":
                list = [...list].sort((a, b) => displayPrice(b) - displayPrice(a)); break;
            case "nouveautes":
                break; // l'API renvoie déjà les produits du plus récent au plus ancien
            default: break;
        }
        return list;
    }, [products, priceRange, maxPrice, selectedCats, categoryId, sortBy, searchQuery, activeSub]);

    // JSX simple (pas un composant imbriqué : évite le re-montage à chaque rendu)
    const filtersPanel = (
        <div className="space-y-8">
            <div>
                <h4 className="font-display text-lg mb-4">{t("Catégories")}</h4>
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
                                    {t(c.name)}
                                </span>
                                <span className="text-xs text-muted-foreground">{catCounts[c.id] > 0 ? catCounts[c.id] : ""}</span>
                            </Label>
                        </div>
                    ))}
                </div>
            </div>

            {maxPrice > 0 && (
                <div>
                    <h4 className="mb-4 text-base font-bold">{t("Prix")}</h4>
                    <Slider
                        value={range}
                        onValueChange={setPriceRange}
                        min={0}
                        max={maxPrice}
                        step={Math.max(1, Math.round(maxPrice / 100))}
                        className="mb-3"
                        data-testid="price-filter-slider"
                    />
                    <div className="flex justify-between text-sm text-muted-foreground">
                        <span data-testid="price-filter-min">{fmtAmount(range[0])}</span>
                        <span data-testid="price-filter-max">{fmtAmount(range[1])}</span>
                    </div>
                </div>
            )}
        </div>
    );

    return (
        <div className="container mx-auto px-5 py-10 md:py-14">
            {/* Breadcrumb + Title */}
            <div className="mb-8 md:mb-12">
                <nav className="text-xs text-muted-foreground mb-3">
                    <Link to="/" className="hover:text-foreground">{t("Accueil")}</Link>
                    <span className="mx-2">/</span>
                    <Link to="/boutique" className="hover:text-foreground">{t("Boutique")}</Link>
                    {activeCategory && (
                        <>
                            <span className="mx-2">/</span>
                            <span className="text-foreground">{t(activeCategory.name)}</span>
                        </>
                    )}
                </nav>
                <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                    <div>
                        <h1 className="font-display text-2xl sm:text-3xl lg:text-4xl font-medium tracking-tight">
                            {activeSub ? t(activeSub.name) : activeCategory ? t(activeCategory.name) : searchQuery ? `« ${searchQuery} »` : t("Toute la boutique")}
                        </h1>
                        <p className="text-muted-foreground mt-2" data-testid="products-count">
                            {filtered.length} {filtered.length > 1 ? t("produits") : t("produit")}
                        </p>
                    </div>
                    <div className="flex items-center gap-2">
                        <Sheet>
                            <SheetTrigger asChild>
                                <Button variant="outline" className="lg:hidden rounded-full">
                                    <SlidersHorizontal className="h-4 w-4 mr-2" /> {t("Filtres")}
                                </Button>
                            </SheetTrigger>
                            <SheetContent side="left" className="w-[300px] overflow-y-auto">
                                <SheetHeader><SheetTitle>{t("Filtres")}</SheetTitle></SheetHeader>
                                <div className="mt-6">{filtersPanel}</div>
                            </SheetContent>
                        </Sheet>
                        <Select value={sortBy} onValueChange={setSortBy}>
                            <SelectTrigger className="w-[200px] rounded-full">
                                <SelectValue placeholder={t("Trier par")} />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="pertinence">{t("Pertinence")}</SelectItem>
                                <SelectItem value="nouveautes">{t("Nouveautés")}</SelectItem>
                                <SelectItem value="prix-asc">{t("Prix croissant")}</SelectItem>
                                <SelectItem value="prix-desc">{t("Prix décroissant")}</SelectItem>
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
                            {t("Tout")}
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
                                {t(s.name)}
                            </Link>
                        ))}
                    </div>
                )}

                {(selectedCats.length > 0 || priceActive) && (
                    <div className="flex flex-wrap items-center gap-2 mt-4" data-testid="active-filters">
                        {selectedCats.map((id) => {
                            const c = categories.find((x) => x.id === id);
                            return (
                                <Badge key={id} variant="secondary" className="rounded-full px-3 py-1 gap-1">
                                    {t(c?.name)}
                                    <button onClick={() => toggleCat(id)} aria-label={t("Retirer ce filtre")}><X className="h-3 w-3" /></button>
                                </Badge>
                            );
                        })}
                        {priceActive && (
                            <Badge variant="secondary" className="rounded-full px-3 py-1 gap-1">
                                {fmtAmount(range[0])}–{fmtAmount(range[1])}
                                <button onClick={() => setPriceRange(null)} aria-label={t("Retirer ce filtre")}><X className="h-3 w-3" /></button>
                            </Badge>
                        )}
                        <button onClick={resetFilters} data-testid="clear-filters-btn" className="text-xs text-primary hover:underline ml-2">{t("Effacer tout")}</button>
                    </div>
                )}
            </div>

            <div className="grid lg:grid-cols-[240px_1fr] gap-10">
                {/* Desktop sidebar */}
                <aside className="hidden lg:block">
                    <div className="sticky top-24">
                        <div className="flex items-center gap-2 mb-6">
                            <Filter className="h-4 w-4" />
                            <h3 className="font-medium">{t("Filtres")}</h3>
                        </div>
                        {filtersPanel}
                    </div>
                </aside>

                <div>
                    {!loaded ? (
                        <SkeletonGrid count={8} className="lg:grid-cols-3 xl:grid-cols-4" />
                    ) : filtered.length === 0 ? (
                        <EmptyState
                            icon="fa-magnifying-glass"
                            title={t("Aucun produit trouvé")}
                            description={t("Essayez d'ajuster vos filtres ou de modifier votre recherche.")}
                            ctaLabel={t("Réinitialiser les filtres")}
                            onCta={resetFilters}
                            testId="products-empty"
                        />
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
