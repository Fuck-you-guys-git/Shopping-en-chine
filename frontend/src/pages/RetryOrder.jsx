import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { paxityAPI } from "@/lib/api";
import { useCart } from "@/context/CartContext";
import { useCatalog } from "@/context/CatalogContext";
import { toast } from "sonner";

/**
 * One-click cart recovery: /reprise/:orderId
 * Reloads the items of an unpaid order into the cart, then goes to checkout.
 */
export default function RetryOrder() {
    const { orderId } = useParams();
    const navigate = useNavigate();
    const { addItem, clear } = useCart();
    const { products } = useCatalog();
    const [error, setError] = useState(null);
    const ran = useRef(false);

    useEffect(() => {
        if (ran.current) return;
        ran.current = true;
        (async () => {
            try {
                const order = await paxityAPI.getOrder(orderId);
                const items = order.items || [];
                if (!items.length) throw new Error("empty");
                clear();
                items.forEach((it) => {
                    const p = products.find((x) => x.id === it.product_id);
                    addItem(
                        p || { id: it.product_id, name: it.name, price: it.price, image: null },
                        it.qty || 1,
                    );
                });
                toast.success("Panier restauré ✦", { description: "Finalisez votre paiement." });
                navigate("/commande", { replace: true });
            } catch {
                setError("Commande introuvable ou expirée.");
            }
        })();
    }, [orderId, addItem, clear, navigate, products]);

    return (
        <div className="container mx-auto px-5 py-24 text-center" data-testid="retry-order-page">
            {error ? (
                <>
                    <h1 className="font-display text-3xl mb-3">Oups</h1>
                    <p className="text-muted-foreground">{error}</p>
                </>
            ) : (
                <>
                    <Loader2 className="h-10 w-10 mx-auto animate-spin text-primary mb-4" />
                    <p className="text-muted-foreground">Restauration de votre panier…</p>
                </>
            )}
        </div>
    );
}
