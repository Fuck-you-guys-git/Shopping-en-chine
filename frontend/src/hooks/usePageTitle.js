import { useEffect } from "react";

/** Définit le titre + la meta description de la page (SEO). */
export const usePageTitle = (title, description) => {
    useEffect(() => {
        document.title = title ? `${title} · Shopping en Chine` : "Shopping en Chine — Livraison Chine → Dakar en 10–20 jours";
        if (description) {
            let meta = document.querySelector('meta[name="description"]');
            if (!meta) {
                meta = document.createElement("meta");
                meta.name = "description";
                document.head.appendChild(meta);
            }
            meta.content = description;
        }
    }, [title, description]);
};
