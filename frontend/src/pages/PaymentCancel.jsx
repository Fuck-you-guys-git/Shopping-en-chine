import { Link } from "react-router-dom";
import { XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { t } from "@/lib/locale";

export default function PaymentCancel() {
    return (
        <div className="container mx-auto px-5 py-24 max-w-lg text-center" data-testid="payment-cancel-page">
            <div className="h-20 w-20 mx-auto rounded-full bg-amber-100 text-amber-600 flex items-center justify-center mb-6">
                <XCircle className="h-10 w-10" />
            </div>
            <h1 className="font-display text-3xl mb-2">{t("Paiement annulé")}</h1>
            <p className="text-muted-foreground text-sm mb-6">
                {t("Aucun montant n'a été débité. Vos articles sont toujours dans votre panier.")}
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <Button asChild className="bg-primary text-primary-foreground rounded-full h-11 px-6">
                    <Link to="/commande">{t("Reprendre le paiement")}</Link>
                </Button>
                <Button asChild variant="outline" className="rounded-full h-11 px-6">
                    <Link to="/boutique">{t("Retour à la boutique")}</Link>
                </Button>
            </div>
        </div>
    );
}
