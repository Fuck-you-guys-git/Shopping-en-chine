import { useState } from "react";
import { Truck, Zap, Check, ChevronDown } from "lucide-react";
import { formatMoney, getLocale, t } from "@/lib/locale";

/*
 * Choix du mode de livraison (étape 2 du checkout, avant le paiement).
 * - Afrique (FCFA) : 2 options — économique 6 500 F/kg (15-20 j ouvrés)
 *   et express 11 000 F/kg (5-7 j ouvrés), textes complets du marchand.
 * - Europe / USA : UNE SEULE option standard « Chine-Europe » 13 €/kg
 *   (15-20 j ouvrés) avec remboursement intégral en cas de perte/douane.
 * Cliquer sur un bouton le sélectionne ET affiche le texte explicatif complet.
 * Montants en F CFA tels quels (aucune conversion de devise).
 */

const EU_RATE_XOF = 13 * (9000 / 17); // 13 €/kg exprimé en F CFA -> 13 € pile en mode EUR
const US_RATE_XOF = 18 * (9000 / 19); // 18 $/kg exprimé en F CFA -> $18 pile en mode USD
const CA_RATE_XOF = 20 * (9000 / 19); // 20 $/kg (Canada) -> $20 pile en mode USD

const AFRICA_MODES = [
    {
        id: "standard",
        icon: Truck,
        title: "Livraison économique Chine-Dakar",
        delay: "15 à 20 jours ouvrés",
        rateXof: 6500,
        lines: [
            { p: "Une option plus économique, spécialement conçue pour les clients ayant des colis de poids important, afin de bénéficier de frais de livraison plus avantageux." },
            { p: "Le délai estimatif est de 15 à 20 jours ouvrés." },
            { p: "Après votre commande, votre colis est pesé afin de déterminer vos frais de livraison." },
            { p: "Le calcul est simple :" },
            { calc: 6500 },
            { p: "Le montant obtenu correspond à vos frais de livraison jusqu'à Dakar." },
            { p: "Une fois votre colis prêt à être expédié, nous vous communiquerons le montant exact de vos frais de livraison." },
            { p: "Vous avez le choix :" },
            { bullets: ["payer vos frais de livraison avant l'expédition, ou", "payer à l'arrivée de votre colis à Dakar."] },
            { p: "Les frais de livraison sont calculés uniquement lorsque le colis est pesé et prêt à être expédié." },
            { p: "Et une fois à Dakar le livreur vous contactera pour la réception de votre colis." },
            { home: true },
        ],
    },
    {
        id: "express",
        icon: Zap,
        title: "Livraison express Chine-Dakar",
        delay: "5 à 7 jours ouvrés",
        rateXof: 11000,
        lines: [
            { p: "Pour recevoir votre commande plus rapidement, choisissez cette option express." },
            { p: "Le délai estimatif est de 5 à 7 jours ouvrés après l'expédition." },
            { p: "Après votre commande, votre colis est pesé afin de déterminer vos frais de livraison." },
            { p: "Le calcul est simple :" },
            { calc: 11000 },
            { p: "Le montant obtenu correspond à vos frais de livraison jusqu'à Dakar." },
            { p: "Une fois votre colis prêt à être expédié, nous vous communiquerons le montant exact de vos frais de livraison." },
            { p: "Vous avez le choix :" },
            { bullets: ["payer vos frais de livraison avant l'expédition, ou", "payer à l'arrivée de votre colis à Dakar."] },
            { p: "Les frais de livraison sont calculés uniquement lorsque le colis est pesé et prêt à être expédié." },
            { p: "Et une fois à Dakar le livreur vous contactera pour la réception de votre colis." },
            { home: true },
        ],
    },
];

const EU_MODES = [
    {
        id: "standard",
        icon: Truck,
        title: "Livraison Chine-Europe",
        delay: "15 à 20 jours ouvrés",
        rateXof: EU_RATE_XOF,
        lines: [
            { p: "Une option pensée pour vous permettre de recevoir votre commande en toute sérénité." },
            { p: "En cas de perte du colis ou de retenue par les services douaniers, vous bénéficiez d'un remboursement intégral, conformément aux conditions de cette option." },
            { p: "Délai estimatif : 15 à 20 jours ouvrés." },
            { p: "Après votre commande, votre colis est pesé afin de déterminer vos frais de livraison." },
            { p: "Le calcul est simple :" },
            { calc: EU_RATE_XOF },
            { p: "Le montant obtenu correspond à vos frais de livraison." },
            { p: "Une fois votre colis prêt à être expédié, nous vous communiquerons le montant exact de vos frais de livraison afin de finaliser votre paiement via un lien sécurisé que vous recevrez." },
            { bullets: ["payer vos frais de livraison avant l'expédition"] },
            { p: "Les frais de livraison sont calculés uniquement lorsque le colis est pesé et prêt à être expédié." },
            { p: "Dès l'arrivée de votre colis dans votre pays, notre assistante vous contactera pour organiser sa réception, soit par livraison (ces frais restent à votre charge), soit par remise en main propre." },
        ],
    },
];

