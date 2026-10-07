import { useRef } from "react";
import { Camera, ImagePlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SAMPLE_IMAGES, MAX_PHOTOS } from "./constants";

// Carte « Photos du produit » : upload téléphone, exemples, URL, photo principale,
// association photo ↔ couleur.
export const PhotosSection = ({
    photos, photoColors, colors, uploading, urlInput, setUrlInput,
    onFilesSelected, onRemove, onMakeMain, onAddSample, onAssignColor,
}) => {
    const fileRef = useRef(null);
    return (
        <div className="bg-card rounded-2xl p-5 md:p-6 shadow-card border border-border/50">
            <h3 className="font-display text-lg font-medium mb-1">Photos du produit <span className="text-primary">({photos.length}/5)</span></h3>
            <p className="text-xs text-muted-foreground mb-5">Ajoutez jusqu&apos;à 5 photos : téléphone, exemples ou URL. La première est la photo principale.</p>
            <div className="space-y-4">
                <input
                    ref={fileRef}
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={onFilesSelected}
                    data-testid="product-photo-input"
                />
                <Button
                    type="button"
                    size="lg"
                    disabled={uploading || photos.length >= MAX_PHOTOS}
                    onClick={() => fileRef.current?.click()}
                    className="w-full h-14 rounded-xl bg-ink text-ink-foreground hover:bg-ink/90 text-base"
                    data-testid="upload-photo-btn"
                >
                    <Camera className="h-5 w-5" />
                    {uploading ? "Chargement des photos…" : photos.length >= MAX_PHOTOS ? "Maximum 5 photos atteint" : "Ajouter des photos depuis votre téléphone"}
                </Button>

                {/* Photos sélectionnées */}
                {photos.length > 0 && (
                    <div className="grid grid-cols-3 sm:grid-cols-5 gap-2" data-testid="selected-photos-grid">
                        {photos.map((src, i) => (
                            <div key={`${src.slice(-32)}-${i}`} className="space-y-1">
                                <div className="relative group aspect-square rounded-lg overflow-hidden bg-muted border-2 border-border">
                                    <img src={src} alt="" className="h-full w-full object-cover" />
                                    {i === 0 && (
                                        <span className="absolute bottom-1 left-1 text-[9px] font-bold bg-primary text-primary-foreground px-1.5 py-0.5 rounded-full">
                                            Principale
                                        </span>
                                    )}
                                    <button
                                        type="button"
                                        onClick={() => onRemove(i)}
                                        data-testid={`remove-photo-${i}`}
                                        aria-label="Supprimer la photo"
                                        className="absolute top-1 right-1 h-6 w-6 rounded-full bg-black/60 text-white flex items-center justify-center text-xs hover:bg-destructive transition-colors"
                                    >
                                        <i className="fa-solid fa-xmark" />
                                    </button>
                                    {i !== 0 && (
                                        <button
                                            type="button"
                                            onClick={() => onMakeMain(i)}
                                            data-testid={`make-main-photo-${i}`}
                                            aria-label="Définir comme principale"
                                            title="Définir comme photo principale"
                                            className="absolute bottom-1 right-1 h-6 w-6 rounded-full bg-black/60 text-white flex items-center justify-center text-[10px] hover:bg-primary transition-colors"
                                        >
                                            <i className="fa-solid fa-star" />
                                        </button>
                                    )}
                                </div>
                                {colors.length > 0 && (
                                    <div className="flex justify-center gap-1 flex-wrap" data-testid={`photo-color-picker-${i}`}>
                                        {colors.map((c) => (
                                            <button
                                                type="button"
                                                key={c}
                                                onClick={() => onAssignColor(i, c)}
                                                data-testid={`photo-${i}-color-${c.replace("#", "")}`}
                                                aria-label={`Associer cette couleur à la photo ${i + 1}`}
                                                className={`h-4 w-4 rounded-full border transition-all ${photoColors[i] === c ? "ring-2 ring-primary ring-offset-1 border-primary scale-110" : "border-border opacity-50 hover:opacity-100"}`}
                                                style={{ background: c }}
                                            />
                                        ))}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )}
                {photos.length > 0 && colors.length > 0 && (
                    <p className="text-[11px] text-muted-foreground">
                        Astuce : cliquez sur un point de couleur sous une photo pour l&apos;associer —
                        le client verra cette photo en choisissant la couleur.
                    </p>
                )}

                <p className="text-xs text-muted-foreground">Ou choisissez parmi les exemples :</p>
                <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                    {SAMPLE_IMAGES.map((src) => (
                        <button
                            type="button"
                            key={src}
                            onClick={() => onAddSample(src)}
                            className={`aspect-square rounded-lg overflow-hidden bg-muted border-2 transition-all ${photos.includes(src) ? "border-primary scale-95" : "border-transparent"}`}
                        >
                            <img src={src} alt="" className="h-full w-full object-cover" />
                        </button>
                    ))}
                </div>
                <div className="space-y-1.5">
                    <Label htmlFor="image-url">Ou ajoutez une photo par URL</Label>
                    <div className="flex gap-2">
                        <div className="relative flex-1">
                            <ImagePlus className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input
                                id="image-url"
                                value={urlInput}
                                onChange={(e) => setUrlInput(e.target.value)}
                                placeholder="https://…"
                                className="pl-9"
                            />
                        </div>
                        <Button
                            type="button"
                            variant="outline"
                            disabled={!urlInput.trim() || photos.length >= MAX_PHOTOS}
                            onClick={() => { onAddSample(urlInput.trim()); setUrlInput(""); }}
                            data-testid="add-url-photo-btn"
                        >
                            Ajouter
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
};
