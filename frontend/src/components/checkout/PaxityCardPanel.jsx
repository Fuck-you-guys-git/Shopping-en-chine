import { CreditCard, Loader2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { t, formatPaid, formatMoney, getLocale } from "@/lib/locale";

// Panneau paiement CARTE via le widget Paxity (Visa / Mastercard).
// Paxity n'encaisse qu'en F CFA : on débite donc toujours en XOF.
// Pour un visiteur €/$ on affiche l'équivalent locale en disclaimer.
export const PaxityCardPanel = ({ total, currency = "XOF", localizedTotal, processing, onBack, onPay }) => {
    const displayCurrency = getLocale().currency;
    const showDisclaimer = currency === "XOF" && displayCurrency !== "XOF" && localizedTotal != null;
    return (
        <div className="space-y-4" data-testid="paxity-card-panel">
            <p className="text-sm text-muted-foreground flex items-center gap-2">
                <CreditCard className="h-4 w-4 text-indigo-600" />
                {t("Payez par carte Visa ou Mastercard — le formulaire sécurisé Paxity s'ouvre dans une fenêtre.")}
            </p>
            {showDisclaimer && (
                <div className="text-xs rounded-xl bg-amber-50 border border-amber-200 text-amber-900 px-3 py-2 leading-relaxed" data-testid="paxity-card-disclaimer">
                    <span className="font-medium">{t("Vous paierez")} {formatMoney(total)}</span>
                    {" "}{t("(total affiché :")} {formatPaid(localizedTotal, displayCurrency)}).
                    {" "}{t("Votre banque applique le taux de change.")}
                </div>
            )}
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <ShieldCheck className="h-4 w-4 text-success" />            {t("Paiement sécurisé via Paxity · Chiffrement bout-en-bout")}
            </div>
            <div className="flex gap-2 pt-2">
                <Button type="button" variant="outline" onClick={onBack} className="rounded-full h-11 px-6">{t("Retour")}</Button>
                <Button
                    type="button"
                    data-testid="paxity-card-pay-btn"
                    onClick={onPay}
                    disabled={processing}
                    className="bg-primary hover:bg-primary/90 text-primary-foreground rounded-full h-11 px-8 flex-1 sm:flex-none shadow-warm"
                >
                    {processing ? (
                        <><Loader2 className="h-4 w-4 animate-spin" /> {t("Chargement…")}</>
                    ) : (
                        <>{t("Payer par carte")} {formatPaid(total, currency)}</>
                    )}
                </Button>
            </div>
        </div>
    );
};
