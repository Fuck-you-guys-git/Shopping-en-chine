import { useState } from "react";
import { useNavigate, useLocation, Link, Navigate } from "react-router-dom";
import { Store, Mail, Lock, User, Building2, Eye, EyeOff, ArrowRight, ShieldCheck, Sparkles, TrendingUp, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useSellerAuth } from "@/context/SellerAuthContext";
import { toast } from "sonner";

// --- Login form -----------------------------------------------------------
const LoginForm = ({ base, from }) => {
    const { login } = useSellerAuth();
    const navigate = useNavigate();
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [remember, setRemember] = useState(true);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

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

    const fillDemo = () => {
        setEmail("admin@shoppingenchine.com");
        setPassword("shopping2026");
    };

    return (
        <form onSubmit={onSubmit} className="space-y-5">
            <div className="space-y-1.5">
                <Label htmlFor="login-email">Adresse email</Label>
                <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                        id="login-email"
                        type="email"
                        autoComplete="email"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="vous@exemple.com"
                        className="pl-10 h-11"
                    />
                </div>
            </div>

            <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                    <Label htmlFor="login-password">Mot de passe</Label>
                    <button type="button" className="text-xs text-primary hover:underline">Mot de passe oublié ?</button>
                </div>
                <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                        id="login-password"
                        type={showPassword ? "text" : "password"}
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

            <div className="p-4 rounded-xl bg-secondary/50 border border-border">
                <p className="text-xs font-medium text-foreground mb-1 flex items-center gap-1.5">
                    <Sparkles className="h-3 w-3 text-primary" /> Compte démo
                </p>
                <p className="text-xs text-muted-foreground leading-relaxed">
                    Email : <span className="font-mono text-foreground">admin@shoppingenchine.com</span>
                    <br />
                    Mot de passe : <span className="font-mono text-foreground">shopping2026</span>
                </p>
                <button type="button" onClick={fillDemo} className="mt-2 text-xs text-primary hover:underline">
                    Remplir automatiquement →
                </button>
            </div>
        </form>
    );
};

