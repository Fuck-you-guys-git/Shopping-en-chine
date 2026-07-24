import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { LayoutDashboard, Package, PlusCircle, ShoppingBag, Store, Bell, Search, LogOut } from "lucide-react";
import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Menu } from "lucide-react";
import { SellerProvider, useSeller } from "@/context/SellerContext";
import { useSellerAuth } from "@/context/SellerAuthContext";
import { toast } from "sonner";

const useBase = () => {
    const { pathname } = useLocation();
    return pathname.startsWith("/admin") ? "/admin" : "/vendeur";
};

const buildNav = (base) => [
    { to: base, end: true, icon: LayoutDashboard, label: "Tableau de bord" },
    { to: `${base}/commandes`, icon: ShoppingBag, label: "Commandes", badge: true },
    { to: `${base}/produits`, icon: Package, label: "Produits" },
    { to: `${base}/ajouter`, icon: PlusCircle, label: "Ajouter un produit" },
];

const SidebarContent = ({ onNavigate }) => {
    const { orders, liveEvents } = useSeller();
    const { user, logout } = useSellerAuth();
    const navigate = useNavigate();
    const base = useBase();
    const nav = useMemo(() => buildNav(base), [base]);
    const activeCount = orders.filter((o) => o.status !== "livrée").length;

    const handleLogout = () => {
        logout();
        toast.success("Vous êtes déconnecté");
        navigate(`${base}/login`, { replace: true });
        if (onNavigate) onNavigate();
    };
    return (
        <div className="flex flex-col h-full bg-ink text-ink-foreground">
            <div className="p-6 border-b border-ink-foreground/10">
                <Link to={base} onClick={onNavigate} className="flex items-center gap-2.5">
                    <span className="h-9 w-9 rounded-xl bg-gradient-accent flex items-center justify-center shadow-warm">
                        <Store className="h-4 w-4 text-primary-foreground" />
                    </span>
                    <div className="leading-none">
                        <p className="font-display text-base font-semibold text-ink-foreground">Espace vendeur</p>
                        <p className="text-[10px] uppercase tracking-[0.2em] text-ink-foreground/50 mt-0.5">Shopping en Chine</p>
                    </div>
                </Link>
            </div>
            <nav className="flex-1 p-3 space-y-1">
                {nav.map((item) => (
                    <NavLink
                        key={item.to}
                        to={item.to}
                        end={item.end}
                        onClick={onNavigate}
                        className={({ isActive }) =>
                            `flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                                isActive
                                    ? "bg-primary/15 text-primary"
                                    : "text-ink-foreground/70 hover:bg-ink-foreground/5 hover:text-ink-foreground"
                            }`
                        }
                    >
                        <item.icon className="h-4 w-4" />
                        <span className="flex-1">{item.label}</span>
                        {item.badge && activeCount > 0 && (
                            <span className="min-w-5 h-5 px-1.5 rounded-full bg-primary text-primary-foreground text-[10px] font-semibold flex items-center justify-center">
                                {activeCount}
                            </span>
                        )}
                    </NavLink>
                ))}
            </nav>

            {/* Live event feed */}
            <div className="p-4 border-t border-ink-foreground/10">
                <div className="flex items-center gap-2 mb-3 text-xs uppercase tracking-widest text-ink-foreground/50">
                    <span className="relative flex h-2 w-2">
                        <span className="absolute inline-flex h-full w-full rounded-full bg-success opacity-75 animate-ping" />
                        <span className="relative inline-flex h-2 w-2 rounded-full bg-success" />
                    </span>
                    Activité en direct
                </div>
                <div className="space-y-2 max-h-40 overflow-y-auto no-scrollbar">
                    {liveEvents.length === 0 && (
                        <p className="text-xs text-ink-foreground/40 italic">En attente d&apos;activité…</p>
                    )}
                    {liveEvents.slice(0, 4).map((e, i) => (
                        <div key={i} className="text-xs text-ink-foreground/70 leading-snug">
                            {e.type === "new" ? (
                                <>
                                    <span className="text-primary font-medium">Nouvelle commande</span>
                                    <br />
                                    <span className="text-ink-foreground/50">{e.customer} · {e.city}</span>
                                </>
                            ) : (
                                <>
                                    <span className="text-success font-medium">{e.id}</span>
                                    <br />
                                    <span className="text-ink-foreground/50">{e.customer} → {e.status}</span>
                                </>
                            )}
                        </div>
                    ))}
                </div>
            </div>

            <div className="p-4 border-t border-ink-foreground/10">
                <button
                    type="button"
                    onClick={handleLogout}
                    className="flex items-center gap-2 text-xs text-ink-foreground/60 hover:text-primary w-full"
                >
                    <LogOut className="h-3.5 w-3.5" />
                    Se déconnecter
                </button>
                <Link to="/" onClick={onNavigate} className="flex items-center gap-2 text-xs text-ink-foreground/40 hover:text-ink-foreground/70 mt-2">
                    <i className="fa-solid fa-arrow-left text-[10px]" />
                    Retour à la boutique
                </Link>
            </div>
        </div>
    );
};

