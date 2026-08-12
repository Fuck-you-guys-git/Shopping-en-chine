import { getLocale } from "@/lib/locale";

/**
 * Pays proposés au checkout, avec indicatif téléphonique.
 * L'indicatif est appliqué automatiquement quand le client choisit son pays.
 */
export const COUNTRIES = [
    // Afrique
    { code: "SN", fr: "Sénégal", en: "Senegal", dial: "221", flag: "🇸🇳" },
    { code: "CI", fr: "Côte d'Ivoire", en: "Ivory Coast", dial: "225", flag: "🇨🇮" },
    { code: "ML", fr: "Mali", en: "Mali", dial: "223", flag: "🇲🇱" },
    { code: "BF", fr: "Burkina Faso", en: "Burkina Faso", dial: "226", flag: "🇧🇫" },
    { code: "NE", fr: "Niger", en: "Niger", dial: "227", flag: "🇳🇪" },
    { code: "TG", fr: "Togo", en: "Togo", dial: "228", flag: "🇹🇬" },
    { code: "BJ", fr: "Bénin", en: "Benin", dial: "229", flag: "🇧🇯" },
    { code: "GN", fr: "Guinée", en: "Guinea", dial: "224", flag: "🇬🇳" },
    { code: "GW", fr: "Guinée-Bissau", en: "Guinea-Bissau", dial: "245", flag: "🇬🇼" },
    { code: "GM", fr: "Gambie", en: "Gambia", dial: "220", flag: "🇬🇲" },
    { code: "MR", fr: "Mauritanie", en: "Mauritania", dial: "222", flag: "🇲🇷" },
    { code: "CM", fr: "Cameroun", en: "Cameroon", dial: "237", flag: "🇨🇲" },
    { code: "GH", fr: "Ghana", en: "Ghana", dial: "233", flag: "🇬🇭" },
    { code: "NG", fr: "Nigeria", en: "Nigeria", dial: "234", flag: "🇳🇬" },
    { code: "GA", fr: "Gabon", en: "Gabon", dial: "241", flag: "🇬🇦" },
    { code: "CG", fr: "Congo", en: "Congo", dial: "242", flag: "🇨🇬" },
    { code: "CD", fr: "RD Congo", en: "DR Congo", dial: "243", flag: "🇨🇩" },
    { code: "CV", fr: "Cap-Vert", en: "Cape Verde", dial: "238", flag: "🇨🇻" },
    { code: "MA", fr: "Maroc", en: "Morocco", dial: "212", flag: "🇲🇦" },
    { code: "DZ", fr: "Algérie", en: "Algeria", dial: "213", flag: "🇩🇿" },
    { code: "TN", fr: "Tunisie", en: "Tunisia", dial: "216", flag: "🇹🇳" },
    // Europe
    { code: "FR", fr: "France", en: "France", dial: "33", flag: "🇫🇷" },
    { code: "BE", fr: "Belgique", en: "Belgium", dial: "32", flag: "🇧🇪" },
    { code: "CH", fr: "Suisse", en: "Switzerland", dial: "41", flag: "🇨🇭" },
    { code: "IT", fr: "Italie", en: "Italy", dial: "39", flag: "🇮🇹" },
    { code: "ES", fr: "Espagne", en: "Spain", dial: "34", flag: "🇪🇸" },
    { code: "DE", fr: "Allemagne", en: "Germany", dial: "49", flag: "🇩🇪" },
    { code: "PT", fr: "Portugal", en: "Portugal", dial: "351", flag: "🇵🇹" },
    { code: "NL", fr: "Pays-Bas", en: "Netherlands", dial: "31", flag: "🇳🇱" },
    { code: "LU", fr: "Luxembourg", en: "Luxembourg", dial: "352", flag: "🇱🇺" },
    { code: "GB", fr: "Royaume-Uni", en: "United Kingdom", dial: "44", flag: "🇬🇧" },
    // Amériques
    { code: "US", fr: "États-Unis", en: "United States", dial: "1", flag: "🇺🇸" },
    { code: "CA", fr: "Canada", en: "Canada", dial: "1", flag: "🇨🇦" },
];

export const findCountry = (code) =>
    COUNTRIES.find((c) => c.code === (code || "").toUpperCase()) || null;

export const countryName = (c) => (getLocale().lang === "en" ? c.en : c.fr);
