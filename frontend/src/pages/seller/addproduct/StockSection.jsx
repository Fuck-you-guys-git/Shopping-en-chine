import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

// Carte « Stock » : quantité disponible (optionnelle) + rupture de stock manuelle
export const StockSection = ({ form, set }) => {
    const autoSoldOut = form.stock !== "" && Number(form.stock) === 0;
    return (
        <div className="bg-card rounded-2xl p-5 md:p-6 shadow-card border border-border/50">
            <h3 className="font-display text-lg font-medium mb-1">Stock</h3>
            <p className="text-xs text-muted-foreground mb-5">
                Indiquez la quantité disponible. Laissez vide pour un stock illimité.
            </p>
            <div className="grid sm:grid-cols-2 gap-4 items-start">
                <div className="space-y-1.5">
                    <Label htmlFor="stock">Quantité en stock (optionnel)</Label>
                    <Input
                        id="stock"
                        data-testid="stock-input"
                        type="number"
                        min="0"
                        step="1"
                        value={form.stock}
                        onChange={(e) => set("stock", e.target.value)}
                        placeholder="Ex : 25"
                    />
                    {autoSoldOut && (
                        <p className="text-[11px] text-destructive">
                            Quantité à 0 : le produit sera affiché en rupture de stock.
                        </p>
                    )}
                </div>
                <div className="flex items-center justify-between gap-3 rounded-xl border border-border/60 px-4 py-3 sm:mt-6">
                    <div>
                        <p className="text-sm font-medium">En rupture de stock</p>
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                            Le produit reste visible mais ne peut plus être commandé.
                        </p>
                    </div>
                    <Switch
                        data-testid="out-of-stock-switch"
                        checked={form.outOfStock}
                        onCheckedChange={(v) => set("outOfStock", v)}
                    />
                </div>
            </div>
        </div>
    );
};
