import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search } from "lucide-react";
import { SearchSuggestions } from "@/components/SearchSuggestions";
import { t } from "@/lib/locale";

/**
 * Barre de recherche réutilisable (header desktop, header mobile, hero).
 * `size` : "lg" pour le header desktop / hero, "md" pour mobile.
 */
export const SearchBar = ({
    size = "lg",
    autoFocus = false,
    testId = "search-input",
    onSubmitted,
    className = "",
    suggestionsClassName = "",
}) => {
    const navigate = useNavigate();
    const [query, setQuery] = useState("");
    const [open, setOpen] = useState(false);

    const submit = (e) => {
        e.preventDefault();
        if (!query.trim()) return;
        navigate(`/boutique?q=${encodeURIComponent(query.trim())}`);
        setOpen(false);
        onSubmitted?.();
    };

    const h = size === "lg" ? "h-12" : "h-11";

    return (
        <form onSubmit={submit} role="search" className={`relative w-full ${className}`}>
            <label htmlFor={testId} className="sr-only">
                {t("Rechercher un produit")}
            </label>
            <Search className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
                id={testId}
                type="search"
                autoFocus={autoFocus}
                value={query}
                onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
                onFocus={() => setOpen(true)}
                onBlur={() => setTimeout(() => setOpen(false), 120)}
                onKeyDown={(e) => e.key === "Escape" && setOpen(false)}
                placeholder={t("Rechercher parmi des milliers de produits…")}
                data-testid={testId}
                className={`w-full ${h} rounded-full border border-border bg-muted/60 pl-11 pr-[104px] text-sm text-foreground placeholder:text-muted-foreground transition-colors duration-200 focus:bg-background focus:border-foreground/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30`}
            />
            <button
                type="submit"
                data-testid={`${testId}-submit`}
                className={`absolute right-1.5 top-1/2 -translate-y-1/2 rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground transition-colors duration-200 hover:bg-primary/90 ${size === "lg" ? "h-9" : "h-8 px-4"}`}
            >
                {t("Chercher")}
            </button>
            <SearchSuggestions
                query={query}
                open={open}
                onPick={() => { setOpen(false); setQuery(""); onSubmitted?.(); }}
                className={suggestionsClassName}
            />
        </form>
    );
};