const LayoutInner = () => {
    const location = useLocation();
    const navigate = useNavigate();
    const base = useBase();
    const [mobileOpen, setMobileOpen] = useState(false);
    const { user, logout } = useSellerAuth();
    const titles = {
        [base]: "Tableau de bord",
        [`${base}/commandes`]: "Commandes en temps réel",
        [`${base}/produits`]: "Mes produits",
        [`${base}/ajouter`]: "Ajouter un produit",
        [`${base}/orders`]: "Commandes en temps réel",
        [`${base}/products`]: "Mes produits",
        [`${base}/add`]: "Ajouter un produit",
    };
    const pageTitle = titles[location.pathname] || "Espace vendeur";

    return (
        <div className="min-h-screen flex bg-secondary/30">
            {/* Desktop sidebar */}
            <aside className="hidden lg:flex w-72 shrink-0 border-r border-border">
                <SidebarContent />
            </aside>

            <div className="flex-1 flex flex-col min-w-0">
                {/* Top bar */}
                <header className="sticky top-0 z-30 bg-background/80 backdrop-blur-xl border-b border-border">
                    <div className="flex items-center gap-4 px-4 md:px-8 h-16">
                        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
                            <SheetTrigger asChild>
                                <Button variant="ghost" size="icon" className="lg:hidden -ml-2">
                                    <Menu className="h-5 w-5" />
                                </Button>
                            </SheetTrigger>
                            <SheetContent side="left" className="w-72 p-0 bg-ink border-ink">
                                <SidebarContent onNavigate={() => setMobileOpen(false)} />
                            </SheetContent>
                        </Sheet>

                        <div className="flex-1">
                            <h1 className="font-display text-xl sm:text-2xl font-medium tracking-tight">{pageTitle}</h1>
                        </div>

                        <div className="hidden md:flex relative">
                            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                            <Input placeholder="Rechercher…" className="pl-9 h-9 w-[240px] bg-muted/50 border-transparent" />
                        </div>
                        <Button variant="ghost" size="icon" className="relative">
                            <Bell className="h-5 w-5" />
                            <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-primary animate-pulse" />
                        </Button>
                        <div className="hidden sm:flex items-center gap-2 pl-3 border-l border-border">
                            <div className="h-8 w-8 rounded-full bg-gradient-accent flex items-center justify-center text-primary-foreground text-xs font-semibold">
                                {(user?.name || "SC").split(" ").map((n) => n[0]).join("").slice(0, 2)}
                            </div>
                            <div className="text-xs leading-tight">
                                <p className="font-medium">{user?.name || "Vendeur"}</p>
                                <p className="text-muted-foreground">{user?.role || "Vendeur Pro"}</p>
                            </div>
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 ml-1 text-muted-foreground hover:text-destructive"
                                onClick={() => {
                                    logout();
                                    toast.success("Vous êtes déconnecté");
                                    navigate(`${base}/login`, { replace: true });
                                }}
                                title="Se déconnecter"
                            >
                                <LogOut className="h-4 w-4" />
                            </Button>
                        </div>
                    </div>
                </header>

                <main className="flex-1 p-4 md:p-8 min-w-0">
                    <Outlet />
                </main>
            </div>
        </div>
    );
};

export default function SellerLayout() {
    return (
        <SellerProvider>
            <LayoutInner />
        </SellerProvider>
    );
}
