import { Link } from "react-router-dom";
import { ArrowRight, Sparkles, ShieldCheck, Truck, RotateCcw, HeadphonesIcon, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ProductCard } from "@/components/ProductCard";
import { categories, products, testimonials } from "@/data/products";

const brands = ["Vogue", "L'Équipe", "Le Monde", "Elle", "Les Échos", "Numerama", "Konbini"];

const benefits = [
    { icon: Truck, title: "Livraison rapide", desc: "En 2–4 jours partout en France" },
    { icon: RotateCcw, title: "Retours 30 jours", desc: "Sans question, sans stress" },
    { icon: ShieldCheck, title: "Paiement sécurisé", desc: "3D Secure & cryptage SSL" },
    { icon: HeadphonesIcon, title: "Service client", desc: "7 jours / 7, en français" },
];

export default function Home() {
    const featured = products.slice(0, 8);

    return (
        <div>
            {/* HERO */}
            <section className="relative overflow-hidden bg-gradient-hero grain">
                <div className="container mx-auto px-5 pt-12 pb-20 md:pt-20 md:pb-28 relative">
                    <div className="grid lg:grid-cols-12 gap-10 lg:gap-16 items-center">
                        <div className="lg:col-span-6 space-y-7 relative z-10">
                            <Badge className="bg-primary/10 text-primary hover:bg-primary/10 border-0 rounded-full px-4 py-1.5 font-medium">
                                <Sparkles className="h-3 w-3 mr-1.5" />
                                Nouvelle collection Printemps
                            </Badge>
                            <h1 className="font-display text-4xl sm:text-5xl lg:text-6xl xl:text-7xl font-medium leading-[1.02] tracking-tight text-balance">
                                Tout ce que vous cherchez,
                                <span className="block italic text-primary">plus simple.</span>
                            </h1>
                            <p className="text-base sm:text-lg text-muted-foreground max-w-lg leading-relaxed text-pretty">
                                De la Chine à votre porte — mode, tech, maison, beauté. Des milliers de produits soigneusement sélectionnés, livrés vite et bien.
                            </p>
                            <div className="flex flex-wrap gap-3">
                                <Button asChild size="lg" className="bg-ink hover:bg-ink/90 text-ink-foreground rounded-full h-12 px-7 shadow-lift">
                                    <Link to="/boutique">Découvrir la boutique <ArrowRight className="ml-1 h-4 w-4" /></Link>
                                </Button>
                                <Button asChild variant="outline" size="lg" className="rounded-full h-12 px-7 bg-background/60 backdrop-blur border-foreground/15 hover:bg-background">
                                    <Link to="/boutique/tech">Voir les nouveautés</Link>
                                </Button>
                            </div>

                            <div className="flex items-center gap-6 pt-4">
                                <div className="flex -space-x-2">
                                    {testimonials.map((t) => (
                                        <img key={t.name} src={t.avatar} alt={t.name} className="h-9 w-9 rounded-full border-2 border-background object-cover" />
                                    ))}
                                </div>
                                <div className="text-sm">
                                    <div className="flex items-center gap-1">
                                        {[...Array(5)].map((_, i) => (
                                            <Star key={i} className="h-3.5 w-3.5 fill-primary stroke-primary" />
                                        ))}
                                        <span className="ml-1 font-semibold">4.9/5</span>
                                    </div>
                                    <p className="text-xs text-muted-foreground">+ 24 000 clients satisfaits</p>
                                </div>
                            </div>
                        </div>

                        {/* Hero collage */}
                        <div className="lg:col-span-6 relative">
                            <div className="relative aspect-[4/5] lg:aspect-[5/6] max-w-lg mx-auto">
                                {/* Main image */}
                                <div className="absolute inset-0 rounded-3xl overflow-hidden shadow-lift">
                                    <img
                                        src="https://images.unsplash.com/photo-1534452203293-494d7ddbf7e0?w=1200&q=85"
                                        alt="Shopping en Chine"
                                        className="h-full w-full object-cover"
                                    />
                                    <div className="absolute inset-0 bg-gradient-to-t from-ink/40 via-transparent to-transparent" />
                                </div>

                                {/* Floating card 1 — price */}
                                <div className="absolute -left-4 lg:-left-8 top-8 bg-background rounded-2xl shadow-lift p-4 w-48 float-slow">
                                    <div className="flex items-center gap-3">
                                        <img src={products[3].image} alt="" className="h-12 w-12 rounded-lg object-cover" />
                                        <div>
                                            <p className="text-xs text-muted-foreground">Bestseller</p>
                                            <p className="text-sm font-medium leading-tight">{products[3].name}</p>
                                            <p className="text-xs font-display font-semibold text-primary mt-0.5">74 €</p>
                                        </div>
                                    </div>
                                </div>

                                {/* Floating card 2 — delivery */}
                                <div className="absolute -right-4 lg:-right-6 bottom-14 bg-background rounded-2xl shadow-lift p-4 w-56 float-slow" style={{ animationDelay: "1.5s" }}>
                                    <div className="flex items-center gap-3">
                                        <div className="h-10 w-10 rounded-full bg-success/10 flex items-center justify-center">
                                            <Truck className="h-5 w-5 text-success" />
                                        </div>
                                        <div>
                                            <p className="text-xs text-muted-foreground">Livraison</p>
                                            <p className="text-sm font-medium">Offerte dès 49 €</p>
                                        </div>
                                    </div>
                                </div>

                                {/* Floating badge */}
                                <div className="absolute right-6 top-6 h-20 w-20 rounded-full bg-primary text-primary-foreground flex flex-col items-center justify-center font-display shadow-warm rotate-12">
                                    <span className="text-[10px] uppercase tracking-widest">Jusqu'à</span>
                                    <span className="text-2xl font-bold leading-none">−40%</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* PRESS MARQUEE */}
            <section className="border-y border-border py-6 overflow-hidden bg-background">
                <div className="marquee text-muted-foreground">
                    {[...brands, ...brands].map((b, i) => (
                        <div key={i} className="flex items-center gap-3 text-lg font-display italic whitespace-nowrap opacity-60">
                            <span>{b}</span>
                            <i className="fa-solid fa-circle text-[4px]" />
                        </div>
                    ))}
                </div>
            </section>

            {/* CATEGORIES */}
            <section className="container mx-auto px-5 py-20 md:py-28">
                <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-12">
                    <div>
                        <p className="text-xs uppercase tracking-[0.25em] text-primary font-semibold mb-3">Catégories</p>
                        <h2 className="font-display text-3xl sm:text-4xl lg:text-5xl font-medium tracking-tight max-w-xl text-balance">
                            Explorez notre univers en un clic
                        </h2>
                    </div>
                    <Button asChild variant="ghost" className="self-start md:self-end -mx-4 md:mx-0">
                        <Link to="/boutique">Voir tout <ArrowRight className="ml-1 h-4 w-4" /></Link>
                    </Button>
                </div>

                {/* Bento layout for categories */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
                    {categories.slice(0, 5).map((cat, i) => (
                        <Link
                            key={cat.id}
                            to={`/boutique/${cat.id}`}
                            className={`group relative overflow-hidden rounded-2xl bg-muted flex flex-col justify-end p-5 ${
                                i === 0 ? "md:col-span-2 md:row-span-2 aspect-square md:aspect-auto" : "aspect-square"
                            }`}
                        >
                            <img
                                src={cat.image}
                                alt={cat.name}
                                loading="lazy"
                                className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
                            />
                            <div className="absolute inset-0 bg-gradient-to-t from-ink/85 via-ink/25 to-transparent" />
                            <div className="relative z-10 text-ink-foreground">
                                <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-ink-foreground/70 mb-1">
                                    <i className={`fa-solid ${cat.icon}`} />
                                    <span>{cat.count.toLocaleString("fr-FR")} articles</span>
                                </div>
                                <h3 className="font-display text-2xl md:text-3xl font-medium">{cat.name}</h3>
                                <div className="mt-2 inline-flex items-center text-sm gap-1 opacity-90 group-hover:gap-2 transition-all">
                                    Découvrir <ArrowRight className="h-3.5 w-3.5" />
                                </div>
                            </div>
                        </Link>
                    ))}
                </div>
            </section>

            {/* FEATURED PRODUCTS */}
            <section className="container mx-auto px-5 py-20 md:py-28">
                <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-12">
                    <div>
                        <p className="text-xs uppercase tracking-[0.25em] text-primary font-semibold mb-3">Sélection maison</p>
                        <h2 className="font-display text-3xl sm:text-4xl lg:text-5xl font-medium tracking-tight max-w-xl text-balance">
                            Les coups de cœur <span className="italic">de la semaine</span>
                        </h2>
                    </div>
                    <Button asChild variant="outline" className="rounded-full self-start md:self-end">
                        <Link to="/boutique">Voir tout <ArrowRight className="ml-1 h-4 w-4" /></Link>
                    </Button>
                </div>

                <div className="grid grid-cols-2 lg:grid-cols-4 gap-x-4 gap-y-10 md:gap-x-6 md:gap-y-12">
                    {featured.map((p, i) => (
                        <ProductCard key={p.id} product={p} index={i} />
                    ))}
                </div>
            </section>

            {/* PROMO BANNER */}
            <section className="container mx-auto px-5">
                <div className="relative overflow-hidden rounded-3xl bg-ink text-ink-foreground p-10 md:p-16 grid md:grid-cols-2 gap-10 items-center">
                    <div className="absolute -top-20 -right-20 h-64 w-64 rounded-full bg-primary/30 blur-3xl" />
                    <div className="absolute -bottom-24 -left-16 h-64 w-64 rounded-full bg-accent/20 blur-3xl" />
                    <div className="relative">
                        <Badge className="bg-primary text-primary-foreground border-0 rounded-full px-4 py-1.5 hover:bg-primary">
                            ⭐ Offre limitée
                        </Badge>
                        <h2 className="font-display text-3xl sm:text-4xl lg:text-5xl mt-4 leading-tight">
                            −30% sur toute la Tech
                            <span className="block italic text-primary-glow">jusqu'à dimanche.</span>
                        </h2>
                        <p className="mt-4 text-ink-foreground/70 max-w-md">
                            Casques, accessoires, gadgets connectés. Nos meilleurs prix, sans code nécessaire.
                        </p>
                        <Button asChild size="lg" className="mt-6 bg-primary hover:bg-primary/90 text-primary-foreground rounded-full h-12 px-7">
                            <Link to="/boutique/tech">Profiter de l'offre <ArrowRight className="ml-1 h-4 w-4" /></Link>
                        </Button>
                    </div>
                    <div className="relative grid grid-cols-2 gap-4">
                        <div className="aspect-square rounded-2xl overflow-hidden bg-secondary">
                            <img src={products[0].image} alt="" className="h-full w-full object-cover" />
                        </div>
                        <div className="aspect-square rounded-2xl overflow-hidden bg-secondary mt-8">
                            <img src={products[4].image} alt="" className="h-full w-full object-cover" />
                        </div>
                    </div>
                </div>
            </section>

            {/* BENEFITS */}
            <section className="container mx-auto px-5 py-20 md:py-28">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-6 md:gap-8">
                    {benefits.map((b) => (
                        <div key={b.title} className="flex flex-col gap-3">
                            <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
                                <b.icon className="h-5 w-5" />
                            </div>
                            <h3 className="font-display text-lg font-medium">{b.title}</h3>
                            <p className="text-sm text-muted-foreground leading-relaxed">{b.desc}</p>
                        </div>
                    ))}
                </div>
            </section>

            {/* TESTIMONIALS */}
            <section className="bg-secondary/50">
                <div className="container mx-auto px-5 py-20 md:py-28">
                    <div className="text-center max-w-2xl mx-auto mb-14">
                        <p className="text-xs uppercase tracking-[0.25em] text-primary font-semibold mb-3">Témoignages</p>
                        <h2 className="font-display text-3xl sm:text-4xl lg:text-5xl font-medium tracking-tight text-balance">
                            Ils shoppent, ils recommandent.
                        </h2>
                    </div>
                    <div className="grid md:grid-cols-3 gap-6">
                        {testimonials.map((t) => (
                            <div key={t.name} className="bg-background rounded-2xl p-8 shadow-soft flex flex-col">
                                <div className="flex gap-0.5 mb-4">
                                    {[...Array(t.rating)].map((_, i) => (
                                        <Star key={i} className="h-4 w-4 fill-primary stroke-primary" />
                                    ))}
                                </div>
                                <blockquote className="font-display text-lg leading-snug text-balance flex-1">
                                    « {t.text} »
                                </blockquote>
                                <div className="mt-6 flex items-center gap-3">
                                    <img src={t.avatar} alt={t.name} className="h-11 w-11 rounded-full object-cover" />
                                    <div>
                                        <p className="font-medium text-sm">{t.name}</p>
                                        <p className="text-xs text-muted-foreground">{t.city}</p>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* CTA FINAL */}
            <section className="container mx-auto px-5 py-20 md:py-28">
                <div className="relative text-center max-w-3xl mx-auto">
                    <h2 className="font-display text-4xl sm:text-5xl lg:text-6xl font-medium leading-[1.05] tracking-tight text-balance">
                        Prêt à trouver ce que vous cherchez ?
                    </h2>
                    <p className="mt-5 text-lg text-muted-foreground max-w-xl mx-auto text-pretty">
                        Rejoignez plus de 24 000 clients qui simplifient leur shopping avec nous.
                    </p>
                    <div className="mt-8 flex flex-wrap gap-3 justify-center">
                        <Button asChild size="lg" className="bg-primary hover:bg-primary/90 text-primary-foreground rounded-full h-12 px-8 shadow-warm">
                            <Link to="/boutique">Commencer maintenant</Link>
                        </Button>
                        <Button asChild variant="outline" size="lg" className="rounded-full h-12 px-8">
                            <Link to="/boutique/mode">Voir les nouveautés</Link>
                        </Button>
                    </div>
                </div>
            </section>
        </div>
    );
}
