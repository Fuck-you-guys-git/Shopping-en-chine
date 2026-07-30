// Palette de couleurs partagée (formulaire vendeur + fiche produit)
export const COLOR_PALETTE = [
    { hex: "#111111", name: "Noir" },
    { hex: "#FFFFFF", name: "Blanc" },
    { hex: "#808080", name: "Gris" },
    { hex: "#C0C0C0", name: "Argenté" },
    { hex: "#C9A26A", name: "Doré" },
    { hex: "#F5F1EA", name: "Beige" },
    { hex: "#8A5A44", name: "Marron" },
    { hex: "#C64C3A", name: "Rouge" },
    { hex: "#7B1E1E", name: "Bordeaux" },
    { hex: "#E8590C", name: "Orange" },
    { hex: "#F2C511", name: "Jaune" },
    { hex: "#2E7D5A", name: "Vert" },
    { hex: "#94D82D", name: "Vert clair" },
    { hex: "#7A6A54", name: "Kaki" },
    { hex: "#0B7285", name: "Turquoise" },
    { hex: "#87CEEB", name: "Bleu ciel" },
    { hex: "#3B5BDB", name: "Bleu" },
    { hex: "#1B2A4A", name: "Bleu marine" },
    { hex: "#7048E8", name: "Violet" },
    { hex: "#E64980", name: "Rose" },
    { hex: "#FFC0CB", name: "Rose clair" },
];

export const colorName = (hex) =>
    COLOR_PALETTE.find((c) => c.hex.toLowerCase() === (hex || "").toLowerCase())?.name || "";
