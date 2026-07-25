import { useState, useEffect } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { Search, ShoppingBag, User, Menu, Heart, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet";
import { Logo } from "@/components/Logo";
import { useCart } from "@/context/CartContext";
import { categories, modeSubcategories } from "@/data/products";

const navLinks = [
    { to: "/", label: "Accueil" },
    { to: "/boutique", label: "Boutique" },
    { to: "/boutique/mode", label: "Mode", subs: modeSubcategories },
    { to: "/boutique/tech", label: "Électronique" },
    { to: "/boutique/maison", label: "Maison" },
    { to: "/suivi", label: "Suivi de colis" },
];

export const Navbar = () => {
    const { count, setDrawerOpen } = useCart();
    const [scrolled, setScrolled] = useState(false);
    const [query, setQuery] = useState("");
    const [searchOpen, setSearchOpen] = useState(false);
    const [menuOpen, setMenuOpen] = useState(false);
    const navigate = useNavigate();

    useEffect(() => {
        const onScroll = () => setScrolled(window.scrollY > 12);
        window.addEventListener("scroll", onScroll);
        return () => window.removeEventListener("scroll", onScroll);
    }, []);

    const submitSearch = (e) => {
        e.preventDefault();
        if (!query.trim()) return;
        navigate(`/boutique?q=${encodeURIComponent(query)}`);
        setSearchOpen(false);
    };

    return (
        <>
            {/* announcement bar */}
            <div className="bg-ink text-ink-foreground text-xs">
                <div className="container mx-auto flex items-center justify-between py-2 px-5">
                    <p className="hidden sm:block opacity-80">
                        <i className="fa-solid fa-truck-fast mr-2" />
                        Livraison Chine → Dakar en 10–20 jours · Offerte dès 30 000 F
                    </p>
                    <div className="flex items-center gap-4 opacity-80 mx-auto sm:mx-0">
                        <span>FR · F CFA</span>
                        <span className="hidden sm:inline">Service client 7j/7</span>
                        <Link to="/admin" className="hidden sm:inline-flex items-center gap-1.5 text-ink-foreground hover:text-primary transition-colors font-medium">
                            <i className="fa-solid fa-store text-[10px]" />
                            Espace vendeur
                        </Link>
                    </div>
                </div>
            </div>

            <header
                className={`sticky top-0 z-40 w-full transition-all duration-300 ${
                    scrolled
                        ? "bg-background/85 backdrop-blur-xl border-b border-border shadow-soft"
                        : "bg-background border-b border-transparent"
                }`}
            >
                <div className="container mx-auto px-5">
                    <div className="flex h-16 items-center justify-between gap-4">
                        <div className="flex items-center gap-8">
                            {/* mobile menu */}
                            <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
                                <SheetTrigger asChild>
                                    <Button variant="ghost" size="icon" className="lg:hidden -ml-2" data-testid="mobile-menu-trigger">
                                        <Menu className="h-5 w-5" />
                                    </Button>
                                </SheetTrigger>
                                <SheetContent side="left" className="w-[300px] p-0 flex flex-col">
                                    <SheetTitle className="sr-only">Menu de navigation</SheetTitle>
                                    <div className="p-6 border-b">
                                        <Logo />
                                    </div>
                                    <nav className="p-4 space-y-1 flex-1 overflow-y-auto" data-testid="mobile-menu-list">
                                        {[
                                            { to: "/", label: "Accueil", icon: "fa-house" },
                                            { to: "/boutique", label: "Boutique", icon: "fa-store" },
                                            ...categories.map((c) => ({ to: `/boutique/${c.id}`, label: c.name, icon: c.icon })),
                                        ].map((l) => (
                                            <div key={l.to}>
                                                <NavLink
                                                    to={l.to}
                                                    end={l.to === "/"}
                                                    onClick={() => setMenuOpen(false)}
                                                    className={({ isActive }) =>
                                                        `flex items-center justify-between pl-2 pr-3 py-3 rounded-lg text-sm font-medium transition-colors ${
                                                            isActive
                                                                ? "bg-primary/10 text-primary"
                                                                : "text-foreground hover:bg-muted"
                                                        }`
                                                    }
                                                >
                                                    <span className="flex items-center gap-3">
                                                        <i className={`fa-solid ${l.icon} text-primary text-xs w-4 text-center shrink-0`} />
                                                        <span className="leading-none">{l.label}</span>
                                                    </span>
                                                    <i className="fa-solid fa-chevron-right text-xs opacity-40" />
                                                </NavLink>
                                                {l.to === "/boutique/mode" && (
                                                    <div className="ml-7 border-l border-border pl-3 my-1 space-y-0.5" data-testid="mobile-mode-submenu">
                                                        {modeSubcategories.map((s) => (
                                                            <Link
                                                                key={s.id}
                                                                to={`/boutique/mode?sub=${s.id}`}
                                                                data-testid={`mobile-mode-sub-${s.id}`}
                                                                onClick={() => setMenuOpen(false)}
                                                                className="flex items-center gap-2.5 py-2 pl-1 pr-3 rounded-lg text-[13px] text-foreground/70 hover:bg-muted hover:text-foreground transition-colors"
                                                            >
                                                                <i className={`fa-solid ${s.icon} text-primary/70 text-[10px] w-3.5 text-center shrink-0`} />
                                                                {s.name}
                                                            </Link>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        ))}
                                    </nav>
                                    <div className="p-4 border-t mt-auto">
                                        <Link
                                            to="/suivi"
                                            data-testid="mobile-menu-tracking-link"
                                            onClick={() => setMenuOpen(false)}
                                            className="flex items-center justify-center gap-2 w-full h-11 rounded-full bg-ink text-ink-foreground text-sm font-medium hover:bg-ink/90 transition-colors"
                                        >
                                            <i className="fa-solid fa-truck-fast text-xs" />
                                            Suivi de commande
                                        </Link>
                                    </div>
                                </SheetContent>
                            </Sheet>

                            <Logo />
                        </div>

                        {/* desktop nav */}
                        <nav className="hidden lg:flex items-center gap-1">
                            {navLinks.map((l) => (
                                <div key={l.to} className="relative group">
                                    <NavLink
                                        to={l.to}
                                        end={l.to === "/"}
                                        className={({ isActive }) =>
                                            `relative px-4 py-2 text-sm font-medium transition-colors inline-flex items-center gap-1 ${
                                                isActive
                                                    ? "text-primary"
                                                    : "text-foreground/70 hover:text-foreground"
                                            }`
                                        }
                                    >
                                        {({ isActive }) => (
                                            <>
                                                {l.label}
                                                {l.subs && <i className="fa-solid fa-chevron-down text-[9px] opacity-50 mt-0.5" />}
                                                {isActive && (
                                                    <span className="absolute left-1/2 -translate-x-1/2 -bottom-0.5 h-1 w-1 rounded-full bg-primary" />
                                                )}
                                            </>
                                        )}
                                    </NavLink>
                                    {l.subs && (
                                        <div className="absolute left-0 top-full pt-2 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-opacity z-50" data-testid="desktop-mode-submenu">
                                            <div className="w-52 bg-background border border-border rounded-xl shadow-soft p-2">
                                                {l.subs.map((s) => (
                                                    <Link
                                                        key={s.id}
                                                        to={`${l.to}?sub=${s.id}`}
                                                        data-testid={`desktop-mode-sub-${s.id}`}
                                                        className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-foreground/80 hover:bg-muted hover:text-foreground transition-colors"
                                                    >
                                                        <i className={`fa-solid ${s.icon} text-primary text-xs w-4 text-center`} />
                                                        {s.name}
                                                    </Link>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </nav>

                        <div className="flex items-center gap-1">
                            {/* desktop search */}
                            <form onSubmit={submitSearch} className="hidden md:flex relative">
                                <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                                <Input
                                    value={query}
                                    onChange={(e) => setQuery(e.target.value)}
                                    placeholder="Rechercher..."
                                    className="pl-9 h-9 w-[220px] bg-muted/50 border-transparent focus-visible:bg-background focus-visible:border-border"
                                />
                            </form>
                            <Button variant="ghost" size="icon" className="md:hidden" onClick={() => setSearchOpen(true)}>
                                <Search className="h-5 w-5" />
                            </Button>
                            <Button variant="ghost" size="icon" className="hidden sm:inline-flex">
                                <Heart className="h-5 w-5" />
                            </Button>
                            <Button variant="ghost" size="icon" className="hidden sm:inline-flex">
                                <User className="h-5 w-5" />
                            </Button>
                            <Button
                                variant="ghost"
                                size="icon"
                                className="relative"
                                onClick={() => setDrawerOpen(true)}
                                aria-label="Panier"
                            >
                                <ShoppingBag className="h-5 w-5" />
                                {count > 0 && (
                                    <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-semibold flex items-center justify-center">
                                        {count}
                                    </span>
                                )}
                            </Button>
                        </div>
                    </div>

                    {/* mobile search overlay */}
                    {searchOpen && (
                        <div className="md:hidden pb-3">
                            <form onSubmit={submitSearch} className="relative">
                                <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                                <Input
                                    autoFocus
                                    value={query}
                                    onChange={(e) => setQuery(e.target.value)}
                                    placeholder="Que cherchez-vous ?"
                                    className="pl-9 pr-9 h-10 bg-muted/50"
                                />
                                <button type="button" onClick={() => setSearchOpen(false)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                                    <X className="h-4 w-4" />
                                </button>
                            </form>
                        </div>
                    )}
                </div>
            </header>
        </>
    );
};
