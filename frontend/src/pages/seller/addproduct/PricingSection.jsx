import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// Carte « Prix » : F CFA uniquement — tous les clients paient en F CFA
export const PricingSection = ({ form, set }) => (
    <div className="bg-card rounded-2xl p-5 md:p-6 shadow-card border border-border/50">
        <h3 className="font-display text-lg font-medium mb-1">Prix</h3>
        <p className="text-xs text-muted-foreground mb-5">Tous les clients (Afrique, Europe, USA) voient et paient ce prix en F CFA via Wave ou Orange Money.</p>
        <div className="grid sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
                <Label htmlFor="price">Prix de vente (F CFA) *</Label>
                <div className="relative">
                    <Input id="price" data-testid="price-input" type="number" min="0" step="500" value={form.price} onChange={(e) => set("price", e.target.value)} placeholder="25000" className="pr-10" />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">F</span>
                </div>
            </div>
        </div>
    </div>
);
