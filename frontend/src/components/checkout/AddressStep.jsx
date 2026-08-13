import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { COUNTRIES, countryName, STATES } from "@/lib/countries";
import { t } from "@/lib/locale";

// Étape 1 : adresse de livraison (pays → indicatif auto, état/province si requis)
export const AddressStep = ({ buyer, setBuyer, prefix, selectedCountry, onCountryChange, onContinue }) => (
    <div className="space-y-5 bg-card p-6 md:p-8 rounded-2xl shadow-card">
        <h2 className="font-display text-2xl">{t("Adresse de livraison")}</h2>
        <div className="grid sm:grid-cols-2 gap-4">
            <div className="space-y-1.5"><Label htmlFor="co-first-name">{t("Prénom")}</Label><Input id="co-first-name" data-testid="first-name-input" required value={buyer.firstName} onChange={(e) => setBuyer({ ...buyer, firstName: e.target.value })} /></div>
            <div className="space-y-1.5"><Label htmlFor="co-last-name">{t("Nom")}</Label><Input id="co-last-name" data-testid="last-name-input" required value={buyer.lastName} onChange={(e) => setBuyer({ ...buyer, lastName: e.target.value })} /></div>
            <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="co-email">Email</Label><Input id="co-email" data-testid="email-input" required type="email" value={buyer.email} onChange={(e) => setBuyer({ ...buyer, email: e.target.value })} /></div>
            <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="co-address">{t("Adresse")}</Label><Input id="co-address" data-testid="address-input" required value={buyer.address} onChange={(e) => setBuyer({ ...buyer, address: e.target.value })} /></div>
            <div className="space-y-1.5"><Label htmlFor="co-zip">{t("Code postal")}</Label><Input id="co-zip" data-testid="zip-input" value={buyer.zip} onChange={(e) => setBuyer({ ...buyer, zip: e.target.value })} /></div>
            <div className="space-y-1.5"><Label htmlFor="co-city">{t("Ville")}</Label><Input id="co-city" data-testid="city-input" required value={buyer.city} onChange={(e) => setBuyer({ ...buyer, city: e.target.value })} /></div>
            <div className="space-y-1.5 sm:col-span-2">
                <Label>{t("Pays")}</Label>
                <Select value={buyer.country} onValueChange={onCountryChange}>
                    <SelectTrigger data-testid="country-select">
                        <SelectValue placeholder={t("Choisissez votre pays")} />
                    </SelectTrigger>
                    <SelectContent className="max-h-[300px]">
                        {COUNTRIES.map((c) => (
                            <SelectItem key={c.code} value={c.code} data-testid={`country-option-${c.code}`}>
                                {c.flag} {countryName(c)} (+{c.dial})
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>
            {STATES[buyer.country] && (
                <div className="space-y-1.5 sm:col-span-2">
                    <Label>{buyer.country === "CA" ? t("Province") : t("État")}</Label>
                    <Select value={buyer.state} onValueChange={(s) => setBuyer({ ...buyer, state: s })}>
                        <SelectTrigger data-testid="state-select">
                            <SelectValue placeholder={buyer.country === "CA" ? t("Choisissez votre province") : t("Choisissez votre état")} />
                        </SelectTrigger>
                        <SelectContent className="max-h-[300px]">
                            {STATES[buyer.country].map((s) => (
                                <SelectItem key={s} value={s} data-testid={`state-option-${s.replace(/\s+/g, "-")}`}>
                                    {s}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
            )}
            <div className="space-y-1.5 sm:col-span-2">
                <Label>{t("Téléphone")}</Label>
                <div className="flex">
                    <span data-testid="phone-prefix" className="inline-flex items-center gap-1 px-3 rounded-l-md border border-r-0 border-input bg-muted/60 text-sm text-foreground whitespace-nowrap">
                        {selectedCountry?.flag} +{prefix}
                    </span>
                    <Input required type="tel" value={buyer.phone} onChange={(e) => setBuyer({ ...buyer, phone: e.target.value })} className="rounded-l-none" data-testid="phone-input" />
                </div>
            </div>
        </div>
        <Button
            type="button"
            onClick={onContinue}
            className="w-full sm:w-auto bg-ink text-ink-foreground hover:bg-ink/90 rounded-full h-11 px-8"
        >
            {t("Continuer")}
        </Button>
    </div>
);
