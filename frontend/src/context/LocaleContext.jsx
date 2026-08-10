import { createContext, useContext, useEffect, useState } from "react";
import axios from "axios";
import { LOCALE_PRESETS, setLocaleValues } from "@/lib/locale";

/*
 * Langue + devise du site :
 * 1. Choix manuel (sélecteur drapeaux) → persisté dans localStorage.
 * 2. Sinon, détection automatique par IP via GET /api/geo :
 *    Europe → FR + EUR · Afrique → FR + FCFA · USA/reste → EN + USD.
 */
const STORAGE_KEY = "sec_locale_v1";
const BACKEND = process.env.REACT_APP_BACKEND_URL;

const LocaleContext = createContext(null);

const readStored = () => {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return null;
        const v = JSON.parse(raw);
        if (v && ["fr", "en"].includes(v.lang) && ["XOF", "EUR", "USD"].includes(v.currency)) return v;
    } catch { /* ignore */ }
    return null;
};

export const LocaleProvider = ({ children }) => {
    const stored = readStored();
    const [locale, setLocaleState] = useState(stored || { lang: "fr", currency: "XOF" });
    // Synchroniser l'état module AVANT le premier rendu des enfants
    setLocaleValues(locale.lang, locale.currency);

    const setLocale = (lang, currency, persist = true) => {
        setLocaleValues(lang, currency);
        setLocaleState({ lang, currency });
        if (persist) {
            try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ lang, currency })); } catch { /* ignore */ }
        }
    };

    // Détection IP au premier chargement (uniquement si aucun choix mémorisé)
    useEffect(() => {
        if (stored) return;
        axios.get(`${BACKEND}/api/geo`, { timeout: 6000 })
            .then(({ data }) => {
                if (data?.lang && data?.currency) setLocale(data.lang, data.currency, false);
            })
            .catch(() => { /* défaut FR/XOF conservé */ });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const preset = LOCALE_PRESETS.find((p) => p.lang === locale.lang && p.currency === locale.currency) || LOCALE_PRESETS[0];

    return (
        <LocaleContext.Provider value={{ ...locale, preset, setLocale }}>
            {children}
        </LocaleContext.Provider>
    );
};

export const useLocale = () => useContext(LocaleContext);
