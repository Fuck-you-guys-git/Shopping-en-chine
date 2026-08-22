import { Link } from "react-router-dom";

export const Logo = ({ className = "", compact = false }) => (
    <Link
        to="/"
        data-testid="site-logo"
        aria-label="Shopping en Chine — retour à l'accueil"
        className={`inline-flex items-center gap-2.5 group ${className}`}
    >
        <span className="relative inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary transition-transform duration-200 group-hover:scale-105">
            <span className="text-lg font-extrabold text-primary-foreground leading-none">S</span>
        </span>
        <span className={`flex-col leading-none ${compact ? "hidden sm:flex" : "flex"}`}>
            <span className="text-[15px] font-bold tracking-tight text-foreground whitespace-nowrap">
                Shopping <span className="text-primary">en Chine</span>
            </span>
            <span className="text-[9px] uppercase tracking-[0.18em] text-muted-foreground mt-1">
                Tout, plus simple
            </span>
        </span>
    </Link>
);
