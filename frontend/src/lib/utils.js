import { clsx } from "clsx";
import { twMerge } from "tailwind-merge"

export function cn(...inputs) {
  return twMerge(clsx(inputs));
}

// Affichage des numéros de commande : #1000 (les anciens ids ord_xxx restent tels quels)
export const orderNo = (id) => (/^\d+$/.test(String(id ?? "")) ? `#${id}` : id);
