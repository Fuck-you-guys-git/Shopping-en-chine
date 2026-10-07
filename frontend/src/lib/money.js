// Prices are stored in F CFA (XOF). Other currencies are derived with the
// rates served by the backend (GET /api/payments/config).

const xofFormatter = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });

/** "12 500 F" */
export const formatPrice = (amountXof) => `${xofFormatter.format(Math.round(amountXof))} F`;

const formatIn = (amount, currency) =>
    currency === "XOF"
        ? formatPrice(amount)
        : new Intl.NumberFormat("fr-FR", { style: "currency", currency }).format(amount);

/** An F CFA amount shown in `currency` ("129,58 €"). Falls back to F CFA when the rate is unknown. */
export const formatMoney = (amountXof, currency, rates) =>
    rates?.[currency] ? formatIn(amountXof / rates[currency], currency) : formatPrice(amountXof);

/** A Paxity amount (minor units: F CFA × 100, cents for € and $). */
export const formatMinor = (amountMinor, currency) => formatIn(amountMinor / 100, currency);
