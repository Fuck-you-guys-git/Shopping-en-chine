import { useMemo } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, SearchX } from "lucide-react";
import { useCatalog } from "@/context/CatalogContext";
import { productMatchesQuery } from "@/lib/search";
import { formatProductMoney, t } from "@/lib/locale";

/**
 * Suggestions instantanées sous la barre de recherche.
 * - `open` : contrôlé par le parent (focus de l'input)
 * - `onPick` : appelé quand le client clique une suggestion ou « tout voir »
 * - onMouseDown preventDefault : garde le focus de l'input pour que le
 *   clic sur une suggestion parte AVANT le blur qui ferme le menu.
 */
export const SearchSuggestions = ({ query, open, onPick, className = "" }) => {
    const { products } = useCatalog();
    const q = (query || "").trim();

    const matches = useMemo(
        () => (q.length < 2 ? [] : products.filter((p) => productMatchesQuery(p, q))),
        [products, q],
    );

    if (!open || q.length < 2) return null;
    const top = matches.slice(0, 6);

    return (
        <div
            data-testid="search-suggestions"
            onMouseDown={(e) => e.preventDefault()}
            className={`absolute left-0 right-0 top-full mt-2 z-50 rounded-xl border border-border bg-background shadow-lg overflow-hidden ${className}`}
        >
            {top.length === 0 ? (
                <p className="flex items-center gap-2 px-4 py-3.5 text-sm text-muted-foreground" data-testid="search-no-results">
                    <SearchX className="h-4 w-4 shrink-0" />
                    {t("Aucun produit trouvé")}
                </p>
            ) : (
                <>
                    <ul className="max-h-[330px] overflow-y-auto divide-y divide-border/60">
                        {top.map((p) => (
                            <li key={p.id}>
                                <Link
                                    to={`/produit/${p.id}`}
                                    onClick={onPick}
                                    data-testid={`suggestion-${p.id}`}
                                    className="flex items-center gap-3 px-3 py-2.5 hover:bg-muted transition-colors"
                                >
                                    {p.image ? (
                                        <img src={p.image} alt={p.name} loading="lazy" className="h-11 w-11 rounded-lg object-cover bg-muted shrink-0" />
                                    ) : (
                                        <span className="h-11 w-11 rounded-lg bg-muted shrink-0" />
                                    )}
                                    <span className="min-w-0 flex-1">
                                        <span className="block text-sm font-medium truncate">{p.name}</span>
                                        <span className="block text-xs text-muted-foreground truncate">{t(categoryLabel(p.category))}</span>
                                    </span>
                                    <span className="shrink-0 text-sm font-semibold text-primary">{formatProductMoney(p)}</span>
                                </Link>
                            </li>
                        ))}
                    </ul>
                    <Link
                        to={`/boutique?q=${encodeURIComponent(q)}`}
                        onClick={onPick}
                        data-testid="suggestions-see-all"
                        className="flex items-center justify-center gap-1.5 px-4 py-2.5 text-xs font-medium text-primary bg-secondary/40 hover:bg-secondary transition-colors border-t border-border"
                    >
                        {t("Voir tous les résultats")} ({matches.length})
                        <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                </>
            )}
        </div>
    );
};

const CATEGORY_LABELS = {
    mode: "Mode",
    tech: "Électronique",
    maison: "Maison",
    beaute: "Beauté",
    enfants: "Enfants",
    cuisine: "Cuisine",
};
const categoryLabel = (id) => CATEGORY_LABELS[id] || "Boutique";
