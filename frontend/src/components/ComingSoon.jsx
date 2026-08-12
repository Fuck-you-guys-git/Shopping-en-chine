import { useState } from "react";
import { Lock, ArrowRight } from "lucide-react";
import { Logo } from "@/components/Logo";

/*
 * Écran de lancement « Bientôt disponible ».
 * Le site public est verrouillé tant que le visiteur n'a pas saisi le mot
 * de passe ci-dessous. L'espace vendeur (/vendeur, /admin) reste accessible.
 * Pour changer le mot de passe : modifiez SITE_PASSWORD.
 * Pour rouvrir le site à tous : passez GATE_ENABLED à false.
 */
export const GATE_ENABLED = true;
const SITE_PASSWORD = "alarba2026";
const UNLOCK_KEY = "sec_site_unlocked_v1";

export const isSiteUnlocked = () => {
    try {
        return localStorage.getItem(UNLOCK_KEY) === SITE_PASSWORD;
    } catch {
        return false;
    }
};

export const ComingSoon = ({ onUnlock }) => {
    const [value, setValue] = useState("");
    const [error, setError] = useState(false);

    const submit = (e) => {
        e.preventDefault();
        if (value.trim() === SITE_PASSWORD) {
            try { localStorage.setItem(UNLOCK_KEY, SITE_PASSWORD); } catch { /* ignore */ }
            onUnlock();
        } else {
            setError(true);
            setValue("");
        }
    };

    return (
        <div className="min-h-screen bg-ink text-ink-foreground flex flex-col items-center justify-center px-6 text-center" data-testid="coming-soon-screen">
            <div className="[&_.text-foreground]:!text-white [&_.text-muted-foreground]:!text-white/50">
                <Logo />
            </div>
            <h1 className="mt-10 font-display text-3xl sm:text-5xl font-semibold uppercase tracking-wide leading-tight">
                Bientôt disponible
            </h1>
            <p className="mt-4 text-sm sm:text-base opacity-70 max-w-md">
                Notre boutique ouvre très bientôt. Livraison de la Chine vers le monde entier en 10–20 jours,
                paiement Wave, Orange Money et carte bancaire.
            </p>

            <form onSubmit={submit} className="mt-10 w-full max-w-xs" data-testid="coming-soon-form">
                <div className="flex items-center gap-2 bg-white/10 border border-white/15 rounded-full px-4 h-12 focus-within:border-primary transition-colors">
                    <Lock className="h-4 w-4 opacity-60 shrink-0" />
                    <input
                        type="password"
                        value={value}
                        onChange={(e) => { setValue(e.target.value); setError(false); }}
                        placeholder="Mot de passe d'accès"
                        data-testid="coming-soon-password-input"
                        className="flex-1 bg-transparent outline-none text-sm placeholder:text-ink-foreground/40 min-w-0"
                    />
                    <button
                        type="submit"
                        aria-label="Entrer"
                        data-testid="coming-soon-submit-btn"
                        className="h-8 w-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center hover:bg-primary/90 transition-colors shrink-0"
                    >
                        <ArrowRight className="h-4 w-4" />
                    </button>
                </div>
                {error && (
                    <p className="mt-3 text-xs text-red-400" data-testid="coming-soon-error">
                        Mot de passe incorrect
                    </p>
                )}
            </form>

            <p className="mt-12 text-xs opacity-40">🌍 Nous expédions partout dans le monde</p>
        </div>
    );
};
