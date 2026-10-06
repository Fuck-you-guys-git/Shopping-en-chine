import { Loader2, ShieldCheck, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatPrice } from "@/components/ProductCard";
import { t } from "@/lib/locale";

const EXPECTED_DIGITS = { 221: 9, 225: 10 };

// Formulaire Wave / Orange Money : indicatif + numéro, puis lien de paiement
export const PaxityPhoneForm = ({ buyer, setBuyer, prefix, setPrefix, processing, disabled, total, localizedTotalLabel, onSubmit, onBack }) => {
    const digits = buyer.phone.replace(/\D/g, "").length;
    const expected = EXPECTED_DIGITS[prefix] ? `${EXPECTED_DIGITS[prefix]} ${t("chiffres")}` : `8 à 10 ${t("chiffres")}`;
    return (
        <form onSubmit={onSubmit} className="space-y-4">
            {localizedTotalLabel && (
                <div data-testid="mobile-money-xof-notice" className="flex gap-3 p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs">
                    <Info className="h-4 w-4 shrink-0 mt-0.5" />
                    <p>
                        <span className="font-semibold">{t("Wave et Orange Money encaissent uniquement en F CFA.")}</span>{" "}
                        {t("Vous paierez")} <span className="font-semibold">{formatPrice(total)} CFA</span> {t("(total affiché :")} {localizedTotalLabel}). {t("Votre banque applique le taux de change.")}
                    </p>
                </div>
            )}
            <div className="grid grid-cols-[100px_1fr] gap-2">
                <div className="space-y-1.5">
                    <Label>{t("Indicatif")}</Label>
                    <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">+</span>
                        <Input value={prefix} onChange={(e) => setPrefix(e.target.value.replace(/\D/g, ""))} className="pl-6" data-testid="paxity-prefix-input" />
                    </div>
                </div>
                <div className="space-y-1.5">
                    <Label>{t("Numéro de téléphone")}</Label>
                    <Input
                        required
                        type="tel"
                        value={buyer.phone}
                        onChange={(e) => setBuyer({ ...buyer, phone: e.target.value })}
                        data-testid="paxity-phone-input"
                    />
                    <p className="text-[11px] text-muted-foreground">
                        {`+${prefix} — ${t("attendu :")} ${expected} · ${t("saisi :")} ${digits}`}
                    </p>
                </div>
            </div>
            <p className="text-[11px] text-muted-foreground">
                {t("Après validation, vous recevrez une demande de paiement à confirmer dans votre application.")}
            </p>

            <div className="flex items-center gap-2 text-xs text-muted-foreground pt-2">
                <ShieldCheck className="h-4 w-4 text-success" />
                {t("Paiement sécurisé via Paxity · Chiffrement bout-en-bout")}
            </div>

            <div className="flex gap-2 pt-2">
                <Button type="button" variant="outline" onClick={onBack} className="rounded-full h-11 px-6">{t("Retour")}</Button>
                <Button
                    type="submit"
                    disabled={processing || disabled}
                    data-testid="paxity-pay-btn"
                    className="bg-primary hover:bg-primary/90 text-primary-foreground rounded-full h-11 px-8 flex-1 sm:flex-none shadow-warm"
                >
                    {processing ? (
                        <>
                            <Loader2 className="h-4 w-4 animate-spin" />
                            {t("Traitement…")}
                        </>
                    ) : (
                        `${t("Payer")} ${formatPrice(total)}`
                    )}
                </Button>
            </div>
        </form>
    );
};
