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

// Nom de couleur JAMAIS en hex : pour un code hors palette, retourne la
// couleur de la palette la plus proche (distance RGB). "" si hex invalide.
export const nearestColorName = (hex) => {
    const exact = colorName(hex);
    if (exact) return exact;
    const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || "").trim());
    if (!m) return "";
    const [r, g, b] = [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16));
    let best = "";
    let bestD = Infinity;
    for (const c of COLOR_PALETTE) {
        const [r2, g2, b2] = [1, 3, 5].map((i) => parseInt(c.hex.slice(i, i + 2), 16));
        const d = (r - r2) ** 2 + (g - g2) ** 2 + (b - b2) ** 2;
        if (d < bestD) { bestD = d; best = c.name; }
    }
    return best;
};
