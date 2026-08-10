import { loadStripe } from "@stripe/stripe-js";
import { EmbeddedCheckoutProvider, EmbeddedCheckout } from "@stripe/react-stripe-js";
import { ArrowLeft } from "lucide-react";
import { t } from "@/lib/locale";

// Paiement par carte intégré : le formulaire Stripe s'affiche dans la page,
// le client ne quitte jamais le site. À la fin, Stripe le renvoie sur
// /payment/success?session_id=... (page de confirmation existante).
const stripePromise = loadStripe(process.env.REACT_APP_STRIPE_PUBLISHABLE_KEY);

export const StripeEmbedded = ({ clientSecret, onBack }) => (
    <div className="max-w-xl mx-auto" data-testid="stripe-embedded-checkout">
        <button
            type="button"
            onClick={onBack}
            data-testid="stripe-embedded-back-btn"
            className="mb-4 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
            <ArrowLeft className="h-4 w-4" /> {t("Retour au récapitulatif")}
        </button>
        <div className="bg-card rounded-2xl shadow-card border border-border/50 p-2 sm:p-4">
            <EmbeddedCheckoutProvider stripe={stripePromise} options={{ clientSecret }}>
                <EmbeddedCheckout />
            </EmbeddedCheckoutProvider>
        </div>
    </div>
);
