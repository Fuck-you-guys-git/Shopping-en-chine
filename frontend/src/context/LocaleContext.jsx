import { createContext, useContext, useEffect, useState } from "react";
import axios from "axios";
import { LOCALE_PRESETS, setLocaleValues } from "@/lib/locale";

/*
 * Langue + devise 100% AUTOMATIQUES par géolocalisation IP (GET /api/geo) :
 *   Europe → FR + EUR · Afrique → FR + FCFA · USA/reste → EN + USD.
 * Le visiteur NE PEUT PAS changer manuellement (demande du marchand).
 *
 * ROBUSTESSE (bug corrigé : des clients EU/US voyaient les prix en F CFA) :
 * la devise résolue est mémorisée dans le navigateur et réappliquée
 * IMMÉDIATEMENT au chargement suivant. Si l'appel géo échoue (réseau lent,
 * quota d'un fournisseur IP), le client garde donc sa bonne devise au lieu
 * de retomber sur les F CFA. Un second essai est tenté en cas d'échec.
 */
const BACKEND = process.env.REACT_APP_BACKEND_URL;
const STORAGE_KEY = "sec_locale_v1";

const FALLBACK = { lang: "fr", currency: "XOF", country: null };

const readStored = () => {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return null;
        const v = JSON.parse(raw);
        if (v?.lang && ["XOF", "EUR", "USD"].includes(v.currency)) {
            return { lang: v.lang, currency: v.currency, country: v.country || null };
        }
    } catch {
        /* stockage indisponible (navigation privée) */
    }
    return null;
};

const LocaleContext = createContext(null);

export const LocaleProvider = ({ children }) => {
    const [locale, setLocaleState] = useState(() => readStored() || FALLBACK);
    // Synchroniser l'état module AVANT le premier rendu des enfants
    setLocaleValues(locale.lang, locale.currency, locale.country);

    // Détection IP à chaque chargement du site (2 tentatives)
    useEffect(() => {
        let cancelled = false;

        const apply = (data) => {
            if (cancelled || !data?.lang || !data?.currency) return;
            const next = { lang: data.lang, currency: data.currency, country: data.country_code || null };
            setLocaleValues(next.lang, next.currency, next.country);
            setLocaleState(next);
            try {
                localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
            } catch {
                /* stockage indisponible */
            }
        };

        const fetchGeo = (attempt = 1) =>
            axios
                .get(`${BACKEND}/api/geo`, { timeout: 12000 })
                .then(({ data }) => apply(data))
                .catch(() => {
                    if (attempt < 2 && !cancelled) setTimeout(() => fetchGeo(attempt + 1), 1500);
                    // sinon : on conserve la devise mémorisée / le défaut
                });

        fetchGeo();
        return () => { cancelled = true; };
    }, []);

    const preset =
        LOCALE_PRESETS.find((p) => p.lang === locale.lang && p.currency === locale.currency) || LOCALE_PRESETS[0];

    return <LocaleContext.Provider value={{ ...locale, preset }}>{children}</LocaleContext.Provider>;
};

export const useLocale = () => useContext(LocaleContext);
