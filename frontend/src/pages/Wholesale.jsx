import { Phone, MessageCircle } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { usePageTitle } from "@/hooks/usePageTitle";
import { t } from "@/lib/locale";

const COMMERCIAL_PHONE = "788206060";
const WA_LINK = `https://wa.me/221${COMMERCIAL_PHONE}?text=${encodeURIComponent(
    "Bonjour, je souhaite des informations sur les achats en gros."
)}`;

export default function Wholesale() {
    usePageTitle("Achat en gros", "Fournisseur de confiance pour vos achats en gros — revendeurs, boutiques et entrepreneurs.");

    return (
        <div className="container mx-auto px-5 py-12 md:py-20 max-w-3xl" data-testid="wholesale-page">
            {/* Titre principal */}
            <p className="text-xs uppercase tracking-[0.25em] text-primary font-semibold mb-4">{t("Achat en gros")}</p>
            <h1 className="font-display text-2xl sm:text-3xl lg:text-4xl font-semibold leading-tight uppercase mb-8" data-testid="wholesale-title">
                {t("Lancez votre business avec un fournisseur de confiance")}
            </h1>

            <div className="space-y-5 text-base text-muted-foreground leading-relaxed">
                <p>
                    {t("Vous souhaitez créer votre propre boutique ou développer votre activité ? Nous sommes ravis de vous accompagner en tant que fournisseur pour vos achats en gros. Découvrez une large sélection de produits adaptés aux professionnels, avec des solutions pensées pour les revendeurs, boutiques et entrepreneurs.")}
                </p>
                <p>
                    {t("Pour toute demande de tarifs en gros, disponibilité des produits ou informations commerciales, contactez notre service commercial dès maintenant. Nous serons heureux de vous accompagner dans la réussite de votre projet.")}
                </p>
            </div>

            {/* Contact commercial */}
            <div className="mt-10 bg-card border border-border/60 rounded-2xl p-6 shadow-card" data-testid="wholesale-contact-card">
                <p className="text-lg font-medium mb-4">
                    {t("📲 Contact commercial :")} <span className="font-display font-semibold text-primary">{COMMERCIAL_PHONE}</span>
                </p>
                <div className="flex flex-wrap gap-3">
                    <Button asChild size="lg" className="rounded-full bg-[#25D366] hover:bg-[#1fb757] text-white" data-testid="wholesale-whatsapp-btn">
                        <a href={WA_LINK} target="_blank" rel="noopener noreferrer">
                            <MessageCircle className="h-4 w-4" /> WhatsApp
                        </a>
                    </Button>
                    <Button asChild size="lg" variant="outline" className="rounded-full" data-testid="wholesale-call-btn">
                        <a href={`tel:+221${COMMERCIAL_PHONE}`}>
                            <Phone className="h-4 w-4" /> {t("Appeler")}
                        </a>
                    </Button>
                </div>
            </div>

            {/* Expédition mondiale */}
            <div className="mt-14 text-center bg-ink text-ink-foreground rounded-3xl px-6 py-12" data-testid="wholesale-worldwide-banner">
                <h2 className="font-display text-xl sm:text-2xl lg:text-3xl font-semibold uppercase tracking-wide leading-snug">
                    {t("🌍 Nous expédions partout dans le monde")}
                </h2>
                <p className="mt-3 text-sm opacity-70">{t("Chine → Afrique, Europe, Amérique… votre commande vous suit où que vous soyez.")}</p>
                <Button asChild size="lg" className="mt-6 rounded-full bg-primary text-primary-foreground hover:bg-primary/90">
                    <Link to="/boutique">{t("Découvrir la boutique")}</Link>
                </Button>
            </div>
        </div>
    );
}
