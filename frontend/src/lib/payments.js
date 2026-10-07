/*
 * Regroupement des codes de paiement Paxity en familles lisibles.
 * Codes réels stockés dans db.orders.payment_method :
 *   CARD · WAVESN · WAVECI · OMSN · OMCI · MTNCI
 */
export const PAYMENT_GROUPS = [
    { id: "card", label: "Carte bancaire", icon: "fa-credit-card", codes: ["CARD"] },
    { id: "wave", label: "Wave", icon: "fa-mobile-screen-button", codes: ["WAVESN", "WAVECI"] },
    { id: "om", label: "Orange Money", icon: "fa-mobile-screen-button", codes: ["OMSN", "OMCI"] },
    { id: "mtn", label: "MTN Mobile Money", icon: "fa-mobile-screen-button", codes: ["MTNCI"] },
];

const BY_CODE = Object.fromEntries(
    PAYMENT_GROUPS.flatMap((g) => g.codes.map((c) => [c, g.id])),
);

export const OTHER_GROUP = { id: "other", label: "Non renseigné", icon: "fa-circle-question" };

/** Famille de paiement d'une commande ("card" | "wave" | "om" | "mtn" | "other"). */
export const paymentGroupId = (method) => BY_CODE[String(method || "").toUpperCase()] || "other";

/** Libellé précis du code (ex. « Wave Sénégal ») quand il est connu. */
export const PAYMENT_CODE_LABELS = {
    CARD: "Carte bancaire",
    WAVESN: "Wave Sénégal",
    WAVECI: "Wave Côte d'Ivoire",
    OMSN: "Orange Money Sénégal",
    OMCI: "Orange Money Côte d'Ivoire",
    MTNCI: "MTN Mobile Money",
};
