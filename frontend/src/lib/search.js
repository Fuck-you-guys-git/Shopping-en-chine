import { categories, subcategoriesByCategory } from "@/data/products";

// Normalise : minuscules + sans accents
const norm = (s) =>
    (s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

/**
 * Recherche intelligente : un produit correspond si la requête touche
 * son nom, sa description, sa catégorie, OU une sous-catégorie dont il
 * fait partie (champ subcategory ou mots-clés dans le nom).
 * Ex. « ordinateur » → tous les MacBook/laptops même sans le mot « ordinateur ».
 */
export const productMatchesQuery = (product, query) => {
    const q = norm(query).trim();
    if (!q) return true;
    const name = norm(product.name);
    const desc = norm(product.description);
    if (name.includes(q) || desc.includes(q)) return true;

    // Mots-clés de recherche définis par le vendeur
    if ((product.keywords || []).some((k) => {
        const t = norm(k);
        return t.includes(q) || q.includes(t);
    })) return true;

    const cat = categories.find((c) => c.id === product.category);
    if (cat && norm(cat.name).includes(q)) return true;

    for (const [catId, subs] of Object.entries(subcategoriesByCategory)) {
        for (const sub of subs) {
            const terms = [sub.name, ...sub.keywords].map(norm);
            const queryHitsSub = terms.some((t) => t.includes(q) || q.includes(t));
            if (!queryHitsSub) continue;
            if (product.subcategory === sub.id) return true;
            if (product.category === catId && sub.keywords.some((k) => name.includes(norm(k)))) return true;
        }
    }
    return false;
};
