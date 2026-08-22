import { useMemo } from "react";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { ProductCard } from "@/components/ProductCard";
import { SearchBar } from "@/components/SearchBar";
import { TrustBar } from "@/components/TrustBar";
import { CategoryCard } from "@/components/CategoryCard";
import { SectionHeader } from "@/components/SectionHeader";
import { SkeletonGrid } from "@/components/SkeletonCard";
import { EmptyState } from "@/components/EmptyState";
import { categories } from "@/data/products";
import { useCatalog } from "@/context/CatalogContext";
import { usePageTitle } from "@/hooks/usePageTitle";
import { t } from "@/lib/locale";

const GRID = "grid grid-cols-2 gap-x-4 gap-y-8 md:grid-cols-3 md:gap-x-6 md:gap-y-10 lg:grid-cols-4";

export default function Home() {
    const { products, loaded } = useCatalog();
    usePageTitle(
        null,
        "Commandez vos produits directement de Chine, livrés partout dans le monde en 10 à 20 jours. Paiement Mobile Money et carte bancaire.",
    );

    // Toutes les sections sont dérivées des VRAIES données du catalogue.
    const { nouveautes, offres, populaires, autres, catMeta, heroImages } = useMemo(() => {
        const inStock = products.filter((p) => !(p.outOfStock === true || p.stock === 0));
        const base = inStock.length ? inStock : products;
        return {
            nouveautes: base.slice(0, 8),
            offres: base.filter((p) => p.oldPrice && p.oldPrice > p.price).slice(0, 8),
            populaires: base
                .filter((p) => (p.reviews || 0) > 0)
                .sort((a, b) => (b.reviews || 0) * (b.rating || 0) - (a.reviews || 0) * (a.rating || 0))
                .slice(0, 8),
            autres: base.slice(8, 16),
            catMeta: Object.fromEntries(
                categories.map((c) => {
                    const list = products.filter((p) => p.category === c.id);
                    return [c.id, { count: list.length, image: list.find((p) => p.image)?.image || c.image }];
                }),
            ),
            heroImages: base.filter((p) => p.image).slice(0, 3).map((p) => p.image),
        };
    }, [products]);

    return (
        <div>
            {/* ---------------------------------------------- HERO */}
            <section className="bg-gradient-hero border-b border-border">
                <div className="container mx-auto px-5 py-10 md:py-16">
                    <div className="grid items-center gap-10 lg:grid-cols-[1.05fr_0.95fr] lg:gap-16">
                        <div>
                            <span className="inline-flex items-center gap-2 rounded-full border border-border bg-background px-3 py-1.5 text-xs font-semibold text-foreground/80">
                                <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                                {t("Livraison 10–20 jours · Paiement sécurisé")}
                            </span>
                            <h1 className="mt-5 text-4xl font-extrabold leading-[1.05] tracking-tight text-foreground sm:text-5xl lg:text-6xl">
                                {t("Tout ce que vous cherchez.")}
                                <span className="mt-1 block text-primary">{t("Directement depuis la Chine.")}</span>
                            </h1>
                            <p className="mt-5 max-w-xl text-base leading-relaxed text-muted-foreground md:text-lg">
                                {t("Mode, électronique, maison, beauté et bien plus encore — livrés directement chez vous.")}
                            </p>

                            <div className="mt-7 max-w-xl lg:hidden">
                                <SearchBar size="md" testId="home-search-input" />
                            </div>

                            <div className="mt-7 flex flex-wrap items-center gap-3">
                                <Link
                                    to="/boutique"
                                    data-testid="hero-primary-cta"
                                    className="inline-flex h-12 items-center gap-2 rounded-full bg-primary px-7 text-sm font-semibold text-primary-foreground shadow-warm transition-all duration-200 hover:bg-primary/90 hover:shadow-lift"
                                >
                                    {t("Découvrir les produits")}
                                    <ArrowRight className="h-4 w-4" aria-hidden="true" />
                                </Link>
                                <a
                                    href="#nouveautes"
                                    data-testid="hero-secondary-cta"
                                    className="inline-flex h-12 items-center rounded-full border border-border bg-background px-7 text-sm font-semibold text-foreground transition-colors duration-200 hover:border-foreground/25 hover:bg-muted"
                                >
                                    {t("Voir les nouveautés")}
                                </a>
                            </div>
                        </div>

                        {/* Composition visuelle — vraies photos du catalogue */}
                        {heroImages.length >= 3 ? (
                            <div className="hidden grid-cols-2 gap-3 lg:grid" aria-hidden="true">
                                <img
                                    src={heroImages[0]}
                                    alt=""
                                    decoding="async"
                                    className="col-span-1 row-span-2 h-full w-full rounded-2xl bg-muted object-cover shadow-soft"
                                />
                                <img
                                    src={heroImages[1]}
                                    alt=""
                                    decoding="async"
                                    className="aspect-[4/3] w-full rounded-2xl bg-muted object-cover shadow-soft"
                                />
                                <img
                                    src={heroImages[2]}
                                    alt=""
                                    decoding="async"
                                    className="aspect-[4/3] w-full rounded-2xl bg-muted object-cover shadow-soft"
                                />
                            </div>
                        ) : heroImages.length > 0 ? (
                            <div className="hidden lg:block" aria-hidden="true">
                                <img
                                    src={heroImages[0]}
                                    alt=""
                                    decoding="async"
                                    className="aspect-[4/3] w-full rounded-2xl bg-muted object-cover shadow-soft"
                                />
                            </div>
                        ) : null}
                    </div>
                </div>
            </section>

            {/* ---------------------------------------------- CONFIANCE */}
            <TrustBar />

            {/* ---------------------------------------------- CATÉGORIES */}
            <section className="container mx-auto px-5 py-12 md:py-14">
                <SectionHeader
                    title="Explorez nos catégories"
                    subtitle="Trouvez rapidement ce dont vous avez besoin"
                    linkTo="/boutique"
                    testId="categories-header"
                />
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6 md:gap-4">
                    {categories.map((c) => (
                        <CategoryCard
                            key={c.id}
                            category={c}
                            image={catMeta[c.id]?.image}
                            count={catMeta[c.id]?.count}
                        />
                    ))}
                </div>
            </section>

            {/* ---------------------------------------------- NOUVEAUTÉS */}
            <section id="nouveautes" className="container mx-auto scroll-mt-28 px-5 pb-12 md:pb-14">
                <SectionHeader title="Nouveautés" subtitle="Les derniers produits ajoutés" linkTo="/boutique" testId="new-header" />
                {!loaded ? (
                    <SkeletonGrid count={8} />
                ) : nouveautes.length === 0 ? (
                    <EmptyState
                        icon="fa-box-open"
                        title={t("Aucun produit disponible pour le moment")}
                        description={t("Notre catalogue est en cours de mise à jour. Revenez très bientôt.")}
                        testId="home-empty"
                    />
                ) : (
                    <div className={GRID} data-testid="new-products-grid">
                        {nouveautes.map((p, i) => (
                            <ProductCard key={p.id} product={p} index={i} />
                        ))}
                    </div>
                )}
            </section>

            {/* ---------------------------------------------- OFFRES (si remises réelles) */}
            {offres.length > 0 && (
                <section className="bg-surface py-12 md:py-14">
                    <div className="container mx-auto px-5">
                        <SectionHeader title="Offres du moment" subtitle="Prix réduits sur une sélection" linkTo="/boutique" testId="deals-header" />
                        <div className={GRID} data-testid="deals-grid">
                            {offres.map((p, i) => (
                                <ProductCard key={p.id} product={p} index={i} />
                            ))}
                        </div>
                    </div>
                </section>
            )}

            {/* ---------------------------------------------- POPULAIRES (si avis réels) */}
            {populaires.length > 0 && (
                <section className="container mx-auto px-5 py-12 md:py-14">
                    <SectionHeader title="Les plus appréciés" subtitle="Notés par nos clients vérifiés" linkTo="/boutique" testId="popular-header" />
                    <div className={GRID} data-testid="popular-grid">
                        {populaires.map((p, i) => (
                            <ProductCard key={p.id} product={p} index={i} />
                        ))}
                    </div>
                </section>
            )}

            {/* ---------------------------------------------- SUITE DU CATALOGUE */}
            {autres.length > 0 && (
                <section className="container mx-auto px-5 pb-14">
                    <SectionHeader title="Vous pourriez aussi aimer" linkTo="/boutique" testId="more-header" />
                    <div className={GRID} data-testid="more-grid">
                        {autres.map((p, i) => (
                            <ProductCard key={p.id} product={p} index={i} />
                        ))}
                    </div>
                    <div className="mt-10 flex justify-center">
                        <Link
                            to="/boutique"
                            className="inline-flex h-12 items-center gap-2 rounded-full border border-border bg-background px-8 text-sm font-semibold text-foreground transition-colors duration-200 hover:border-foreground/25 hover:bg-muted"
                        >
                            {t("Voir tous les produits")}
                            <ArrowRight className="h-4 w-4" aria-hidden="true" />
                        </Link>
                    </div>
                </section>
            )}
        </div>
    );
}
