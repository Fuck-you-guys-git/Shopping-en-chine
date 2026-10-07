import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { catalogAPI } from "@/lib/api";

const CatalogContext = createContext(null);

/** Loads the product catalog from the backend once for the whole app. */
export const CatalogProvider = ({ children }) => {
    const [state, setState] = useState({ status: "loading", products: [] });

    const load = useCallback(() => {
        setState((s) => ({ ...s, status: "loading" }));
        catalogAPI
            .list()
            .then((products) => setState({ status: "ready", products }))
            .catch(() => setState({ status: "error", products: [] }));
    }, []);

    useEffect(() => {
        load();
    }, [load]);

    return <CatalogContext.Provider value={{ ...state, reload: load }}>{children}</CatalogContext.Provider>;
};

export const useCatalog = () => {
    const ctx = useContext(CatalogContext);
    if (!ctx) throw new Error("useCatalog must be used within CatalogProvider");
    return ctx;
};