// --- Signup form ----------------------------------------------------------
const SignupForm = ({ base, from }) => {
    const { register } = useSellerAuth();
    const navigate = useNavigate();
    const [form, setForm] = useState({ name: "", shopName: "", email: "", password: "", confirm: "" });
    const [showPassword, setShowPassword] = useState(false);
    const [accept, setAccept] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

    // Password strength meter
    const strength = (() => {
        const p = form.password;
        let s = 0;
        if (p.length >= 6) s++;
        if (p.length >= 10) s++;
        if (/[A-Z]/.test(p) && /[a-z]/.test(p)) s++;
        if (/\d/.test(p) && /[^A-Za-z0-9]/.test(p)) s++;
        return s; // 0..4
    })();
    const strengthLabels = ["Trop court", "Faible", "Moyen", "Bon", "Excellent"];
    const strengthColors = ["bg-muted", "bg-destructive", "bg-amber-500", "bg-blue-500", "bg-success"];

    const onSubmit = async (e) => {
        e.preventDefault();
        setError("");
        if (!accept) {
            setError("Vous devez accepter les conditions d'utilisation");
            return;
        }
        if (form.password !== form.confirm) {
            setError("Les mots de passe ne correspondent pas");
            return;
        }
        setLoading(true);
        try {
            await register({
                name: form.name,
                shopName: form.shopName,
                email: form.email,
                password: form.password,
            });
            toast.success("Compte créé ✦", { description: `Bienvenue ${form.name} !` });
            navigate(from, { replace: true });
        } catch (err) {
            setError(err.message);
            toast.error("Inscription impossible", { description: err.message });
        } finally {
            setLoading(false);
        }
    };

    return (
        <form onSubmit={onSubmit} className="space-y-4">
            <div className="grid sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                    <Label htmlFor="signup-name">Nom complet</Label>
                    <div className="relative">
                        <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                            id="signup-name"
                            required
                            value={form.name}
                            onChange={(e) => set("name", e.target.value)}
                            placeholder="Marie Dupont"
                            className="pl-10 h-11"
                        />
                    </div>
                </div>
                <div className="space-y-1.5">
                    <Label htmlFor="signup-shop">Nom de la boutique</Label>
                    <div className="relative">
                        <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                            id="signup-shop"
                            value={form.shopName}
                            onChange={(e) => set("shopName", e.target.value)}
                            placeholder="Ma Boutique"
                            className="pl-10 h-11"
                        />
                    </div>
                </div>
            </div>

            <div className="space-y-1.5">
                <Label htmlFor="signup-email">Adresse email</Label>
                <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                        id="signup-email"
                        type="email"
                        autoComplete="email"
                        required
                        value={form.email}
                        onChange={(e) => set("email", e.target.value)}
                        placeholder="vous@exemple.com"
                        className="pl-10 h-11"
                    />
                </div>
            </div>

            <div className="space-y-1.5">
                <Label htmlFor="signup-password">Mot de passe</Label>
                <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                        id="signup-password"
                        type={showPassword ? "text" : "password"}
                        autoComplete="new-password"
                        required
                        value={form.password}
                        onChange={(e) => set("password", e.target.value)}
                        placeholder="Min. 6 caractères"
                        className="pl-10 pr-10 h-11"
                    />
                    <button
                        type="button"
                        onClick={() => setShowPassword((v) => !v)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                </div>
                {form.password && (
                    <div className="mt-2 space-y-1">
                        <div className="flex gap-1">
                            {[0, 1, 2, 3].map((i) => (
                                <div key={i} className={`h-1 flex-1 rounded-full ${i < strength ? strengthColors[strength] : "bg-muted"}`} />
                            ))}
                        </div>
                        <p className="text-[11px] text-muted-foreground">
                            Sécurité : <span className="font-medium text-foreground">{strengthLabels[strength]}</span>
                        </p>
                    </div>
                )}
            </div>

            <div className="space-y-1.5">
                <Label htmlFor="signup-confirm">Confirmer le mot de passe</Label>
                <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                        id="signup-confirm"
                        type={showPassword ? "text" : "password"}
                        required
                        value={form.confirm}
                        onChange={(e) => set("confirm", e.target.value)}
                        placeholder="Répétez le mot de passe"
                        className="pl-10 pr-10 h-11"
                    />
                    {form.confirm && form.password === form.confirm && (
                        <Check className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-success" />
                    )}
                </div>
            </div>

            <div className="flex items-start gap-2 pt-1">
                <Checkbox id="accept" checked={accept} onCheckedChange={setAccept} className="mt-0.5" />
                <Label htmlFor="accept" className="text-xs font-normal cursor-pointer text-muted-foreground leading-relaxed">
                    J'accepte les <a href="#" className="text-primary hover:underline">conditions d'utilisation</a> et la <a href="#" className="text-primary hover:underline">politique de confidentialité</a>.
                </Label>
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
                className="w-full bg-primary text-primary-foreground hover:bg-primary/90 rounded-full h-12 shadow-warm"
            >
                {loading ? (
                    <>
                        <span className="h-4 w-4 border-2 border-primary-foreground/40 border-t-primary-foreground rounded-full animate-spin" />
                        Création en cours…
                    </>
                ) : (
                    <>
                        Créer mon compte <ArrowRight className="ml-1 h-4 w-4" />
                    </>
                )}
            </Button>
        </form>
    );
};

// --- Main page ------------------------------------------------------------
export default function SellerLogin() {
    const { isAuthenticated } = useSellerAuth();
    const location = useLocation();
    const [tab, setTab] = useState("login");

    const base = location.pathname.startsWith("/admin") ? "/admin" : "/vendeur";
    const from = location.state?.from?.pathname || base;

    if (isAuthenticated) {
        return <Navigate to={from} replace />;
    }

    return (
        <div className="min-h-screen grid lg:grid-cols-2">
            {/* Left — form */}
            <div className="flex flex-col justify-center px-6 md:px-12 lg:px-16 py-10 bg-background overflow-y-auto">
                <div className="max-w-md w-full mx-auto">
                    <Link to="/" className="inline-flex items-center gap-2.5 mb-8">
                        <span className="h-10 w-10 rounded-xl bg-gradient-accent flex items-center justify-center shadow-warm">
                            <Store className="h-4 w-4 text-primary-foreground" />
                        </span>
                        <div className="leading-none">
                            <p className="font-display text-base font-semibold">Shopping <span className="text-primary">en Chine</span></p>
                            <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground mt-0.5">Espace vendeur</p>
                        </div>
                    </Link>

                    <h1 className="font-display text-3xl sm:text-4xl font-medium tracking-tight leading-tight">
                        {tab === "login" ? "Bon retour parmi nous." : "Créez votre compte."}
                    </h1>
                    <p className="text-muted-foreground mt-2 text-sm">
                        {tab === "login"
                            ? "Connectez-vous pour gérer vos produits, commandes et statistiques."
                            : "Rejoignez la communauté des vendeurs en quelques secondes."}
                    </p>

                    <Tabs value={tab} onValueChange={setTab} className="mt-6">
                        <TabsList className="grid grid-cols-2 w-full h-11 p-1 bg-muted/70">
                            <TabsTrigger value="login" className="data-[state=active]:bg-background data-[state=active]:shadow-soft h-9">
                                Se connecter
                            </TabsTrigger>
                            <TabsTrigger value="signup" className="data-[state=active]:bg-background data-[state=active]:shadow-soft h-9">
                                Créer un compte
                            </TabsTrigger>
                        </TabsList>
                        <TabsContent value="login" className="mt-6">
                            <LoginForm base={base} from={from} />
                        </TabsContent>
                        <TabsContent value="signup" className="mt-6">
                            <SignupForm base={base} from={from} />
                        </TabsContent>
                    </Tabs>

                    <p className="mt-6 text-xs text-center text-muted-foreground">
                        <ShieldCheck className="h-3 w-3 inline mr-1" />
                        Vos données restent sur votre appareil ·{" "}
                        <Link to="/" className="text-primary hover:underline">Retour à la boutique</Link>
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
                            « Depuis que j'utilise le tableau de bord, je gagne 2h par jour. Interface fluide, prise en main immédiate. »
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
