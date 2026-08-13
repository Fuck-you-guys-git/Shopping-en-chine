// Constantes partagées du formulaire produit vendeur

export const SAMPLE_IMAGES = [
    "https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=600&q=80",
    "https://images.unsplash.com/photo-1546435770-a3e426bf472b?w=600&q=80",
    "https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=600&q=80",
    "https://images.unsplash.com/photo-1602143407151-7111542de6e8?w=600&q=80",
    "https://images.unsplash.com/photo-1560343090-f0409e92791a?w=600&q=80",
    "https://images.unsplash.com/photo-1526170375885-4d8ecf77b99f?w=600&q=80",
];

export const MAX_PHOTOS = 5;

// Tailles proposées au vendeur (facultatif)
export const LETTER_SIZES = ["XS", "S", "M", "L", "XL", "2XL", "3XL", "4XL"];
export const NUMERIC_SIZES = Array.from({ length: 55 }, (_, i) => String(i + 1));
const SIZE_ORDER = [...LETTER_SIZES, ...NUMERIC_SIZES];
export const sortSizes = (arr) => [...arr].sort((a, b) => SIZE_ORDER.indexOf(a) - SIZE_ORDER.indexOf(b));
