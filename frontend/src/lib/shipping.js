// Mirrors SHIPPING_METHODS in backend/orders.py, which is authoritative: the
// server recomputes shipping for every order. Keep the two in sync.
export const SHIPPING_METHODS = [
    { id: "standard", label: "Livraison standard", delay: "2–4 jours ouvrés", icon: "fa-truck", fee: 3000, freeFrom: 30000 },
    { id: "express", label: "Livraison express", delay: "24–48h chrono", icon: "fa-bolt", fee: 5000, freeFrom: null },
    { id: "relais", label: "Point relais", delay: "3–5 jours · 500+ points", icon: "fa-store", fee: 2000, freeFrom: null },
];

export const shippingFee = (methodId, subtotal) => {
    const method = SHIPPING_METHODS.find((m) => m.id === methodId);
    return method.freeFrom !== null && subtotal >= method.freeFrom ? 0 : method.fee;
};

/** Standard-delivery estimate shown in the cart before a method is chosen. */
export const estimateShipping = (subtotal) => (subtotal === 0 ? 0 : shippingFee("standard", subtotal));
