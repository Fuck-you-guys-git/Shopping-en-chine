import { Link } from "react-router-dom";
import { Logo } from "@/components/Logo";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { t } from "@/lib/locale";
import { useLocale } from "@/context/LocaleContext";

export const Footer = () => {
    useLocale(); // re-render au changement de langue
    const onNewsletter = (e) => {
        e.preventDefault();
        const email = e.target.email.value;
        if (email) {
            toast.success(t("Bienvenue chez Shopping en Chine ✦"), {
                description: `${t("Nous avons envoyé un code de -10% à")} ${email}`,
            });
            e.target.reset();
        }
    };

    return (
        <footer className="bg-ink text-ink-foreground mt-24">
            <div className="container mx-auto px-5 py-16">
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-8">
                    <div className="lg:col-span-5">
                        <div className="[&_span]:!text-ink-foreground">
                            <Logo />
                        </div>
                        <p className="mt-6 text-sm text-ink-foreground/70 max-w-md leading-relaxed">
                            {t("Livraison Chine → Dakar en 10–20 jours · Paiement Mobile Money (Wave, Orange Money, MTN). Tout ce dont vous avez besoin, simple à trouver.")}
                        </p>
                        <form onSubmit={onNewsletter} className="mt-8 flex gap-2 max-w-md">
                            <Input
                                name="email"
                                type="email"
                                required
                                placeholder={t("votre@email.com")}
                                className="bg-ink-foreground/5 border-ink-foreground/15 text-ink-foreground placeholder:text-ink-foreground/40 focus-visible:border-primary"
                            />
                            <Button type="submit" className="bg-primary hover:bg-primary/90 text-primary-foreground shrink-0">
                                {t("−10% offert")}
                            </Button>
                        </form>
                        <div className="mt-8 flex gap-3">
                            {["instagram", "tiktok", "pinterest", "facebook"].map((s) => (
                                <a key={s} href="#" className="h-9 w-9 rounded-full border border-ink-foreground/15 flex items-center justify-center hover:bg-primary hover:border-primary transition-colors">
                                    <i className={`fa-brands fa-${s} text-sm`} />
                                </a>
                            ))}
                        </div>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-8 lg:col-span-7">
                        <div>
                            <h4 className="font-sans text-xs uppercase tracking-widest text-ink-foreground/50 mb-4">{t("Boutique")}</h4>
                            <ul className="space-y-3 text-sm">
                                <li><Link to="/boutique" className="hover:text-primary transition-colors">{t("Tous les produits")}</Link></li>
                                <li><Link to="/boutique/mode" className="hover:text-primary transition-colors">{t("Mode")}</Link></li>
                                <li><Link to="/boutique/tech" className="hover:text-primary transition-colors">Tech</Link></li>
                                <li><Link to="/boutique/maison" className="hover:text-primary transition-colors">{t("Maison")}</Link></li>
                                <li><Link to="/boutique" className="hover:text-primary transition-colors">{t("Nouveautés")}</Link></li>
                            </ul>
                        </div>
                        <div>
                            <h4 className="font-sans text-xs uppercase tracking-widest text-ink-foreground/50 mb-4">{t("Aide")}</h4>
                            <ul className="space-y-3 text-sm">
                                <li><a href="#" className="hover:text-primary transition-colors">{t("Livraison")}</a></li>
                                <li><a href="#" className="hover:text-primary transition-colors">{t("Retours")}</a></li>
                                <li><Link to="/suivi" className="hover:text-primary transition-colors">{t("Suivi de commande")}</Link></li>
                                <li><Link to="/a-propos" className="hover:text-primary transition-colors">{t("À propos")}</Link></li>
                                <li><a href="#" className="hover:text-primary transition-colors">FAQ</a></li>
                                <li><a href="mailto:serviceclients@shoppingenchine.com" className="hover:text-primary transition-colors">{t("Contact")}</a></li>
                                <li><a href="mailto:serviceclients@shoppingenchine.com" className="hover:text-primary transition-colors break-all">serviceclients@shoppingenchine.com</a></li>
                            </ul>
                        </div>
                        <div>
                            <h4 className="font-sans text-xs uppercase tracking-widest text-ink-foreground/50 mb-4">{t("Maison")}</h4>
                            <ul className="space-y-3 text-sm">
                                <li><a href="#" className="hover:text-primary transition-colors">{t("Notre histoire")}</a></li>
                                <li><a href="#" className="hover:text-primary transition-colors">{t("Vendeurs")}</a></li>
                                <li><a href="#" className="hover:text-primary transition-colors">{t("Carrières")}</a></li>
                                <li><a href="#" className="hover:text-primary transition-colors">{t("Presse")}</a></li>
                                <li><a href="#" className="hover:text-primary transition-colors">Blog</a></li>
                            </ul>
                        </div>
                    </div>
                </div>

                <div className="mt-16 pt-8 border-t border-ink-foreground/10 flex flex-col sm:flex-row justify-between items-center gap-4 text-xs text-ink-foreground/50">
                    <p>© {new Date().getFullYear()} Shopping en Chine. {t("Tous droits réservés.")}</p>
                    <div className="flex gap-6">
                        <a href="#" className="hover:text-ink-foreground">{t("Confidentialité")}</a>
                        <a href="#" className="hover:text-ink-foreground">{t("Conditions")}</a>
                        <a href="#" className="hover:text-ink-foreground">Cookies</a>
                    </div>
                    <div className="flex items-center gap-3 opacity-70">
                        <i className="fa-brands fa-cc-visa text-2xl" />
                        <i className="fa-brands fa-cc-mastercard text-2xl" />
                        <i className="fa-brands fa-cc-paypal text-2xl" />
                        <i className="fa-brands fa-cc-apple-pay text-2xl" />
                    </div>
                </div>
            </div>
        </footer>
    );
};
