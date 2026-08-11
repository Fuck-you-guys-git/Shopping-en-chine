import { createContext, useContext, useEffect, useState } from "react";
import axios from "axios";
import { LOCALE_PRESETS, setLocaleValues } from "@/lib/locale";

/*
 * Langue + devise 100% AUTOMATIQUES par géolocalisation IP (GET /api/geo) :
 *   Europe → FR + EUR · Afrique → FR + FCFA · USA/reste → EN + USD.
 * Le visiteur NE PEUT PAS changer manuellement (demande du marchand).
 * Défaut avant réponse géo : FR + FCFA.
 */
const BACKEND = process.env.REACT_APP_BACKEND_URL;

const LocaleContext = createContext(null);

export const LocaleProvider = ({ children }) => {
    const [locale, setLocaleState] = useState({ lang: "fr", currency: "XOF" });
    // Synchroniser l'état module AVANT le premier rendu des enfants
    setLocaleValues(locale.lang, locale.currency);

    // Détection IP à chaque chargement du site
    useEffect(() => {
        axios.get(`${BACKEND}/api/geo`, { timeout: 6000 })
            .then(({ data }) => {
                if (data?.lang && data?.currency) {
                    setLocaleValues(data.lang, data.currency);
                    setLocaleState({ lang: data.lang, currency: data.currency });
                }
            })
            .catch(() => { /* défaut FR/XOF conservé */ });
    }, []);

    const preset = LOCALE_PRESETS.find((p) => p.lang === locale.lang && p.currency === locale.currency) || LOCALE_PRESETS[0];

    return (
        <LocaleContext.Provider value={{ ...locale, preset }}>
            {children}
        </LocaleContext.Provider>
    );
};

export const useLocale = () => useContext(LocaleContext);
