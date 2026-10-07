import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// Carte « Prix » : F CFA + EUR + USD tous OBLIGATOIRES (aucune conversion auto)
export const PricingSection = ({ form, set }) => (
    <div className="bg-card rounded-2xl p-5 md:p-6 shadow-card border border-border/50">
        <h3 className="font-display text-lg font-medium mb-1">Prix</h3>
        <p className="text-xs text-muted-foreground mb-5">Saisissez vos trois prix : F CFA (Afrique), euros (Europe) et dollars (USA/Canada). Chaque client voit et paie exactement le prix de sa zone — aucune conversion automatique.</p>
        <div className="grid sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
                <Label htmlFor="price">Prix de vente (F CFA) *</Label>
                <div className="relative">
                    <Input id="price" type="number" min="0" step="500" value={form.price} onChange={(e) => set("price", e.target.value)} placeholder="25000" className="pr-10" />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">F</span>
                </div>
            </div>
            <div className="space-y-1.5">
                <Label htmlFor="priceEur">Prix en euros *</Label>
                <div className="relative">
                    <Input id="priceEur" data-testid="price-eur-input" type="number" min="0" step="0.5" value={form.priceEur} onChange={(e) => set("priceEur", e.target.value)} className="pr-10" />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">€</span>
                </div>
                <p className="text-[11px] text-muted-foreground">Affiché et débité pour les clients d&apos;Europe.</p>
            </div>
            <div className="space-y-1.5">
                <Label htmlFor="priceUsd">Prix en dollars *</Label>
                <div className="relative">
                    <Input id="priceUsd" data-testid="price-usd-input" type="number" min="0" step="0.5" value={form.priceUsd} onChange={(e) => set("priceUsd", e.target.value)} className="pr-10" />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">$</span>
                </div>
                <p className="text-[11px] text-muted-foreground">Affiché et débité pour les clients USA / Canada.</p>
            </div>
        </div>
    </div>
);
