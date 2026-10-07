import { useState } from "react";
import { Link } from "react-router-dom";
import { Search, Edit3, Trash2, PlusCircle, Package, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { useSeller } from "@/context/SellerContext";
import { formatPrice } from "@/lib/money";
import { apiErrorMessage } from "@/lib/api";
import { categories } from "@/data/products";
import { toast } from "sonner";

export default function Products() {
    const { products, deleteProduct } = useSeller();
    const [query, setQuery] = useState("");
    const [catFilter, setCatFilter] = useState("all");

    const filtered = products.filter((p) => {
        if (catFilter !== "all" && p.category !== catFilter) return false;
        if (query && !p.name.toLowerCase().includes(query.toLowerCase())) return false;
        return true;
    });

    return (
        <div className="space-y-5">
            {/* Filters */}
            <div className="flex flex-col md:flex-row gap-3">
                <div className="relative flex-1">
                    <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Rechercher un produit…" className="pl-9" />
                </div>
                <Select value={catFilter} onValueChange={setCatFilter}>
                    <SelectTrigger className="w-full md:w-56">
                        <SelectValue placeholder="Catégorie" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">Toutes les catégories</SelectItem>
                        {categories.map((c) => (
                            <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                <Button asChild className="bg-primary hover:bg-primary/90">
                    <Link to="../ajouter"><PlusCircle className="h-4 w-4" /> Nouveau produit</Link>
                </Button>
            </div>

            {/* Table */}
            <div className="bg-card rounded-2xl shadow-card border border-border/50 overflow-hidden">
                <div className="grid grid-cols-12 gap-4 px-4 md:px-6 py-3 bg-muted/30 border-b border-border text-xs uppercase tracking-widest text-muted-foreground font-medium">
                    <div className="col-span-6 md:col-span-5">Produit</div>
                    <div className="col-span-2 hidden md:block">Catégorie</div>
                    <div className="col-span-3 md:col-span-2">Prix</div>
                    <div className="col-span-1 hidden md:block">Note</div>
                    <div className="col-span-3 md:col-span-2 text-right">Actions</div>
                </div>
                <div className="divide-y divide-border">
                    {filtered.length === 0 && (
                        <div className="px-6 py-16 text-center">
                            <Package className="h-10 w-10 text-muted-foreground mx-auto mb-3 opacity-40" />
                            <p className="text-sm text-muted-foreground">Aucun produit trouvé</p>
                        </div>
                    )}
                    {filtered.map((p) => {
                        const cat = categories.find((c) => c.id === p.category);
                        return (
                            <div key={p.id} className="grid grid-cols-12 gap-4 px-4 md:px-6 py-4 items-center">
                                <div className="col-span-6 md:col-span-5 flex items-center gap-3 min-w-0">
                                    <div className="h-12 w-12 rounded-lg overflow-hidden bg-muted shrink-0">
                                        <img src={p.image} alt={p.name} className="h-full w-full object-cover" />
                                    </div>
                                    <div className="min-w-0">
                                        <p className="text-sm font-medium truncate">{p.name}</p>
                                        <p className="text-xs text-muted-foreground font-mono">SEC-{p.id.toUpperCase()}</p>
                                    </div>
                                </div>
                                <div className="col-span-2 hidden md:block">
                                    <Badge variant="secondary" className="rounded-full font-normal">
                                        <i className={`fa-solid ${cat?.icon || "fa-tag"} text-xs mr-1.5`} />
                                        {cat?.name || p.category}
                                    </Badge>
                                </div>
                                <div className="col-span-3 md:col-span-2">
                                    <p className="font-display font-semibold text-sm">{formatPrice(p.price)}</p>
                                    {p.oldPrice && (
                                        <p className="text-xs text-muted-foreground line-through">{formatPrice(p.oldPrice)}</p>
                                    )}
                                </div>
                                <div className="col-span-1 hidden md:flex items-center gap-1 text-sm">
                                    {p.rating > 0 ? (
                                        <>
                                            <Star className="h-3 w-3 fill-primary stroke-primary" />
                                            {p.rating}
                                        </>
                                    ) : (
                                        <span className="text-muted-foreground text-xs">—</span>
                                    )}
                                </div>
                                <div className="col-span-3 md:col-span-2 flex items-center justify-end gap-1">
                                    <Button asChild variant="ghost" size="icon" className="h-8 w-8">
                                        <Link to={`/produit/${p.id}`} target="_blank"><Edit3 className="h-4 w-4" /></Link>
                                    </Button>
                                    <AlertDialog>
                                        <AlertDialogTrigger asChild>
                                            <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10">
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        </AlertDialogTrigger>
                                        <AlertDialogContent>
                                            <AlertDialogHeader>
                                                <AlertDialogTitle>Supprimer ce produit ?</AlertDialogTitle>
                                                <AlertDialogDescription>
                                                    « {p.name} » sera définitivement supprimé de votre catalogue.
                                                </AlertDialogDescription>
                                            </AlertDialogHeader>
                                            <AlertDialogFooter>
                                                <AlertDialogCancel>Annuler</AlertDialogCancel>
                                                <AlertDialogAction
                                                    onClick={async () => {
                                                        try {
                                                            await deleteProduct(p.id);
                                                            toast.success("Produit supprimé");
                                                        } catch (err) {
                                                            toast.error("Suppression impossible", { description: apiErrorMessage(err) });
                                                        }
                                                    }}
                                                    className="bg-destructive hover:bg-destructive/90"
                                                >
                                                    Supprimer
                                                </AlertDialogAction>
                                            </AlertDialogFooter>
                                        </AlertDialogContent>
                                    </AlertDialog>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            <p className="text-xs text-muted-foreground text-center">
                {filtered.length} produit{filtered.length > 1 ? "s" : ""} affiché{filtered.length > 1 ? "s" : ""} · {products.length} au total
            </p>
        </div>
    );
}
