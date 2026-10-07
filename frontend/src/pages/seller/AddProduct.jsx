import { useEffect, useRef, useState } from "react";
import { useNavigate, useLocation, useParams } from "react-router-dom";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useSeller } from "@/context/SellerContext";
import { productsAPI } from "@/lib/api";
import { subcategoriesByCategory } from "@/data/products";
import { toast } from "sonner";
import { SAMPLE_IMAGES, MAX_PHOTOS, sortSizes } from "./addproduct/constants";
import { GeneralInfoSection } from "./addproduct/GeneralInfoSection";
import { PricingSection } from "./addproduct/PricingSection";
import { PhotosSection } from "./addproduct/PhotosSection";
import { VariantsSection } from "./addproduct/VariantsSection";
import { StockSection } from "./addproduct/StockSection";
import { ProductPreview } from "./addproduct/ProductPreview";

// Compression côté client (max 800px, JPEG 75%) avant envoi au backend
const compressFile = (file) =>
    new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = reject;
        reader.onload = () => {
            const img = new Image();
            img.onerror = reject;
            img.onload = () => {
                const MAX = 800;
                const scale = Math.min(1, MAX / Math.max(img.width, img.height));
                const canvas = document.createElement("canvas");
                canvas.width = Math.round(img.width * scale);
                canvas.height = Math.round(img.height * scale);
                canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
                resolve(canvas.toDataURL("image/jpeg", 0.75));
            };
            img.src = reader.result;
        };
        reader.readAsDataURL(file);
    });

