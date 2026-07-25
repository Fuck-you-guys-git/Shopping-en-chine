import { Link } from "react-router-dom";
import { ArrowRight, Truck, ShieldCheck, HeadphonesIcon, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ProductCard } from "@/components/ProductCard";
import { categories } from "@/data/products";
import { useCatalog } from "@/context/CatalogContext";
import { useNavigate } from "react-router-dom";
import { useState } from "react";

const benefits = [
    { icon: Truck, title: "Livraison Chine → Dakar", desc: "En 15–20 jours" },
    { icon: ShieldCheck, title: "Paiement sécurisé", desc: "Mobile Money (Wave, Orange, MTN)" },
    { icon: HeadphonesIcon, title: "Service client", desc: "7 jours / 7, en français" },
];

export default function Home() {
    const navigate = useNavigate();
    const { products } = useCatalog();
    const [query, setQuery] = useState("");

    const onSearch = (e) => {
        e.preventDefault();
        if (query.trim()) navigate(`/boutique?q=${encodeURIComponent(query)}`);
    };

    return (
        <div>
            {/* COMPACT HERO — direct access to products */}
            <section className="bg-gradient-hero border-b border-border">
                <div className="container mx-auto px-5 pt-8 pb-6 md:pt-10 md:pb-8">
                    <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-5">
                        <div className="max-w-2xl">
                            <h1 className="font-display text-3xl sm:text-4xl md:text-5xl font-medium leading-tight tracking-tight">
                                Shopping en Chine
                                <span className="block italic text-primary text-2xl sm:text-3xl md:text-4xl mt-1">Tout, plus simple.</span>
                            </h1>
                            <p className="mt-2 text-sm md:text-base text-muted-foreground">
                                Livraison Chine → Dakar en 15–20 jours · Paiement Mobile Money
                            </p>
                        </div>
                        <form onSubmit={onSearch} className="relative w-full md:w-96 shrink-0">
                            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                                placeholder="Que cherchez-vous ?"
                                className="pl-11 h-12 rounded-full bg-background border-border shadow-soft"
                            />
                            <Button type="submit" size="sm" className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-full h-9 bg-primary hover:bg-primary/90">
                                Chercher
                            </Button>
                        </form>
                    </div>

                    {/* Category chips — quick filter */}
                    <div className="mt-6 flex gap-2 overflow-x-auto no-scrollbar -mx-5 px-5 pb-1">
                        <Link
                            to="/boutique"
                            className="shrink-0 px-4 py-2 rounded-full bg-ink text-ink-foreground text-sm font-medium hover:opacity-90"
                        >
                            Tout voir
                        </Link>
                        {categories.map((c) => (
                            <Link
                                key={c.id}
                                to={`/boutique/${c.id}`}
                                className="shrink-0 px-4 py-2 rounded-full bg-background border border-border text-sm font-medium text-foreground hover:border-primary hover:text-primary transition-colors flex items-center gap-2"
                            >
                                <i className={`fa-solid ${c.icon} text-xs text-primary`} />
                                {c.name}
                            </Link>
                        ))}
                    </div>
                </div>
            </section>

            {/* PRODUCTS — immediately visible */}
            <section className="container mx-auto px-5 pt-8 pb-6">
                <div className="flex items-baseline justify-between gap-4 mb-6">
                    <h2 className="font-display text-2xl sm:text-3xl font-medium tracking-tight">
                        Produits populaires
                    </h2>
                    <Button asChild variant="ghost" size="sm" className="text-primary">
                        <Link to="/boutique">Voir tout <ArrowRight className="ml-1 h-4 w-4" /></Link>
                    </Button>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-4 gap-y-8 md:gap-x-6 md:gap-y-10">
                    {products.slice(0, 8).map((p, i) => (
                        <ProductCard key={p.id} product={p} index={i} />
                    ))}
                </div>
            </section>

            {/* PROMO STRIP */}
            <section className="container mx-auto px-5 my-10">
                <div className="relative overflow-hidden rounded-2xl bg-ink text-ink-foreground p-6 md:p-10 flex flex-col md:flex-row items-center gap-6">
                    <div className="absolute -top-16 -right-10 h-48 w-48 rounded-full bg-primary/30 blur-3xl" />
                    <Badge className="bg-primary text-primary-foreground border-0 rounded-full px-3 py-1 hover:bg-primary shrink-0">
                        ⭐ Offre limitée
                    </Badge>
                    <div className="flex-1 text-center md:text-left">
                        <h3 className="font-display text-2xl md:text-3xl leading-tight">
                            −30% sur l&apos;Électrique <span className="italic text-primary-glow">jusqu&apos;à dimanche</span>
                        </h3>
                        <p className="text-sm text-ink-foreground/70 mt-1">Casques, gadgets, accessoires connectés.</p>
                    </div>
                    <Button asChild size="lg" className="bg-primary hover:bg-primary/90 text-primary-foreground rounded-full shrink-0">
                        <Link to="/boutique/tech">Profiter <ArrowRight className="ml-1 h-4 w-4" /></Link>
                    </Button>
                </div>
            </section>

            {/* CATEGORIES */}
            <section className="container mx-auto px-5 py-10">
                <div className="flex items-baseline justify-between gap-4 mb-6">
                    <h2 className="font-display text-2xl sm:text-3xl font-medium tracking-tight">
                        Toutes les catégories
                    </h2>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 md:gap-4">
                    {categories.map((cat) => (
                        <Link
                            key={cat.id}
                            to={`/boutique/${cat.id}`}
                            className="group relative overflow-hidden rounded-2xl bg-muted aspect-square flex flex-col justify-end p-4"
                        >
                            <img
                                src={cat.image}
                                alt={cat.name}
                                loading="lazy"
                                className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                            />
                            <div className="absolute inset-0 bg-gradient-to-t from-ink/85 via-ink/25 to-transparent" />
                            <div className="relative z-10 text-ink-foreground">
                                <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-ink-foreground/70">
                                    <i className={`fa-solid ${cat.icon}`} />
                                    <span>{cat.count.toLocaleString("fr-FR")}</span>
                                </div>
                                <h3 className="font-display text-lg md:text-xl font-medium leading-tight mt-1">
                                    {cat.name}
                                </h3>
                            </div>
                        </Link>
                    ))}
                </div>
            </section>

            {/* MORE PRODUCTS — nouveautés section */}
            <section className="container mx-auto px-5 py-10">
                <div className="flex items-baseline justify-between gap-4 mb-6">
                    <h2 className="font-display text-2xl sm:text-3xl font-medium tracking-tight">
                        Nouveautés de la semaine
                    </h2>
                    <Button asChild variant="ghost" size="sm" className="text-primary">
                        <Link to="/boutique">Voir tout <ArrowRight className="ml-1 h-4 w-4" /></Link>
                    </Button>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-4 gap-y-8 md:gap-x-6 md:gap-y-10">
                    {products.slice(2, 8).reverse().map((p, i) => (
                        <ProductCard key={p.id} product={p} index={i} />
                    ))}
                </div>
            </section>

            {/* BENEFITS */}
            <section className="bg-secondary/40 mt-10 mb-4">
                <div className="container mx-auto px-5 py-10">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 md:gap-8">
                        {benefits.map((b) => (
                            <div key={b.title} className="flex items-start gap-3">
                                <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary shrink-0">
                                    <b.icon className="h-4 w-4" />
                                </div>
                                <div>
                                    <h3 className="font-medium text-sm">{b.title}</h3>
                                    <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{b.desc}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </section>
        </div>
    );
}
