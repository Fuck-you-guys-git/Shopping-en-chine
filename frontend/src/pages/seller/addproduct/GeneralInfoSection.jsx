import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { categories, subcategoriesByCategory } from "@/data/products";

// Carte « Informations générales » : nom, catégorie, badge, description, mots-clés
export const GeneralInfoSection = ({ form, set }) => (
    <div className="bg-card rounded-2xl p-5 md:p-6 shadow-card border border-border/50">
        <h3 className="font-display text-lg font-medium mb-1">Informations générales</h3>
        <p className="text-xs text-muted-foreground mb-5">Renseignez les détails principaux du produit.</p>
        <div className="space-y-4">
            <div className="space-y-1.5">
                <Label htmlFor="name">Nom du produit *</Label>
                <Input id="name" value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Ex : Sac à dos en cuir tressé" />
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                    <Label>Catégorie *</Label>
                    <Select value={form.category} onValueChange={(v) => { set("category", v); set("subcategory", ""); }}>
                        <SelectTrigger><SelectValue placeholder="Choisir une catégorie" /></SelectTrigger>
                        <SelectContent>
                            {categories.map((c) => (
                                <SelectItem key={c.id} value={c.id}>
                                    <span className="flex items-center gap-2">
                                        <i className={`fa-solid ${c.icon} text-primary text-xs`} />
                                        {c.name}
                                    </span>
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
                <div className="space-y-1.5">
                    <Label htmlFor="badge">Badge (optionnel)</Label>
                    <Select value={form.badge} onValueChange={(v) => set("badge", v === "none" ? "" : v)}>
                        <SelectTrigger><SelectValue placeholder="Aucun" /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="none">Aucun</SelectItem>
                            <SelectItem value="Nouveauté">Nouveauté</SelectItem>
                            <SelectItem value="Bestseller">Bestseller</SelectItem>
                            <SelectItem value="Édition limitée">Édition limitée</SelectItem>
                            <SelectItem value="Promo">Promo</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
            </div>
            {subcategoriesByCategory[form.category] && (
                <div className="space-y-1.5">
                    <Label>Sous-catégorie (optionnel)</Label>
                    <Select value={form.subcategory} onValueChange={(v) => set("subcategory", v === "none" ? "" : v)}>
                        <SelectTrigger data-testid="product-subcategory-select"><SelectValue placeholder="Choisir une sous-catégorie" /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="none">Aucune</SelectItem>
                            {subcategoriesByCategory[form.category].map((s) => (
                                <SelectItem key={s.id} value={s.id}>
                                    <span className="flex items-center gap-2">
                                        <i className={`fa-solid ${s.icon} text-primary text-xs`} />
                                        {s.name}
                                    </span>
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
            )}
            <div className="space-y-1.5">
                <Label htmlFor="desc">Description</Label>
                <Textarea
                    id="desc"
                    rows={4}
                    value={form.description}
                    onChange={(e) => set("description", e.target.value)}
                    placeholder="Décrivez les matériaux, avantages, dimensions…"
                />
            </div>
            <div className="space-y-1.5">
                <Label htmlFor="search-keywords">Mots-clés de recherche (optionnel)</Label>
                <Input
                    id="search-keywords"
                    data-testid="product-keywords-input"
                    value={form.searchKeywords}
                    onChange={(e) => set("searchKeywords", e.target.value)}
                    placeholder="Ex : ordinateur, macbook, pc portable (séparés par des virgules)"
                />
                <p className="text-xs text-muted-foreground">
                    Le client trouvera ce produit en cherchant ces mots, même s&apos;ils ne sont pas dans le nom.
                </p>
            </div>
        </div>
    </div>
);
