import { Link } from "react-router-dom";

/**
 * Logotype Shopping en Chine — grand « S » vermillon + devise en baseline.
 * `inverted` pour fond sombre.
 */
export const Logo = ({ className = "", inverted = false }) => (
    <Link
        to="/"
        data-testid="site-logo"
        aria-label="Shopping en Chine — retour à l'accueil"
        className={`group inline-flex flex-col leading-none ${className}`}
    >
        <span className="flex items-baseline whitespace-nowrap">
            <span className="text-[30px] font-extrabold tracking-[-0.04em] text-primary transition-transform duration-200 group-hover:-translate-y-[1px] sm:text-[34px]">
                S
            </span>
            <span
                className={`text-[17px] font-extrabold tracking-[-0.03em] sm:text-[19px] ${
                    inverted ? "text-ink-foreground" : "text-foreground"
                }`}
            >
                hopping
                <span className="text-primary"> en Chine</span>
            </span>
        </span>
        <span
            className={`mt-[3px] block text-[9px] font-medium uppercase tracking-[0.22em] sm:tracking-[0.26em] ${
                inverted ? "text-ink-foreground/50" : "text-muted-foreground"
            }`}
        >
            Tout, plus simple
        </span>
    </Link>
);
