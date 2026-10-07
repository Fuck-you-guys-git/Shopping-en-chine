import { useEffect, useRef } from "react";
import { loadPaxity } from "@/lib/paxity";

const CONTAINER_ID = "paxity-checkout";

/**
 * Paxity v2 widget, inline mode. Every amount comes from the order the
 * backend created, never from the cart in the browser.
 */
export const PaxityWidget = ({ order, orgId, onSuccess, onFailure, onCancel, onError }) => {
    const mountedFor = useRef(null);
    // Latest callbacks, so a parent re-render never re-mounts the widget.
    const handlers = useRef();
    handlers.current = { onSuccess, onFailure, onCancel, onError };

    useEffect(() => {
        if (mountedFor.current === order.id) return; // StrictMode runs effects twice in development
        mountedFor.current = order.id;

        loadPaxity()
            .then((Paxity) => {
                if (!document.getElementById(CONTAINER_ID)) return; // customer left the page meanwhile
                Paxity.mount({
                    currency: order.payment_currency,
                    country: order.customer.country,
                    amount_minor: order.amount_minor,
                    org_id: orgId,
                    container: `#${CONTAINER_ID}`,
                    // Mobile Money is the widget's default tab; cards open the card tab.
                    ...(order.payment_method === "carte" ? { default_method: "CARD" } : {}),
                    onSuccess: () => handlers.current.onSuccess(),
                    onFailure: (reason) => handlers.current.onFailure(reason),
                    onCancel: () => handlers.current.onCancel(),
                    onError: (message) => handlers.current.onError(message),
                });
            })
            .catch((err) => handlers.current.onError(err.message));
    }, [order, orgId]);

    return <div id={CONTAINER_ID} className="min-h-[420px]" />;
};
