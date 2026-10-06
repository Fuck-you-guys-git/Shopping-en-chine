import { useEffect, useState } from "react";
import { paxityAPI } from "@/lib/api";
import { getLocale } from "@/lib/locale";

const isPreview = () => typeof window !== "undefined" && window.location.hostname.includes("preview");

/**
 * Badge de diagnostic affiché UNIQUEMENT sur la preview : indique quelle API
 * Paxity va encaisser le paiement. La v2 ne couvre que l'Afrique en devise
 * locale (« Unsupported corridor » pour EUR/USD), donc EUR/USD repassent en v1.
 * Invisible en production : les clients ne doivent jamais voir ce détail.
 */
export const PaxityVersionBadge = () => {
    const [enabled, setEnabled] = useState(null);

    useEffect(() => {
        if (!isPreview()) return;
        paxityAPI.v2Config().then((c) => setEnabled(Boolean(c?.enabled))).catch(() => setEnabled(false));
    }, []);

    if (!isPreview() || enabled === null) return null;

    const { currency } = getLocale();
    const isV2 = enabled && currency === "XOF";

    return (
        <div
            data-testid="paxity-version-badge"
            className={`flex items-start gap-2 rounded-xl border px-3 py-2 text-xs ${
                isV2
                    ? "border-success/30 bg-success/5 text-success"
                    : "border-border bg-muted/50 text-muted-foreground"
            }`}
        >
            <span className="font-bold">{isV2 ? "Paxity v2" : "Paxity v1"}</span>
            <span className="opacity-80">
                {isV2
                    ? `· paiement en ${currency} encaissé par la nouvelle API`
                    : `· ${currency} n'est pas pris en charge par la v2, l'ancienne API encaisse`}
                {" "}(visible seulement sur la preview)
            </span>
        </div>
    );
};