export default function AddProduct() {
    const { addProduct, updateProduct } = useSeller();
    const navigate = useNavigate();
    const { pathname } = useLocation();
    const { editId } = useParams();
    const base = pathname.startsWith("/admin") ? "/admin" : "/vendeur";
    const isEdit = Boolean(editId);

    const [form, setForm] = useState({
        name: "",
        category: "",
        subcategory: "",
        price: "",
        oldPrice: "",
        priceEur: "",
        priceUsd: "",
        description: "",
        searchKeywords: "",
        badge: "",
        colors: [],
        sizes: [],
        stock: "",
        outOfStock: false,
        active: true,
    });
    const [urlInput, setUrlInput] = useState("");

    // --- Photos (jusqu'à 5) : photoColors[i] = couleur associée à la photo i ---
    const [photos, setPhotos] = useState([]);
    const [photoColors, setPhotoColors] = useState([]);
    const [uploading, setUploading] = useState(false);

    // --- Mode édition : pré-remplir avec le produit existant (fiche complète,
    // la liste publique ne contient plus la galerie) ---
    const [ready, setReady] = useState(!isEdit);
    const prefilled = useRef(false);
    useEffect(() => {
        if (!isEdit || prefilled.current) return;
        prefilled.current = true;
        productsAPI.get(editId).then((p) => {
            setForm({
                name: p.name || "",
                category: p.category || "",
                subcategory: p.subcategory || "",
                price: String(p.price ?? ""),
                oldPrice: p.oldPrice ? String(p.oldPrice) : "",
                priceEur: p.priceEur ? String(p.priceEur) : "",
                priceUsd: p.priceUsd ? String(p.priceUsd) : "",
                description: p.description === "Description à compléter." ? "" : (p.description || ""),
                searchKeywords: (p.keywords || []).join(", "),
                badge: p.badge || "",
                colors: p.colors || [],
                sizes: p.sizes || [],
                stock: p.stock == null ? "" : String(p.stock),
                outOfStock: p.outOfStock === true,
                active: p.active !== false,
            });
            setPhotos((p.images?.length ? p.images : [p.image]).filter(Boolean).slice(0, 5));
            setPhotoColors((p.image_colors || []).slice(0, 5));
            setReady(true);
        }).catch(() => {
            toast.error("Produit introuvable");
            navigate(`${base}/produits`);
        });
    }, [isEdit, editId, base, navigate]);

    const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
    const toggleColor = (c) => set("colors", form.colors.includes(c) ? form.colors.filter((x) => x !== c) : [...form.colors, c]);
    const toggleSize = (s) => set("sizes", form.sizes.includes(s) ? form.sizes.filter((x) => x !== s) : sortSizes([...form.sizes, s]));

    const onPhotoSelected = async (e) => {
        const files = Array.from(e.target.files || []).filter((f) => f.type.startsWith("image/"));
        e.target.value = "";
        if (!files.length) return;
        const slots = MAX_PHOTOS - photos.length;
        if (slots <= 0) {
            toast.error("Maximum 5 photos", { description: "Supprimez une photo pour en ajouter une autre." });
            return;
        }
        setUploading(true);
        const added = [];
        for (const file of files.slice(0, slots)) {
            try {
                added.push(await compressFile(file));
            } catch {
                toast.error("Photo illisible", { description: file.name });
            }
        }
        setUploading(false);
        if (added.length) {
            setPhotos((prev) => [...prev, ...added].slice(0, MAX_PHOTOS));
            setPhotoColors((prev) => [...prev, ...added.map(() => null)].slice(0, MAX_PHOTOS));
            toast.success(`${added.length} photo(s) ajoutée(s) ✦`, {
                description: files.length > slots ? "Limite de 5 photos atteinte." : "Visible dans l'aperçu.",
            });
        }
    };

    const removePhoto = (idx) => {
        setPhotos((prev) => prev.filter((_, i) => i !== idx));
        setPhotoColors((prev) => prev.filter((_, i) => i !== idx));
    };
    const makeMain = (idx) => {
        setPhotos((prev) => [prev[idx], ...prev.filter((_, i) => i !== idx)]);
        setPhotoColors((prev) => [prev[idx] ?? null, ...prev.filter((_, i) => i !== idx)]);
    };
    const addSample = (src) => {
        const idx = photos.indexOf(src);
        if (idx >= 0) {
            removePhoto(idx);
        } else if (photos.length < MAX_PHOTOS) {
            setPhotos((prev) => [...prev, src]);
            setPhotoColors((prev) => [...prev, null]);
        }
    };
    // Associe (ou retire) une couleur à la photo idx
    const assignPhotoColor = (idx, c) =>
        setPhotoColors((prev) => {
            const next = [...prev];
            while (next.length < photos.length) next.push(null);
            next[idx] = next[idx] === c ? null : c;
            return next;
        });
    const mainImage = photos[0] || SAMPLE_IMAGES[0];

    const submit = async (e) => {
        e.preventDefault();
        if (!form.name || !form.category || !form.price) {
            toast.error("Champs requis manquants", { description: "Nom, catégorie et prix sont obligatoires." });
            return;
        }
        if (!(Number(form.priceEur) > 0) || !(Number(form.priceUsd) > 0)) {
            toast.error("Prix EUR et USD obligatoires", {
                description: "Saisissez le prix en euros et en dollars — aucune conversion automatique n'est appliquée.",
            });
            return;
        }
        const product = {
            name: form.name,
            category: form.category,
            subcategory: form.subcategory && subcategoriesByCategory[form.category] ? form.subcategory : undefined,
            price: Number(form.price),
            oldPrice: form.oldPrice ? Number(form.oldPrice) : undefined,
            priceEur: form.priceEur ? Number(form.priceEur) : null,
            priceUsd: form.priceUsd ? Number(form.priceUsd) : null,
            description: form.description || "",
            image: mainImage,
            images: photos.length ? photos : [mainImage],
            badge: form.badge || undefined,
            colors: form.colors.length ? form.colors : undefined,
            sizes: form.sizes.length ? sortSizes(form.sizes) : undefined,
            image_colors: photoColors.some(Boolean)
                ? photos.map((_, i) => photoColors[i] || null)
                : undefined,
            keywords: form.searchKeywords
                ? form.searchKeywords.split(",").map((k) => k.trim()).filter(Boolean)
                : undefined,
            stock: form.stock !== "" ? Math.max(0, Math.floor(Number(form.stock))) : null,
            outOfStock: form.outOfStock,
        };
        try {
            if (isEdit) {
                await updateProduct(editId, product);
                toast.success("Produit mis à jour ✦", { description: form.name });
            } else {
                await addProduct(product);
                toast.success("Produit ajouté ✦", { description: form.name });
            }
            navigate(`${base}/produits`);
        } catch (err) {
            const status = err.response?.status;
            if (status === 401) {
                // Session expirée : le contexte d'auth affiche déjà le message
                // et redirige vers la page de connexion.
                return;
            }
            if (status === 422) {
                toast.error("Informations invalides", {
                    description: "Vérifiez le nom (2 caractères minimum) et le prix (supérieur à 0).",
                });
            } else if (status === 413) {
                toast.error("Photos trop lourdes", {
                    description: "Supprimez une photo ou utilisez des images plus légères.",
                });
            } else if (err.code === "ECONNABORTED") {
                toast.error("Connexion trop lente", {
                    description: "L'envoi a pris trop de temps. Réessayez avec moins de photos.",
                });
            } else {
                toast.error("Enregistrement impossible", {
                    description: err.response?.data?.detail || "Vérifiez votre connexion internet et réessayez.",
                });
            }
        }
    };

    if (!ready) {
        return (
            <div className="py-24 text-center text-sm text-muted-foreground" data-testid="edit-product-loading">
                Chargement du produit…
            </div>
        );
    }

    return (
        <form onSubmit={submit} className="grid lg:grid-cols-[1fr_360px] gap-5">
            {/* Main form */}
            <div className="space-y-5">
                <GeneralInfoSection form={form} set={set} />
                <PricingSection form={form} set={set} />
                <PhotosSection
                    photos={photos}
                    photoColors={photoColors}
                    colors={form.colors}
                    uploading={uploading}
                    urlInput={urlInput}
                    setUrlInput={setUrlInput}
                    onFilesSelected={onPhotoSelected}
                    onRemove={removePhoto}
                    onMakeMain={makeMain}
                    onAddSample={addSample}
                    onAssignColor={assignPhotoColor}
                />
                <VariantsSection
                    colors={form.colors}
                    sizes={form.sizes}
                    onToggleColor={toggleColor}
                    onToggleSize={toggleSize}
                />
                <StockSection form={form} set={set} />
                <div className="bg-card rounded-2xl p-5 md:p-6 shadow-card border border-border/50 flex items-center justify-between">
                    <div>
                        <p className="font-medium text-sm">Publier immédiatement</p>
                        <p className="text-xs text-muted-foreground mt-0.5">Le produit sera visible sur la boutique dès l&apos;enregistrement.</p>
                    </div>
                    <Switch checked={form.active} onCheckedChange={(v) => set("active", v)} />
                </div>
            </div>

            {/* Preview */}
            <aside className="space-y-4">
                <div className="sticky top-24 space-y-4">
                    <ProductPreview form={form} photos={photos} mainImage={mainImage} />
                    <div className="flex flex-col gap-2">
                        <Button type="submit" size="lg" className="bg-primary hover:bg-primary/90 text-primary-foreground shadow-warm rounded-full h-12" data-testid="submit-product-btn">
                            <Upload className="h-4 w-4" /> {isEdit ? "Mettre à jour le produit" : "Publier le produit"}
                        </Button>
                        <Button type="button" variant="outline" size="lg" onClick={() => navigate(`${base}/produits`)} className="rounded-full">
                            Annuler
                        </Button>
                    </div>
                </div>
            </aside>
        </form>
    );
}