const US_MODES = [
    {
        id: "standard",
        icon: Truck,
        title: "Livraison Chine-USA",
        delay: "15 à 20 jours ouvrés",
        rateXof: US_RATE_XOF,
        lines: [
            { p: "Une option pensée pour vous permettre de recevoir votre commande en toute sérénité." },
            { p: "En cas de perte du colis ou de retenue par les services douaniers, vous bénéficiez d'un remboursement intégral, conformément aux conditions de cette option." },
            { p: "Délai estimatif : 15 à 20 jours ouvrés." },
            { p: "Après votre commande, votre colis est pesé afin de déterminer vos frais de livraison." },
            { p: "Le calcul est simple :" },
            { calc: US_RATE_XOF },
            { p: "Le montant obtenu correspond à vos frais de livraison jusqu'à New York." },
            { p: "Une fois votre colis prêt à être expédié, nous vous communiquerons le montant exact de vos frais de livraison afin de finaliser votre paiement via un lien sécurisé que vous recevrez." },
            { bullets: ["payer vos frais de livraison avant l'expédition"] },
            { p: "Les frais de livraison sont calculés uniquement lorsque le colis est pesé et prêt à être expédié." },
            { p: "Dès l'arrivée de votre colis à New York, notre assistante vous contactera pour organiser sa réception, soit par livraison (ces frais restent à votre charge), soit par remise en main propre." },
        ],
    },
];

const CA_MODES = [
    {
        id: "standard",
        icon: Truck,
        title: "Livraison Chine-Canada",
        delay: "15 à 20 jours ouvrés",
        rateXof: CA_RATE_XOF,
        lines: [
            { p: "Une option pensée pour vous permettre de recevoir votre commande en toute sérénité." },
            { p: "En cas de perte du colis ou de retenue par les services douaniers, vous bénéficiez d'un remboursement intégral, conformément aux conditions de cette option." },
            { p: "Délai estimatif : 15 à 20 jours ouvrés." },
            { p: "Après votre commande, votre colis est pesé afin de déterminer vos frais de livraison." },
            { p: "Le calcul est simple :" },
            { calc: CA_RATE_XOF },
            { p: "Le montant obtenu correspond à vos frais de livraison." },
            { p: "Une fois votre colis prêt à être expédié, nous vous communiquerons le montant exact de vos frais de livraison afin de finaliser votre paiement via un lien sécurisé que vous recevrez." },
            { bullets: ["payer vos frais de livraison avant l'expédition"] },
            { p: "Les frais de livraison sont calculés uniquement lorsque le colis est pesé et prêt à être expédié." },
            { p: "Dès l'arrivée de votre colis dans votre pays, notre assistante vous contactera pour organiser sa réception, soit par livraison (ces frais restent à votre charge), soit par remise en main propre." },
        ],
    },
];

export const getDeliveryModes = () => {
    const { currency, country } = getLocale();
    if (currency === "EUR") return EU_MODES;
    if (currency === "USD") return country === "CA" ? CA_MODES : US_MODES;
    return AFRICA_MODES;
};

const Line = ({ line }) => {
    if (line.calc) {
        return (
            <p className="font-medium text-foreground">
                {t("Poids du colis (en kg)")} × {formatMoney(line.calc)}
            </p>
        );
    }
    if (line.bullets) {
        return (
            <ul className="list-disc pl-5 space-y-1">
                {line.bullets.map((b) => <li key={b}>{t(b)}</li>)}
            </ul>
        );
    }
    if (line.home) {
        return (
            <p>
                {t("Les frais de livraison à domicile sont à la charge du client. Ils sont fixés à")}{" "}
                <span className="font-medium text-foreground">{formatMoney(2000)}</span>
                {", "}{t("quel que soit le lieu de livraison à Dakar.")}
            </p>
        );
    }
    return <p>{t(line.p)}</p>;
};

export const DeliveryOptions = ({ value, onChange }) => {
    const modes = getDeliveryModes();
    // Le texte explicatif ne s'affiche QUE si le client appuie sur la petite flèche
    const [expanded, setExpanded] = useState(null);
    return (
        <div className="space-y-3">
            {modes.map((m) => {
                const selected = value === m.id;
                const open = expanded === m.id;
                return (
                    <div
                        key={m.id}
                        className={`border rounded-xl overflow-hidden transition-colors ${selected ? "border-primary ring-1 ring-primary/30 bg-primary/[0.03]" : "border-border"}`}
                    >
                        <div className="w-full flex items-center gap-4 p-4">
                            <button
                                type="button"
                                data-testid={`delivery-${m.id}-btn`}
                                onClick={() => onChange(m.id)}
                                className="flex items-center gap-4 flex-1 min-w-0 text-left"
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
                            </button>
                            <button
                                type="button"
                                data-testid={`delivery-${m.id}-toggle`}
                                aria-label={t("Voir les détails")}
                                onClick={() => setExpanded(open ? null : m.id)}
                                className="h-9 w-9 rounded-full border border-border flex items-center justify-center shrink-0 hover:border-primary hover:text-primary transition-colors"
                            >
                                <ChevronDown className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} />
                            </button>
                        </div>
                        {open && (
                            <div
                                data-testid={`delivery-${m.id}-details`}
                                className="px-4 pb-4 pt-1 text-sm text-muted-foreground leading-relaxed space-y-2 border-t border-border/60"
                            >
                                <div className="pt-3 space-y-2">
                                    {m.lines.map((line) => <Line key={line} line={line} />)}
                                </div>
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
};
