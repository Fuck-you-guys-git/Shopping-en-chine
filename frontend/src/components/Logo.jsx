import { Link } from "react-router-dom";

/**
 * Logotype Shopping en Chine — typographie seule (pas de badge).
 * `compact` masque la baseline sur mobile, `inverted` pour fond sombre.
 */
export const Logo = ({ className = "", compact = false, inverted = false }) => (
    <Link
        to="/"
        data-testid="site-logo"
        aria-label="Shopping en Chine — retour à l'accueil"
        className={`group inline-flex flex-col leading-none ${className}`}
    >
        <span
            className={`whitespace-nowrap text-[17px] font-extrabold tracking-[-0.03em] sm:text-[19px] ${
                inverted ? "text-ink-foreground" : "text-foreground"
            }`}
        >
            Shopping
            <span className="text-primary"> en Chine</span>
        </span>
        <span
            className={`mt-[5px] text-[9px] font-medium uppercase tracking-[0.26em] ${compact ? "hidden sm:block" : "block"} ${
                inverted ? "text-ink-foreground/50" : "text-muted-foreground"
            }`}
        >
            Tout, plus simple
        </span>
    </Link>
);
