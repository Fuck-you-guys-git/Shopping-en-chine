import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { stripeAPI } from "@/lib/api";
import { useCart } from "@/context/CartContext";
import { toast } from "sonner";

export default function PaymentSuccess() {
    const [searchParams] = useSearchParams();
    const sessionId = searchParams.get("session_id");
    const { clear } = useCart();
    const [state, setState] = useState("checking"); // checking | paid | failed | timeout
    const [orderId, setOrderId] = useState(null);
    const attempts = useRef(0);

    useEffect(() => {
        if (!sessionId) { setState("failed"); return; }
        let cancelled = false;
        const poll = async () => {
            if (cancelled) return;
            attempts.current += 1;
            try {
                const res = await stripeAPI.status(sessionId);
                if (cancelled) return;
                if (res.payment_status === "paid") {
                    setOrderId(res.order_id);
                    setState("paid");
                    clear();
                    toast.success("Paiement confirmé ✦");
                    return;
                }
                if (["failed", "expired"].includes(res.payment_status)) {
                    setState("failed");
                    return;
                }
            } catch {
                // transient — keep polling
            }
            if (attempts.current >= 10) { setState("timeout"); return; }
            setTimeout(poll, 2000);
        };
        poll();
        return () => { cancelled = true; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [sessionId]);

    return (
        <div className="container mx-auto px-5 py-24 max-w-lg text-center" data-testid="payment-success-page">
            {state === "checking" && (
                <>
                    <Loader2 className="h-12 w-12 mx-auto animate-spin text-primary mb-6" />
                    <h1 className="font-display text-3xl mb-2">Vérification du paiement…</h1>
                    <p className="text-muted-foreground text-sm">Un instant, nous confirmons votre transaction.</p>
                </>
            )}
            {state === "paid" && (
                <>
                    <div className="h-20 w-20 mx-auto rounded-full bg-success/10 text-success flex items-center justify-center mb-6">
                        <CheckCircle2 className="h-10 w-10" />
                    </div>
                    <h1 className="font-display text-3xl mb-2" data-testid="stripe-order-confirmed-title">Votre commande est confirmée 🎉</h1>
                    <p className="text-muted-foreground text-sm mb-2">Merci pour votre achat ! Livraison Chine → Dakar sous 10 à 20 jours.</p>
                    {orderId && <p className="font-mono text-sm mb-6">N° de commande : <strong>{orderId}</strong></p>}
                    <div className="flex flex-col sm:flex-row gap-3 justify-center">
                        {orderId && (
                            <Button asChild className="bg-primary text-primary-foreground rounded-full h-11 px-6">
                                <Link to={`/suivi/${orderId}`}>Suivre ma commande</Link>
                            </Button>
                        )}
                        <Button asChild variant="outline" className="rounded-full h-11 px-6">
                            <Link to="/boutique">Continuer mes achats</Link>
                        </Button>
                    </div>
                </>
            )}
            {(state === "failed" || state === "timeout") && (
                <>
                    <div className="h-20 w-20 mx-auto rounded-full bg-destructive/10 text-destructive flex items-center justify-center mb-6">
                        <XCircle className="h-10 w-10" />
                    </div>
                    <h1 className="font-display text-3xl mb-2">
                        {state === "timeout" ? "Vérification en cours" : "Paiement non confirmé"}
                    </h1>
                    <p className="text-muted-foreground text-sm mb-6">
                        {state === "timeout"
                            ? "Votre paiement est peut-être encore en traitement. Vérifiez vos emails ou réessayez."
                            : "Le paiement n'a pas abouti. Vos articles sont toujours dans votre panier."}
                    </p>
                    <Button asChild className="bg-primary text-primary-foreground rounded-full h-11 px-6">
                        <Link to="/commande">Réessayer le paiement</Link>
                    </Button>
                </>
            )}
        </div>
    );
}
