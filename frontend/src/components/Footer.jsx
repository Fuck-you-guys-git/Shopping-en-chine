import { Link } from "react-router-dom";
import { Logo } from "@/components/Logo";
import { t } from "@/lib/locale";
import { useLocale } from "@/context/LocaleContext";

const columns = [
    {
        title: "Boutique",
        links: [
            { label: "Tous les produits", to: "/boutique" },
            { label: "Mode", to: "/boutique/mode" },
            { label: "Électronique", to: "/boutique/tech" },
            { label: "Maison", to: "/boutique/maison" },
            { label: "Beauté", to: "/boutique/beaute" },
            { label: "Achat en gros", to: "/achat-en-gros" },
        ],
    },
    {
        title: "Aide",
        links: [
            { label: "Suivre ma commande", to: "/suivi" },
            { label: "À propos", to: "/a-propos" },
            { label: "Contact", href: "mailto:serviceclients@shoppingenchine.com" },
            { label: "serviceclients@shoppingenchine.com", href: "mailto:serviceclients@shoppingenchine.com", small: true },
        ],
    },
    {
        title: "Espace vendeur",
        links: [{ label: "Se connecter", to: "/admin/login" }],
    },
];

export const Footer = () => {
    useLocale(); // re-render au changement de langue

    return (
        <footer className="mt-20 bg-ink text-ink-foreground" data-testid="site-footer">
            <div className="container mx-auto px-5 py-14">
                <div className="grid grid-cols-1 gap-12 lg:grid-cols-12 lg:gap-8">
                    <div className="lg:col-span-5">
                        <div className="[&_span]:!text-ink-foreground">
                            <Logo />
                        </div>
                        <p className="mt-5 max-w-md text-sm leading-relaxed text-ink-foreground/70">
                            {t("Mode, électronique, maison, beauté et bien plus encore — commandés en Chine et livrés directement chez vous en 10 à 20 jours.")}
                        </p>
                        <ul className="mt-6 space-y-2 text-sm text-ink-foreground/70">
                            <li className="flex items-center gap-2.5">
                                <i className="fa-solid fa-lock w-4 text-center text-xs text-primary" aria-hidden="true" />
                                {t("Paiement sécurisé (Mobile Money & carte bancaire)")}
                            </li>
                            <li className="flex items-center gap-2.5">
                                <i className="fa-solid fa-box w-4 text-center text-xs text-primary" aria-hidden="true" />
                                {t("Suivi de commande disponible")}
                            </li>
                            <li className="flex items-center gap-2.5">
                                <i className="fa-solid fa-headset w-4 text-center text-xs text-primary" aria-hidden="true" />
                                {t("Assistance client 7 jours / 7")}
                            </li>
                        </ul>
                    </div>

                    <div className="grid grid-cols-2 gap-8 sm:grid-cols-3 lg:col-span-7">
                        {columns.map((col) => (
                            <div key={col.title}>
                                <h4 className="mb-4 text-xs font-semibold uppercase tracking-widest text-ink-foreground/50">
                                    {t(col.title)}
                                </h4>
                                <ul className="space-y-3 text-sm">
                                    {col.links.map((l) => (
                                        <li key={l.label}>
                                            {l.to ? (
                                                <Link to={l.to} className="transition-colors hover:text-primary">
                                                    {t(l.label)}
                                                </Link>
                                            ) : (
                                                <a
                                                    href={l.href}
                                                    className={`transition-colors hover:text-primary ${l.small ? "break-all text-xs text-ink-foreground/60" : ""}`}
                                                >
                                                    {l.label}
                                                </a>
                                            )}
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="mt-14 flex flex-col items-center justify-between gap-4 border-t border-ink-foreground/10 pt-7 text-xs text-ink-foreground/50 sm:flex-row">
                    <p>© {new Date().getFullYear()} Shopping en Chine. {t("Tous droits réservés.")}</p>
                    <div className="flex items-center gap-3 opacity-70" aria-label={t("Moyens de paiement acceptés")}>
                        <i className="fa-brands fa-cc-visa text-2xl" aria-hidden="true" />
                        <i className="fa-brands fa-cc-mastercard text-2xl" aria-hidden="true" />
                    </div>
                </div>
            </div>
        </footer>
    );
};
