import { useEffect } from "react";
import { useLocation, useNavigationType } from "react-router-dom";

// Gestion du défilement entre les pages :
// - Nouvelle navigation (clic sur un lien) : on remonte en haut.
// - Retour/avance navigateur (POP) : on restaure l'endroit EXACT où était le
//   client (ex : retour d'une fiche produit vers la liste de la boutique).
const positions = new Map();

// Le navigateur ne doit pas interférer avec notre restauration manuelle
if ("scrollRestoration" in window.history) {
    window.history.scrollRestoration = "manual";
}

export default function ScrollToTop() {
    const location = useLocation();
    const navType = useNavigationType();

    // Sauvegarde continue de la position pour la page courante
    useEffect(() => {
        const key = location.key || location.pathname;
        const save = () => positions.set(key, window.scrollY);
        window.addEventListener("scroll", save, { passive: true });
        return () => window.removeEventListener("scroll", save);
    }, [location]);

    useEffect(() => {
        const key = location.key || location.pathname;
        if (navType === "POP" && positions.has(key)) {
            const saved = positions.get(key);
            // Le contenu (produits, images) peut mettre quelques frames à
            // s'afficher : on retente brièvement jusqu'à pouvoir restaurer.
            let tries = 0;
            const restore = () => {
                window.scrollTo(0, saved);
                if (Math.abs(window.scrollY - saved) > 2 && tries++ < 30) {
                    requestAnimationFrame(restore);
                }
            };
            requestAnimationFrame(restore);
            return;
        }
        window.scrollTo({ top: 0, behavior: "instant" });
    }, [location, navType]);

    return null;
}
