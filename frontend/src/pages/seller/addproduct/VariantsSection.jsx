import { Separator } from "@/components/ui/separator";
import { COLOR_PALETTE } from "@/lib/colors";
import { LETTER_SIZES, NUMERIC_SIZES, sortSizes } from "./constants";

// Carte « Variantes » : couleurs disponibles + tailles (lettres et numériques)
export const VariantsSection = ({ colors, sizes, onToggleColor, onToggleSize }) => (
    <div className="bg-card rounded-2xl p-5 md:p-6 shadow-card border border-border/50">
        <h3 className="font-display text-lg font-medium mb-1">Variantes (optionnel)</h3>
        <p className="text-xs text-muted-foreground mb-4">Sélectionnez les couleurs disponibles.</p>
        <div className="flex flex-wrap gap-3">
            {COLOR_PALETTE.map((c) => (
                <div key={c.hex} className="flex flex-col items-center gap-1 w-12">
                    <button
                        type="button"
                        onClick={() => onToggleColor(c.hex)}
                        title={c.name}
                        className={`h-10 w-10 rounded-full border-2 transition-all ${colors.includes(c.hex) ? "border-primary scale-110 ring-2 ring-primary/30" : "border-border"}`}
                        style={{ background: c.hex }}
                        aria-label={c.name}
                    />
                    <span className={`text-[9px] leading-none text-center ${colors.includes(c.hex) ? "text-primary font-semibold" : "text-muted-foreground"}`}>{c.name}</span>
                </div>
            ))}
        </div>

        <Separator className="my-5" />

        <p className="text-sm font-medium mb-1">
            Tailles disponibles {sizes.length > 0 && <span className="text-primary">({sizes.length})</span>}
        </p>
        <p className="text-xs text-muted-foreground mb-3">
            Facultatif — le client pourra choisir sa taille sur la fiche produit.
        </p>
        <div className="flex flex-wrap gap-2 mb-4" data-testid="letter-sizes">
            {LETTER_SIZES.map((s) => (
                <button
                    type="button"
                    key={s}
                    onClick={() => onToggleSize(s)}
                    data-testid={`seller-size-${s}`}
                    className={`h-9 min-w-[44px] px-3 rounded-full border text-sm font-medium transition-colors ${sizes.includes(s) ? "bg-ink text-ink-foreground border-ink" : "border-border hover:border-foreground"}`}
                >
                    {s}
                </button>
            ))}
        </div>
        <p className="text-xs text-muted-foreground mb-2">Tailles numériques (pointures, âges… de 1 à 55) :</p>
        <div className="grid grid-cols-8 sm:grid-cols-11 gap-1.5" data-testid="numeric-sizes">
            {NUMERIC_SIZES.map((s) => (
                <button
                    type="button"
                    key={s}
                    onClick={() => onToggleSize(s)}
                    data-testid={`seller-size-${s}`}
                    className={`h-8 rounded-lg border text-xs font-medium transition-colors ${sizes.includes(s) ? "bg-ink text-ink-foreground border-ink" : "border-border hover:border-foreground"}`}
                >
                    {s}
                </button>
            ))}
        </div>
        {sizes.length > 0 && (
            <p className="mt-3 text-xs text-muted-foreground">
                Sélection : <span className="font-medium text-foreground">{sortSizes(sizes).join(", ")}</span>
            </p>
        )}
    </div>
);
