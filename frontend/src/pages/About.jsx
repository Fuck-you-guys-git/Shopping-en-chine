import { Link } from "react-router-dom";
import { Truck, ShieldCheck, HeadphonesIcon, Globe } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePageTitle } from "@/hooks/usePageTitle";
import { t } from "@/lib/locale";

const values = [
    { icon: Globe, title: "Import direct de Chine", desc: "Nous sélectionnons et importons vos produits directement depuis les meilleurs fournisseurs chinois, sans intermédiaire." },
    { icon: Truck, title: "Livraison mondiale en 10–20 jours", desc: "Suivi de colis en temps réel, de la commande jusqu'à votre porte : Commandé → Expédié → Douane → Livré." },
    { icon: ShieldCheck, title: "Paiement 100 % sécurisé", desc: "Wave ou Orange Money. Votre argent est protégé, vous êtes notifié à chaque étape." },
    { icon: HeadphonesIcon, title: "Service client 7j/7", desc: "Une équipe basée à Dakar, disponible en français, qui répond à toutes vos questions avant et après l'achat." },
];

export default function About() {
    usePageTitle("À propos", "Shopping en Chine : votre boutique d'importation depuis la Chine vers le monde entier. Livraison 10–20 jours, paiement Wave / Orange Money, suivi en temps réel.");
    return (
        <div data-testid="about-page">
            <section className="bg-gradient-hero border-b border-border">
                <div className="container mx-auto px-5 py-16 md:py-20 max-w-3xl">
                    <p className="text-xs uppercase tracking-[0.25em] text-primary font-semibold mb-4">{t("Qui sommes-nous")}</p>
                    <h1 className="font-display text-2xl sm:text-3xl lg:text-4xl font-medium tracking-tight mb-6">
                        {t("La Chine à portée de main,")} <span className="text-primary italic">{t("depuis Dakar")}</span>
                    </h1>
                    <p className="text-muted-foreground text-base leading-relaxed">
                        {t("Shopping en Chine est née d'une idée simple : permettre à chacun au Sénégal et en Afrique de l'Ouest de commander des produits de qualité directement de Chine, sans se soucier de la logistique, de la douane ou du paiement. Vous choisissez, nous nous occupons de tout le reste.")}
                    </p>
                </div>
            </section>

            <section className="container mx-auto px-5 py-14 max-w-4xl">
                <div className="grid sm:grid-cols-2 gap-6">
                    {values.map((v) => (
                        <div key={v.title} className="bg-card rounded-2xl p-6 shadow-card border border-border/50">
                            <div className="h-11 w-11 rounded-xl bg-primary/10 text-primary flex items-center justify-center mb-4">
                                <v.icon className="h-5 w-5" />
                            </div>
                            <h3 className="font-display text-lg font-medium mb-2">{t(v.title)}</h3>
                            <p className="text-sm text-muted-foreground leading-relaxed">{t(v.desc)}</p>
                        </div>
                    ))}
                </div>
                <div className="text-center mt-12">
                    <Button asChild size="lg" className="bg-primary hover:bg-primary/90 text-primary-foreground rounded-full h-12 px-8 shadow-warm">
                        <Link to="/boutique">{t("Découvrir la boutique")}</Link>
                    </Button>
                </div>
            </section>
        </div>
    );
}
