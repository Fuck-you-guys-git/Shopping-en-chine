import {
    DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Check, ChevronDown } from "lucide-react";
import { LOCALE_PRESETS } from "@/lib/locale";
import { useLocale } from "@/context/LocaleContext";

/*
 * Sélecteur langue + devise (drapeaux) affiché dans la barre du haut.
 * 🇸🇳 FR · F CFA — 🇪🇺 FR · € — 🇺🇸 EN · $
 */
export const LocaleSwitcher = () => {
    const { preset, setLocale } = useLocale();
    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <button
                    type="button"
                    data-testid="locale-switcher-btn"
                    className="inline-flex items-center gap-1.5 hover:text-primary transition-colors font-medium"
                >
                    <span className="text-sm leading-none">{preset.flag}</span>
                    <span>{preset.short}</span>
                    <ChevronDown className="h-3 w-3 opacity-60" />
                </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="min-w-[180px]">
                {LOCALE_PRESETS.map((p) => (
                    <DropdownMenuItem
                        key={p.id}
                        data-testid={`locale-option-${p.id}`}
                        onClick={() => setLocale(p.lang, p.currency)}
                        className="flex items-center gap-2 cursor-pointer"
                    >
                        <span className="text-base leading-none">{p.flag}</span>
                        <span className="flex-1 text-sm">{p.label}</span>
                        {preset.id === p.id && <Check className="h-3.5 w-3.5 text-primary" />}
                    </DropdownMenuItem>
                ))}
            </DropdownMenuContent>
        </DropdownMenu>
    );
};
