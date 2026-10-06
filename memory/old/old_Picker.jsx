import { CreditCard, Phone } from "lucide-react";
import { t } from "@/lib/locale";
import { OPERATOR_META } from "./operatorMeta";

// Grille de choix du moyen de paiement (Mobile Money Paxity + Carte Stripe)
export const PaymentMethodPicker = ({ methods = [], value, onSelect, onSelectCard }) => (
    <div>
        <p className="text-sm font-medium mb-3">{t("Choisissez votre moyen de paiement")}</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {methods.map((m) => {
                const meta = OPERATOR_META[m.icon] || OPERATOR_META.card;
                const active = value === m.code;
                return (
                    <button
                        key={m.code}
                        type="button"
                        data-testid={`paxity-method-btn-${m.code}`}
                        onClick={() => onSelect(m)}
                        className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 transition-all ${active ? "border-primary bg-primary/5" : "border-border hover:border-foreground/30"}`}
                    >
                        <span className={`h-10 w-10 rounded-full flex items-center justify-center ${meta.bg}`}>
                            {m.icon === "card" ? (
                                <CreditCard className="h-4 w-4" style={{ color: meta.color }} />
                            ) : (
                                <Phone className="h-4 w-4" style={{ color: meta.color }} />
                            )}
                        </span>
                        <span className="text-xs font-medium text-center leading-tight">{m.label}</span>
                    </button>
                );
            })}
            {/* Paiement par carte (Stripe) : affiché seulement si activé */}
            {onSelectCard && (
                <button
                    type="button"
                    data-testid="stripe-card-method-btn"
                    onClick={onSelectCard}
                    className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 transition-all ${value === "CARD" ? "border-primary bg-primary/5" : "border-border hover:border-foreground/30"}`}
                >
                    <span className="h-10 w-10 rounded-full flex items-center justify-center bg-indigo-500/10">
                        <CreditCard className="h-4 w-4 text-indigo-600" />
                    </span>
                    <span className="text-xs font-medium text-center leading-tight">{t("Carte bancaire")}</span>
                </button>
            )}
        </div>
    </div>
);
