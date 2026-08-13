import { Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { t } from "@/lib/locale";

// Écran d'attente Paxity : lien/QR de paiement + vérification manuelle
export const CheckoutPending = ({ transaction, operatorLabel, onOpenPay, onManualCheck, checkingNow, onCancel }) => (
    <div className="container mx-auto px-5 py-24 text-center">
        <div className="max-w-lg mx-auto">
            <div className="h-20 w-20 mx-auto rounded-full bg-primary/10 text-primary flex items-center justify-center mb-6">
                <Loader2 className="h-10 w-10 animate-spin" />
            </div>
            <h1 className="font-display text-3xl sm:text-4xl mb-3">{t("Paiement en cours…")}</h1>
            <p className="text-muted-foreground mb-2">
                {t("Ouvrez l'application")} <span className="font-semibold text-foreground">{transaction.operator_label || operatorLabel}</span> {t("sur votre téléphone et validez la transaction.")}
            </p>
            <p className="text-xs text-muted-foreground mb-2" data-testid="paxity-return-hint">
                {t("Après validation, revenez sur cette page : votre confirmation s'affichera automatiquement et vous recevrez un email. Vous pouvez fermer la page de paiement.")}
            </p>
            {transaction.payment_link && (
                <div className="my-6 space-y-4">
                    <Button
                        size="lg"
                        className="rounded-full bg-ink text-ink-foreground hover:bg-ink/90"
                        onClick={() => onOpenPay(transaction.payment_link)}
                        data-testid="paxity-payment-link-btn"
                    >
                        {t("Payer maintenant")}
                    </Button>
                    {transaction.qr_code && (
                        <div className="flex justify-center">
                            <img
                                src={transaction.qr_code.startsWith("data:") ? transaction.qr_code : `data:image/png;base64,${transaction.qr_code}`}
                                alt="QR code de paiement"
                                className="h-40 w-40 rounded-lg border border-border bg-white p-2"
                                data-testid="paxity-qr-code"
                            />
                        </div>
                    )}
                </div>
            )}
            <p className="text-sm text-muted-foreground mb-6">
                {t("Après le paiement,")} <span className="font-medium text-foreground">{t("revenez sur cet onglet")}</span>{t(": votre confirmation s'affichera ici automatiquement.")}
            </p>
            <div className="mb-8">
                <Button
                    size="lg"
                    variant="outline"
                    onClick={onManualCheck}
                    disabled={checkingNow}
                    className="rounded-full border-primary text-primary hover:bg-primary hover:text-primary-foreground"
                    data-testid="paxity-manual-check-btn"
                >
                    {checkingNow ? (
                        <><Loader2 className="h-4 w-4 animate-spin" /> {t("Vérification…")}</>
                    ) : (
                        <><Check className="h-4 w-4" /> {t("J'ai payé — Vérifier")}</>
                    )}
                </Button>
            </div>
            <div className="inline-flex items-center gap-2 text-xs text-muted-foreground bg-secondary/50 rounded-full px-3 py-1.5">
                <span className="relative flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full rounded-full bg-primary opacity-75 animate-ping" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
                </span>
                {t("En attente de confirmation Paxity")}
            </div>
            <div className="mt-6">
                <button
                    type="button"
                    onClick={onCancel}
                    className="text-xs text-muted-foreground underline hover:text-foreground"
                    data-testid="paxity-cancel-pending-btn"
                >
                    {t("Annuler et choisir un autre moyen de paiement")}
                </button>
            </div>
        </div>
    </div>
);
