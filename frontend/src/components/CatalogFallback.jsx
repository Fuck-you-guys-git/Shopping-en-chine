import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useCatalog } from "@/context/CatalogContext";

/** Shown in place of product grids while the catalog loads, or if loading failed. */
export const CatalogFallback = ({ count = 4, className = "grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-4 gap-y-8 md:gap-x-6" }) => {
    const { status, reload } = useCatalog();

    if (status === "error") {
        return (
            <div className="text-center py-16 border-2 border-dashed border-border rounded-2xl">
                <h3 className="font-display text-xl mb-2">Impossible de charger les produits</h3>
                <p className="text-muted-foreground text-sm mb-6">Vérifiez votre connexion puis réessayez.</p>
                <Button onClick={reload} variant="outline" className="rounded-full">Réessayer</Button>
            </div>
        );
    }

    return (
        <div className={className} aria-busy="true" aria-label="Chargement des produits">
            {Array.from({ length: count }, (_, i) => (
                <div key={i} className="space-y-3">
                    <Skeleton className="aspect-[4/5] rounded-2xl" />
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-5 w-1/3" />
                </div>
            ))}
        </div>
    );
};
