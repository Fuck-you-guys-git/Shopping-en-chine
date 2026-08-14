import { clsx } from "clsx";
import { twMerge } from "tailwind-merge"

export function cn(...inputs) {
  return twMerge(clsx(inputs));
}

// Affichage des numéros de commande : #1000 (les anciens ids ord_xxx restent tels quels)
export const orderNo = (id) => {
    const s = String(id ?? "");
    if (/^\d+$/.test(s)) return `#${s}`;
    // Id temporaire : le numéro définitif est attribué au paiement confirmé
    if (s.startsWith("tmp_")) return "—";
    return s;
};
