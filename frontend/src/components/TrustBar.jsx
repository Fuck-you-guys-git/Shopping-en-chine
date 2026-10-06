import { Truck, ShieldCheck, Headset, PackageSearch } from "lucide-react";
import { t } from "@/lib/locale";

const items = [
    { icon: Truck, title: "Livraison internationale", desc: "Chine → monde, 10–20 jours" },
    { icon: ShieldCheck, title: "Paiement sécurisé", desc: "Mobile Money & carte bancaire" },
    { icon: Headset, title: "Assistance client", desc: "7 jours / 7, en français" },
    { icon: PackageSearch, title: "Suivi de commande", desc: "Depuis votre n° de commande" },
];

export const TrustBar = () => (
    <section aria-label={t("Nos engagements")} className="border-y border-border bg-surface">
        <div className="container mx-auto px-5 py-5">
            <ul className="grid grid-cols-2 gap-x-4 gap-y-5 lg:grid-cols-4" data-testid="trust-bar">
                {items.map(({ icon: Icon, title, desc }) => (
                    <li key={title} className="flex items-start gap-3">
                        <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-background text-primary shadow-card">
                            <Icon className="h-4 w-4" aria-hidden="true" />
                        </span>
                        <span className="min-w-0">
                            <span className="block text-sm font-semibold leading-tight text-foreground">{t(title)}</span>
                            <span className="mt-0.5 block text-xs leading-snug text-muted-foreground">{t(desc)}</span>
                        </span>
                    </li>
                ))}
            </ul>
        </div>
    </section>
);
