// Static storefront content. Products and prices come from the backend (GET /api/products).
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
