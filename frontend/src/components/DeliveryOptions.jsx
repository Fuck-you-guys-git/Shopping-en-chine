import { Truck, Zap, Check, ChevronDown } from "lucide-react";
import { formatMoney, t } from "@/lib/locale";

/*
 * Choix du mode de livraison (étape 2 du checkout, avant le paiement) :
 * - Standard (économique) : 15–20 jours ouvrés · 6 500 F/kg
 * - Express               : 5–7 jours ouvrés  · 11 000 F/kg
 * Cliquer sur un bouton le sélectionne ET affiche le texte explicatif complet.
 * Les montants passent par formatMoney (convertis en €/$ pour Europe/USA).
 */

const COMMON_LINES = (rateXof) => [
    "Après votre commande, votre colis est pesé afin de déterminer vos frais de livraison.",
    "Le calcul est simple :",
    `__CALC__${rateXof}`,
    "Le montant obtenu correspond à vos frais de livraison jusqu'à Dakar.",
    "Une fois votre colis prêt à être expédié, nous vous communiquerons le montant exact de vos frais de livraison.",
    "Vous avez le choix :",
    "__CHOICES__",
    "Les frais de livraison sont calculés uniquement lorsque le colis est pesé et prêt à être expédié.",
    "Et une fois à Dakar le livreur vous contactera pour la réception de votre colis.",
    "__HOME__",
];

export const DELIVERY_MODES = [
    {
        id: "standard",
        icon: Truck,
        title: "Livraison économique Chine-Dakar",
        delay: "15 à 20 jours ouvrés",
        rateXof: 6500,
        intro: "Une option plus économique, spécialement conçue pour les clients ayant des colis de poids important, afin de bénéficier de frais de livraison plus avantageux.",
        delayLine: "Le délai estimatif est de 15 à 20 jours ouvrés.",
    },
    {
        id: "express",
        icon: Zap,
        title: "Livraison express Chine-Dakar",
        delay: "5 à 7 jours ouvrés",
        rateXof: 11000,
        intro: "Pour recevoir votre commande plus rapidement, choisissez cette option express.",
        delayLine: "Le délai estimatif est de 5 à 7 jours ouvrés après l'expédition.",
    },
];

const DetailLine = ({ line, rateXof }) => {
    if (line === `__CALC__${rateXof}`) {
        return (
            <p className="font-medium text-foreground">
                {t("Poids du colis (en kg)")} × {formatMoney(rateXof)}
            </p>
        );
    }
    if (line === "__CHOICES__") {
        return (
            <ul className="list-disc pl-5 space-y-1">
                <li>{t("payer vos frais de livraison avant l'expédition, ou")}</li>
                <li>{t("payer à l'arrivée de votre colis à Dakar.")}</li>
            </ul>
        );
    }
    if (line === "__HOME__") {
        return (
            <p>
                {t("Les frais de livraison à domicile sont à la charge du client. Ils sont fixés à")}{" "}
                <span className="font-medium text-foreground">{formatMoney(2000)}</span>
                {", "}{t("quel que soit le lieu de livraison à Dakar.")}
            </p>
        );
    }
    return <p>{t(line)}</p>;
};

export const DeliveryOptions = ({ value, onChange }) => (
    <div className="space-y-3">
        {DELIVERY_MODES.map((m) => {
            const selected = value === m.id;
            return (
                <div
                    key={m.id}
                    className={`border rounded-xl overflow-hidden transition-colors ${selected ? "border-primary ring-1 ring-primary/30 bg-primary/[0.03]" : "border-border"}`}
                >
                    <button
                        type="button"
                        data-testid={`delivery-${m.id}-btn`}
                        onClick={() => onChange(m.id)}
                        className="w-full flex items-center gap-4 p-4 text-left"
                    >
                        <span className={`h-9 w-9 rounded-full flex items-center justify-center shrink-0 ${selected ? "bg-primary text-primary-foreground" : "bg-muted text-foreground"}`}>
                            {selected ? <Check className="h-4 w-4" /> : <m.icon className="h-4 w-4" />}
                        </span>
                        <span className="flex-1 min-w-0">
                            <span className="block font-medium leading-tight">{t(m.title)}</span>
                            <span className="block text-xs text-muted-foreground mt-0.5">
                                {t(m.delay)} · <span className="font-semibold text-primary">{formatMoney(m.rateXof)}/kg</span>
                            </span>
                        </span>
                        <ChevronDown className={`h-4 w-4 text-muted-foreground shrink-0 transition-transform ${selected ? "rotate-180" : ""}`} />
                    </button>
                    {selected && (
                        <div
                            data-testid={`delivery-${m.id}-details`}
                            className="px-4 pb-4 pt-1 text-sm text-muted-foreground leading-relaxed space-y-2 border-t border-border/60"
                        >
                            <p className="pt-3">{t(m.intro)}</p>
                            <p>{t(m.delayLine)}</p>
                            {COMMON_LINES(m.rateXof).map((line, i) => (
                                <DetailLine key={i} line={line} rateXof={m.rateXof} />
                            ))}
                        </div>
                    )}
                </div>
            );
        })}
    </div>
);
