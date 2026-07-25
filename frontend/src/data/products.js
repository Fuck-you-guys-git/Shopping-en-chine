// Mock product catalogue for Shopping en Chine (prices in F CFA / XOF)
export const categories = [
    { id: "mode", name: "Mode", en: "Fashion", icon: "fa-shirt", count: 1240,
      image: "https://images.unsplash.com/photo-1558769132-cb1aea458c5e?w=800&q=80" },
    { id: "tech", name: "Électronique", en: "Electronics", icon: "fa-plug", count: 892,
      image: "https://images.unsplash.com/photo-1636115305669-9096bffe87fd?w=800&q=80" },
    { id: "maison", name: "Maison", en: "Home", icon: "fa-couch", count: 2103,
      image: "https://images.unsplash.com/photo-1618220179428-22790b461013?w=800&q=80" },
    { id: "beaute", name: "Beauté", en: "Beauty", icon: "fa-spa", count: 621,
      image: "https://images.unsplash.com/photo-1596462502278-27bfdc403348?w=800&q=80" },
    { id: "enfants", name: "Enfants", en: "Kids", icon: "fa-shapes", count: 456,
      image: "https://images.unsplash.com/photo-1545558014-8692077e9b5c?w=800&q=80" },
    { id: "cuisine", name: "Cuisine", en: "Kitchen", icon: "fa-mug-hot", count: 384,
      image: "https://images.unsplash.com/photo-1556909212-d5b604d0c90d?w=800&q=80" },
];

// Sous-catégories de la catégorie Mode (menu + filtre boutique).
// `keywords` sert de repli pour classer les produits existants sans champ subcategory.
export const modeSubcategories = [
    { id: "vetements", name: "Vêtements", icon: "fa-shirt", keywords: ["pull", "t-shirt", "tee-shirt", "robe", "chaussette", "veste", "pantalon", "jean", "chemise", "vêtement", "jupe", "short", "hoodie", "sweat"] },
    { id: "chaussures", name: "Chaussures", icon: "fa-shoe-prints", keywords: ["sneaker", "chaussure", "basket", "sandale", "botte", "mocassin", "talon"] },
    { id: "sacs", name: "Sacs", icon: "fa-bag-shopping", keywords: ["sac", "cartable", "valise", "pochette"] },
    { id: "lunettes", name: "Lunettes", icon: "fa-glasses", keywords: ["lunette"] },
    { id: "accessoires", name: "Accessoires", icon: "fa-star", keywords: ["ceinture", "casquette", "chapeau", "écharpe", "foulard", "portefeuille", "accessoire", "gant", "cravate"] },
    { id: "bijoux", name: "Bijoux", icon: "fa-gem", keywords: ["bijou", "collier", "bracelet", "bague", "boucle", "pendentif", "chaîne"] },
    { id: "montres", name: "Montres", icon: "fa-clock", keywords: ["montre", "chronographe", "chrono"] },
];

