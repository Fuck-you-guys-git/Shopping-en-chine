import { useState } from "react";
import { useNavigate, useLocation, Link, Navigate } from "react-router-dom";
import { Store, Mail, Lock, Eye, EyeOff, ArrowRight, ShieldCheck, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { useSellerAuth } from "@/context/SellerAuthContext";
import { toast } from "sonner";

export default function SellerLogin() {
    const { login, isAuthenticated } = useSellerAuth();
    const navigate = useNavigate();
    const location = useLocation();
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [remember, setRemember] = useState(true);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    const base = location.pathname.startsWith("/admin") ? "/admin" : "/vendeur";
    const from = location.state?.from?.pathname || base;

    if (isAuthenticated) {
        return <Navigate to={from} replace />;
    }

    const onSubmit = async (e) => {
        e.preventDefault();
        setError("");
        setLoading(true);
        try {
            await login(email, password);
            toast.success("Connexion réussie ✦", { description: "Bienvenue dans votre espace vendeur" });
            navigate(from, { replace: true });
        } catch (err) {
            setError(err.message);
            toast.error("Échec de connexion", { description: err.message });
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen grid lg:grid-cols-2">
            {/* Left — login form */}
            <div className="flex flex-col justify-center px-6 md:px-12 lg:px-16 py-10 bg-background">
                <div className="max-w-md w-full mx-auto">
                    <Link to="/" className="inline-flex items-center gap-2.5 mb-10">
                        <span className="h-10 w-10 rounded-xl bg-gradient-accent flex items-center justify-center shadow-warm">
                            <Store className="h-4 w-4 text-primary-foreground" />
                        </span>
                        <div className="leading-none">
                            <p className="font-display text-base font-semibold">Shopping <span className="text-primary">en Chine</span></p>
                            <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground mt-0.5">Espace vendeur</p>
                        </div>
                    </Link>

                    <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 text-primary text-xs font-medium mb-6">
                        <ShieldCheck className="h-3.5 w-3.5" />
                        Zone privée · Accès restreint
                    </div>

                    <h1 className="font-display text-3xl sm:text-4xl font-medium tracking-tight leading-tight">
                        Connexion vendeur
                    </h1>
                    <p className="text-muted-foreground mt-2 text-sm">
                        Entrez vos identifiants pour accéder à votre tableau de bord.
                    </p>

                    <form onSubmit={onSubmit} className="mt-8 space-y-5">
                        <div className="space-y-1.5">
                            <Label htmlFor="email">Adresse email</Label>
                            <div className="relative">
                                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                <Input
                                    id="email"
                                    type="email"
                                    data-testid="seller-login-email"
                                    autoComplete="email"
                                    required
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    className="pl-10 h-11"
                                />
                            </div>
                        </div>

                        <div className="space-y-1.5">
                            <div className="flex items-center justify-between">
                                <Label htmlFor="password">Mot de passe</Label>
                            </div>
                            <div className="relative">
                                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                <Input
                                    id="password"
                                    type={showPassword ? "text" : "password"}
                                    data-testid="seller-login-password"
                                    autoComplete="current-password"
                                    required
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    placeholder="••••••••"
                                    className="pl-10 pr-10 h-11"
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword((v) => !v)}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                                    aria-label={showPassword ? "Masquer" : "Afficher"}
                                >
                                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                </button>
                            </div>
                        </div>

                        <div className="flex items-center gap-2">
                            <Checkbox id="remember" checked={remember} onCheckedChange={setRemember} />
                            <Label htmlFor="remember" className="text-sm font-normal cursor-pointer">Rester connecté sur cet appareil</Label>
                        </div>

                        {error && (
                            <div className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2">
                                {error}
                            </div>
                        )}

                        <Button
                            type="submit"
                            size="lg"
                            disabled={loading}
                            data-testid="seller-login-submit"
                            className="w-full bg-ink text-ink-foreground hover:bg-ink/90 rounded-full h-12 shadow-lift"
                        >
                            {loading ? (
                                <>
                                    <span className="h-4 w-4 border-2 border-ink-foreground/40 border-t-ink-foreground rounded-full animate-spin" />
                                    Connexion…
                                </>
                            ) : (
                                <>
                                    Se connecter <ArrowRight className="ml-1 h-4 w-4" />
                                </>
                            )}
                        </Button>
                    </form>

                    <p className="mt-6 text-xs text-center text-muted-foreground">
                        L&apos;accès à cette zone est réservé au propriétaire de la boutique.
                        <br />
                        <Link to="/" className="text-primary hover:underline">← Retour à la boutique</Link>
                    </p>
                </div>
            </div>

            {/* Right — hero panel */}
            <div className="relative hidden lg:block overflow-hidden bg-ink text-ink-foreground">
                <div className="absolute -top-32 -right-16 h-96 w-96 rounded-full bg-primary/30 blur-3xl" />
                <div className="absolute -bottom-40 -left-20 h-96 w-96 rounded-full bg-accent/20 blur-3xl" />
                <div className="relative h-full flex flex-col justify-between p-12 xl:p-16">
                    <div>
                        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-ink-foreground/10 text-xs font-medium">
                            <span className="relative flex h-2 w-2">
                                <span className="absolute inline-flex h-full w-full rounded-full bg-success opacity-75 animate-ping" />
                                <span className="relative inline-flex h-2 w-2 rounded-full bg-success" />
                            </span>
                            Suivi en temps réel
                        </div>
                        <h2 className="font-display text-4xl xl:text-5xl leading-[1.1] tracking-tight mt-8 text-balance">
                            Gérez votre boutique <span className="italic text-primary-glow">en toute simplicité.</span>
                        </h2>
                        <p className="mt-6 text-ink-foreground/70 max-w-md leading-relaxed">
                            Produits, commandes, statistiques — tout au même endroit. Recevez chaque nouvelle vente en direct.
                        </p>
                    </div>

                    <div className="grid grid-cols-2 gap-4 max-w-md">
                        <div className="bg-ink-foreground/5 backdrop-blur border border-ink-foreground/10 rounded-2xl p-5">
                            <div className="h-9 w-9 rounded-xl bg-primary/20 flex items-center justify-center text-primary-glow mb-3">
                                <TrendingUp className="h-4 w-4" />
                            </div>
                            <p className="text-2xl font-display font-semibold">+12.4%</p>
                            <p className="text-xs text-ink-foreground/60 mt-0.5">Croissance mensuelle</p>
                        </div>
                        <div className="bg-ink-foreground/5 backdrop-blur border border-ink-foreground/10 rounded-2xl p-5">
                            <div className="h-9 w-9 rounded-xl bg-success/20 flex items-center justify-center text-success mb-3">
                                <ShieldCheck className="h-4 w-4" />
                            </div>
                            <p className="text-2xl font-display font-semibold">100%</p>
                            <p className="text-xs text-ink-foreground/60 mt-0.5">Sécurisé SSL</p>
                        </div>
                    </div>

                    <blockquote className="max-w-md">
                        <p className="font-display italic text-lg text-ink-foreground/80 leading-snug">
                            « Depuis que j&apos;utilise le tableau de bord, je gagne 2h par jour. Interface fluide, prise en main immédiate. »
                        </p>
                        <footer className="mt-3 text-xs text-ink-foreground/50">
                            — Aminata D., Vendeuse partenaire · Dakar
                        </footer>
                    </blockquote>
                </div>
            </div>
        </div>
    );
}
