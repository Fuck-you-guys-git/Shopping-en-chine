import { Link } from "react-router-dom";
import { t } from "@/lib/locale";

/**
 * Carte catégorie. `image` provient d'un vrai produit du catalogue quand
 * disponible, sinon de l'illustration de la catégorie. `count` n'est affiché
 * que s'il est calculé sur les vrais produits (> 0).
 */
export const CategoryCard = ({ category, image, count }) => (
    <Link
        to={`/boutique/${category.id}`}
        data-testid={`category-card-${category.id}`}
        className="group relative flex aspect-[4/5] flex-col justify-end overflow-hidden rounded-xl bg-muted sm:aspect-square"
    >
        {image ? (
            <img
                src={image}
                alt=""
                loading="lazy"
                decoding="async"
                className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.06]"
            />
        ) : (
            <span className="absolute inset-0 flex items-center justify-center text-3xl text-muted-foreground/40">
                <i className={`fa-solid ${category.icon}`} aria-hidden="true" />
            </span>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-ink/85 via-ink/20 to-transparent" />
        <div className="relative z-10 p-3 text-ink-foreground">
            <h3 className="text-sm font-bold leading-tight sm:text-base">{t(category.name)}</h3>
            {count > 0 && (
                <p className="mt-0.5 text-[11px] text-ink-foreground/70">
                    {count} {count > 1 ? t("produits") : t("produit")}
                </p>
            )}
        </div>
    </Link>
);