export const products = [
    {
        id: "p1", name: "Casque sans fil Aura Pro", category: "tech", price: 85000, oldPrice: 117000,
        rating: 4.8, reviews: 1284, badge: "Nouveauté",
        image: "https://images.pexels.com/photos/7772548/pexels-photo-7772548.jpeg?w=800",
        description: "Son immersif, réduction de bruit active, 40 h d'autonomie. Le compagnon parfait de vos journées.",
        colors: ["#111111", "#F5F1EA", "#C64C3A"],
    },
    {
        id: "p2", name: "Mug céramique Rituel", category: "cuisine", price: 12000, oldPrice: 15500,
        rating: 4.9, reviews: 402, badge: "Bestseller",
        image: "https://images.unsplash.com/photo-1616241673111-508b4662c707?w=800&q=80",
        description: "Céramique émaillée à la main. Ni deux mugs identiques. Résistant au lave-vaisselle.",
        colors: ["#F5F1EA", "#2E2A26"],
    },
    {
        id: "p3", name: "Sac Marché en cuir tressé", category: "mode", price: 58000, oldPrice: 84000,
        rating: 4.7, reviews: 218,
        image: "https://images.unsplash.com/photo-1605733513597-a8f8341084e6?w=800&q=80",
        description: "Cuir pleine fleur teinté à l'eau. Fait pour durer, patiner, vivre avec vous.",
        colors: ["#1D1D1D", "#8A5A44"],
    },
    {
        id: "p4", name: "Sneakers Éclat rouge", category: "mode", price: 48500, oldPrice: 65000,
        rating: 4.6, reviews: 512, badge: "-25%",
        image: "https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=800&q=80",
        description: "Mesh respirant, semelle EVA amortissante. Un rouge qui ne laisse personne indifférent.",
        colors: ["#C64C3A", "#F5F1EA"],
    },
    {
        id: "p5", name: "Chronographe Nord acier", category: "mode", price: 124000, oldPrice: 163000,
        rating: 4.9, reviews: 178,
        image: "https://images.unsplash.com/photo-1542496658-e33a6d0d50f6?w=800&q=80",
        description: "Mécanisme quartz suisse. Bracelet acier maille milanaise. Étanche 5 ATM.",
        colors: ["#B8B8B8", "#1D1D1D"],
    },
    {
        id: "p6", name: "Lunettes Dorées Solstice", category: "mode", price: 29500, oldPrice: 42500,
        rating: 4.5, reviews: 296,
        image: "https://images.unsplash.com/photo-1511499767150-a48a237f0083?w=800&q=80",
        description: "Monture métal doré poli. Verres polarisés UV400. Étui en cuir offert.",
        colors: ["#C9A26A", "#1D1D1D"],
    },
    {
        id: "p7", name: "Bougie Cèdre & Ambre", category: "maison", price: 18500, oldPrice: 22500,
        rating: 4.8, reviews: 634, badge: "Édition limitée",
        image: "https://images.unsplash.com/photo-1594813591867-02e797aa4581?w=800&q=80",
        description: "Cire de soja, mèche coton. 45 h de brûlage. Parfum créé à Grasse.",
        colors: ["#F5F1EA", "#8A5A44"],
    },
    {
        id: "p8", name: "Pull maille Hiver doux", category: "mode", price: 44500, oldPrice: 58500,
        rating: 4.7, reviews: 342,
        image: "https://images.unsplash.com/photo-1601379327928-bedfaf9da2d0?w=800&q=80",
        description: "70% laine mérinos, 30% cachemire. Coupe droite, col rond. Tricoté au Portugal.",
        colors: ["#EFE6D6", "#7A6A54", "#1D1D1D"],
    },
    {
        id: "p9", name: "Écouteurs filaires métal", category: "tech", price: 2000, oldPrice: 3500,
        rating: 4.6, reviews: 89, badge: "Petit prix",
        image: "https://images.unsplash.com/photo-1484704849700-f032a568e944?w=800&q=80",
        description: "Écouteurs filaires finition métal, son clair et basses présentes. Micro intégré pour vos appels.",
        colors: ["#1D1D1D", "#B8B8B8"],
    },
    {
        id: "p10", name: "Paire de chaussettes coton", category: "mode", price: 2000, oldPrice: 3000,
        rating: 4.5, reviews: 154, badge: "Petit prix",
        image: "https://images.unsplash.com/photo-1586350977771-b3b0abd50c82?w=800&q=80",
        description: "Coton doux et respirant, coutures plates. Confort toute la journée.",
        colors: ["#F5F1EA", "#2E2A26", "#C64C3A"],
    },
];

// Products added by the seller (Espace vendeur) are persisted in
// localStorage under this key by SellerContext. Merge them with the static
// catalog so they also appear on the public shop and product pages.
const SELLER_PRODUCTS_KEY = "sec_seller_products_v1";

export const getAllProducts = () => {
    try {
        const raw = localStorage.getItem(SELLER_PRODUCTS_KEY);
        if (!raw) return products;
        const stored = JSON.parse(raw);
        if (!Array.isArray(stored)) return products;
        const seedIds = new Set(products.map((p) => p.id));
        const custom = stored.filter((p) => p && p.id && p.name && !seedIds.has(p.id));
        return [...custom, ...products];
    } catch {
        return products;
    }
};

export const testimonials = [
    {
        name: "Aminata Diallo", city: "Dakar", rating: 5,
        avatar: "https://images.unsplash.com/photo-1580489944761-15a19d654956?w=200&q=80",
        text: "Livré en 4 jours, exactement comme sur la photo. J'ai commandé trois fois ce mois-ci — c'est devenu un rituel.",
    },
    {
        name: "Wei Chen", city: "Abidjan", rating: 5,
        avatar: "https://images.pexels.com/photos/37038761/pexels-photo-37038761.jpeg?w=200",
        text: "Enfin un site clair, sans pub agressive. On trouve, on clique, on reçoit. Simple et efficace.",
    },
    {
        name: "Sarah Benali", city: "Bamako", rating: 5,
        avatar: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=200&q=80",
        text: "Le sac en cuir est magnifique. Le service client a répondu en 10 minutes. Bravo.",
    },
];
