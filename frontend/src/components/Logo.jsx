import { Link } from "react-router-dom";

export const Logo = ({ className = "" }) => (
    <Link to="/" className={`inline-flex items-center gap-2.5 group ${className}`}>
        <span className="relative inline-flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-accent shadow-warm transition-transform group-hover:scale-105">
            <span className="font-display text-lg font-bold text-primary-foreground leading-none">S</span>
            <span className="absolute -bottom-1 -right-1 h-3 w-3 rounded-full bg-ink border-2 border-background" />
        </span>
        <span className="flex flex-col leading-none">
            <span className="font-display text-base font-semibold tracking-tight text-foreground">
                Shopping <span className="text-primary">en Chine</span>
            </span>
            <span className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground mt-0.5">Tout, plus simple</span>
        </span>
    </Link>
);
