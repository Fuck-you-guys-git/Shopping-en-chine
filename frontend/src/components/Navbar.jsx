import { useState, useEffect } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { ShoppingBag, Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet";
import { Logo } from "@/components/Logo";
import { SearchBar } from "@/components/SearchBar";
import { useCart } from "@/context/CartContext";
import { categories } from "@/data/products";
import { t } from "@/lib/locale";
import { useLocale } from "@/context/LocaleContext";

const mobileNav = [
    { to: "/", label: "Accueil", icon: "fa-house", end: true },
    { to: "/boutique", label: "Tous les produits", icon: "fa-store", end: true },
    ...categories.map((c) => ({ to: `/boutique/${c.id}`, label: c.name, icon: c.icon })),
    { to: "/achat-en-gros", label: "Achat en gros", icon: "fa-boxes-stacked" },
];

export const Navbar = () => {
    const { count, setDrawerOpen } = useCart();
    const { preset } = useLocale(); // langue/devise auto (géo IP), re-render au changement
    const { pathname } = useLocation();
    // Pas de recherche dans le tunnel de paiement : on ne détourne pas le client.
    const hideSearch = pathname === "/commande";
    const [scrolled, setScrolled] = useState(false);
    const [menuOpen, setMenuOpen] = useState(false);

    useEffect(() => {
        const onScroll = () => setScrolled(window.scrollY > 8);
        onScroll();
        window.addEventListener("scroll", onScroll, { passive: true });
        return () => window.removeEventListener("scroll", onScroll);
    }, []);

    const cartButton = (
        <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            data-testid="navbar-cart-btn"
            aria-label={`${t("Panier")}${count > 0 ? ` (${count})` : ""}`}
            className="relative inline-flex h-10 items-center gap-2 rounded-full border border-border bg-background px-3.5 text-sm font-semibold text-foreground transition-colors duration-200 hover:border-foreground/25 hover:bg-muted sm:px-4"
        >
            <ShoppingBag className="h-[18px] w-[18px]" aria-hidden="true" />
            <span className="hidden lg:inline">{t("Panier")}</span>
            {count > 0 && (
                <span
                    data-testid="navbar-cart-count"
                    className="absolute -right-1 -top-1 flex h-[19px] min-w-[19px] items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground"
                >
                    {count}
                </span>
            )}
        </button>
    );

    return (
        <>
            {/* Bandeau d'annonce */}
            <div className="bg-ink text-ink-foreground text-xs">
                <div className="container mx-auto flex items-center justify-between gap-4 px-5 py-2">
                    <p className="hidden sm:block opacity-80">
                        <i className="fa-solid fa-truck-fast mr-2" aria-hidden="true" />
                        {t("Livraison de la Chine vers le monde entier · 10–20 jours")}
                    </p>
                    <div className="mx-auto flex items-center gap-4 opacity-90 sm:mx-0">
                        <span className="inline-flex items-center gap-1.5 font-medium" data-testid="locale-indicator">
                            <span className="text-sm leading-none">{preset.flag}</span>
                            <span>{preset.short}</span>
                        </span>
                        <Link
                            to="/admin"
                            className="hidden items-center gap-1.5 font-medium opacity-80 transition-colors hover:text-primary sm:inline-flex"
                        >
                            <i className="fa-solid fa-store text-[10px]" aria-hidden="true" />
                            {t("Espace vendeur")}
                        </Link>
                    </div>
                </div>
            </div>

            <header
                data-testid="site-header"
                className={`sticky top-0 z-40 w-full bg-background transition-shadow duration-300 ${
                    scrolled ? "border-b border-border shadow-soft" : "border-b border-border"
                }`}
            >
                {/* Ligne principale */}
                <div className="container mx-auto px-5">
                    <div
                        className={`flex items-center justify-between gap-3 transition-all duration-300 md:gap-8 ${
                            scrolled ? "h-14" : "h-16"
                        }`}
                    >
                        <div className="flex items-center gap-2">
                            <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
                                <SheetTrigger asChild>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="-ml-2"
                                        data-testid="mobile-menu-trigger"
                                        aria-label={t("Ouvrir le menu")}
                                    >
                                        <Menu className="h-5 w-5" />
                                    </Button>
                                </SheetTrigger>
                                <SheetContent side="left" className="flex w-[300px] flex-col p-0">
                                    <SheetTitle className="sr-only">Menu de navigation</SheetTitle>
                                    <div className="border-b border-border p-5">
                                        <Logo />
                                    </div>
                                    <nav className="flex-1 space-y-0.5 overflow-y-auto p-3" data-testid="mobile-menu-list">
                                        {mobileNav.map((l) => (
                                            <NavLink
                                                key={l.to}
                                                to={l.to}
                                                end={l.end}
                                                onClick={() => setMenuOpen(false)}
                                                className={({ isActive }) =>
                                                    `flex items-center justify-between rounded-lg py-3 pl-3 pr-3 text-sm font-medium transition-colors ${
                                                        isActive ? "bg-primary/10 text-primary" : "text-foreground hover:bg-muted"
                                                    }`
                                                }
                                            >
                                                <span className="flex items-center gap-3">
                                                    <i className={`fa-solid ${l.icon} w-4 shrink-0 text-center text-xs text-primary`} aria-hidden="true" />
                                                    <span className="leading-none">{t(l.label)}</span>
                                                </span>
                                                <i className="fa-solid fa-chevron-right text-xs opacity-40" aria-hidden="true" />
                                            </NavLink>
                                        ))}
                                    </nav>
                                    <div className="mt-auto border-t border-border p-4">
                                        <Link
                                            to="/suivi"
                                            data-testid="mobile-menu-tracking-link"
                                            onClick={() => setMenuOpen(false)}
                                            className="flex h-11 w-full items-center justify-center gap-2 rounded-full bg-ink text-sm font-semibold text-ink-foreground transition-opacity hover:opacity-90"
                                        >
                                            <i className="fa-solid fa-truck-fast text-xs" aria-hidden="true" />
                                            {t("Suivi de commande")}
                                        </Link>
                                    </div>
                                </SheetContent>
                            </Sheet>

                            <Logo />
                        </div>

                        {/* Recherche desktop — élément central du header */}
                        {hideSearch ? (
                            <div className="hidden flex-1 md:block" />
                        ) : (
                            <div className="hidden min-w-0 flex-1 md:block">
                                <SearchBar testId="navbar-search-input" className="max-w-2xl" />
                            </div>
                        )}

                        {cartButton}
                    </div>
                </div>

                {/* Recherche mobile — toujours accessible, sous le logo */}
                {!hideSearch && (
                    <div className="border-t border-border px-5 py-2.5 md:hidden">
                        <SearchBar size="md" testId="navbar-mobile-search-input" />
                    </div>
                )}
            </header>
        </>
    );
};
