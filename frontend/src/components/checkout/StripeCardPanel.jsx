import { Loader2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { t, getLocale, fmtAmount, cartDisplayTotal } from "@/lib/locale";

// Panneau paiement carte (Stripe embarqué) — le client paie dans SA devise
export const StripeCardPanel = ({ items, processing, onBack, onPay }) => (
    <div className="space-y-4" data-testid="stripe-card-panel">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <ShieldCheck className="h-4 w-4 text-success" />
            {t("Paiement sécurisé via Stripe · Chiffrement bout-en-bout")}
        </div>
        {getLocale().currency !== "XOF" && (
            <p className="text-[11px] text-muted-foreground" data-testid="stripe-currency-note">
                {t("Vous payez par carte dans votre devise :")} <span className="font-medium text-foreground">{fmtAmount(cartDisplayTotal(items))}</span>
            </p>
        )}
        <div className="flex gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onBack} className="rounded-full h-11 px-6">{t("Retour")}</Button>
            <Button
                type="button"
                data-testid="stripe-pay-btn"
                onClick={onPay}
                disabled={processing}
                className="bg-primary hover:bg-primary/90 text-primary-foreground rounded-full h-11 px-8 flex-1 sm:flex-none shadow-warm"
            >
                {processing ? (
                    <><Loader2 className="h-4 w-4 animate-spin" /> {t("Chargement…")}</>
                ) : (
                    <>{t("Payer par carte")} {fmtAmount(cartDisplayTotal(items))}</>
                )}
            </Button>
        </div>
    </div>
);
