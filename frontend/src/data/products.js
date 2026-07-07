// Mock product catalogue for Shopping en Chine
export const categories = [
    { id: "mode", name: "Mode", en: "Fashion", icon: "fa-shirt", count: 1240,
      image: "https://images.unsplash.com/photo-1558769132-cb1aea458c5e?w=800&q=80" },
    { id: "tech", name: "Tech & Gadgets", en: "Electronics", icon: "fa-headphones", count: 892,
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

export const products = [
    {
        id: "p1", name: "Casque sans fil Aura Pro", category: "tech", price: 129.9, oldPrice: 179,
        rating: 4.8, reviews: 1284, badge: "Nouveauté",
        image: "https://images.pexels.com/photos/7772548/pexels-photo-7772548.jpeg?w=800",
        description: "Son immersif, réduction de bruit active, 40 h d'autonomie. Le compagnon parfait de vos journées.",
        colors: ["#111111", "#F5F1EA", "#C64C3A"],
    },
    {
        id: "p2", name: "Mug céramique Rituel", category: "cuisine", price: 18.5, oldPrice: 24,
        rating: 4.9, reviews: 402, badge: "Bestseller",
        image: "https://images.unsplash.com/photo-1616241673111-508b4662c707?w=800&q=80",
        description: "Céramique émaillée à la main. Ni deux mugs identiques. Résistant au lave-vaisselle.",
        colors: ["#F5F1EA", "#2E2A26"],
    },
    {
        id: "p3", name: "Sac Marché en cuir tressé", category: "mode", price: 89, oldPrice: 129,
        rating: 4.7, reviews: 218,
        image: "https://images.unsplash.com/photo-1605733513597-a8f8341084e6?w=800&q=80",
        description: "Cuir pleine fleur teinté à l'eau. Fait pour durer, patiner, vivre avec vous.",
        colors: ["#1D1D1D", "#8A5A44"],
    },
    {
        id: "p4", name: "Sneakers Éclat rouge", category: "mode", price: 74, oldPrice: 99,
        rating: 4.6, reviews: 512, badge: "-25%",
        image: "https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=800&q=80",
        description: "Mesh respirant, semelle EVA amortissante. Un rouge qui ne laisse personne indifférent.",
        colors: ["#C64C3A", "#F5F1EA"],
    },
    {
        id: "p5", name: "Chronographe Nord acier", category: "mode", price: 189, oldPrice: 249,
        rating: 4.9, reviews: 178,
        image: "https://images.unsplash.com/photo-1542496658-e33a6d0d50f6?w=800&q=80",
        description: "Mécanisme quartz suisse. Bracelet acier maille milanaise. Étanche 5 ATM.",
        colors: ["#B8B8B8", "#1D1D1D"],
    },
    {
        id: "p6", name: "Lunettes Dorées Solstice", category: "mode", price: 45, oldPrice: 65,
        rating: 4.5, reviews: 296,
        image: "https://images.unsplash.com/photo-1511499767150-a48a237f0083?w=800&q=80",
        description: "Monture métal doré poli. Verres polarisés UV400. Étui en cuir offert.",
        colors: ["#C9A26A", "#1D1D1D"],
    },
    {
        id: "p7", name: "Bougie Cèdre & Ambre", category: "maison", price: 28, oldPrice: 34,
        rating: 4.8, reviews: 634, badge: "Édition limitée",
        image: "https://images.unsplash.com/photo-1594813591867-02e797aa4581?w=800&q=80",
        description: "Cire de soja, mèche coton. 45 h de brûlage. Parfum crée à Grasse.",
        colors: ["#F5F1EA", "#8A5A44"],
    },
    {
        id: "p8", name: "Pull maille Hiver doux", category: "mode", price: 68, oldPrice: 89,
        rating: 4.7, reviews: 342,
        image: "https://images.unsplash.com/photo-1601379327928-bedfaf9da2d0?w=800&q=80",
        description: "70% laine mérinos, 30% cachemire. Coupe droite, col rond. Tricoté au Portugal.",
        colors: ["#EFE6D6", "#7A6A54", "#1D1D1D"],
    },
];

export const testimonials = [
    {
        name: "Amélie Laurent", city: "Lyon", rating: 5,
        avatar: "https://images.unsplash.com/photo-1580489944761-15a19d654956?w=200&q=80",
        text: "Livré en 3 jours, exactement comme sur la photo. J'ai commandé trois fois ce mois-ci — c'est devenu un rituel.",
    },
    {
        name: "Wei Chen", city: "Paris", rating: 5,
        avatar: "https://images.pexels.com/photos/37038761/pexels-photo-37038761.jpeg?w=200",
        text: "Enfin un site clair, sans pub agressive. On trouve, on clique, on reçoit. Simple et efficace.",
    },
    {
        name: "Sarah Benali", city: "Marseille", rating: 5,
        avatar: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=200&q=80",
        text: "Le sac en cuir est magnifique. Le service client a répondu en 10 minutes. Bravo.",
    },
];
