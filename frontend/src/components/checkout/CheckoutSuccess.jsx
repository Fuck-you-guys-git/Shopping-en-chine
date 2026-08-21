import { Link } from "react-router-dom";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { OrderSummary } from "@/components/OrderSummary";
import { formatPrice } from "@/components/ProductCard";
import { orderNo } from "@/lib/utils";
import { t, formatPaid } from "@/lib/locale";

// Écran de confirmation après paiement réussi
export const CheckoutSuccess = ({ transaction, total }) => (
    <div className="container mx-auto px-5 py-24 text-center">
        <div className="max-w-lg mx-auto">
            <div className="h-20 w-20 mx-auto rounded-full bg-success/10 text-success flex items-center justify-center mb-6">
                <Check className="h-10 w-10" />
            </div>
            <h1 className="font-display text-4xl sm:text-5xl mb-3" data-testid="order-confirmed-title">{t("Votre commande est confirmée 🎉")}</h1>
            <p className="text-muted-foreground mb-2">
                {t("Merci ! Votre paiement de")} <span className="font-semibold text-foreground">{transaction?.currency && transaction.currency !== "XOF" ? formatPaid(transaction.amount, transaction.currency) : formatPrice(transaction?.amount ?? total)}</span> {t("a bien été reçu. Nous préparons votre commande pour l'expédition depuis la Chine.")}
            </p>
            {transaction?.order_id && (
                <p className="text-xs font-mono text-muted-foreground mb-8">{t("Commande")} {orderNo(transaction.order_id)}</p>
            )}
            {transaction?.order_id && <OrderSummary orderId={transaction.order_id} />}
            <div className="flex flex-wrap gap-3 justify-center mt-8">
                {transaction?.order_id && (
                    <Button asChild size="lg" className="rounded-full bg-primary text-primary-foreground hover:bg-primary/90" data-testid="track-order-btn">
                        <Link to={`/suivi/${transaction.order_id}`}>{t("Suivre ma commande")}</Link>
                    </Button>
                )}
                <Button asChild size="lg" className="rounded-full bg-ink text-ink-foreground hover:bg-ink/90">
                    <Link to="/">{t("Retour à l'accueil")}</Link>
                </Button>
                <Button asChild size="lg" variant="outline" className="rounded-full">
                    <Link to="/boutique">{t("Continuer les achats")}</Link>
                </Button>
            </div>
        </div>
    </div>
);
