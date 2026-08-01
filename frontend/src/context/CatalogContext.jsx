import { createContext, useContext, useEffect, useState } from "react";
import { productsAPI } from "@/lib/api";

/*
 * Global product catalog for the PUBLIC shop.
 * Products live in MongoDB (managed from the Espace vendeur) — la base de
 * données est la SEULE source de vérité (plus de produits de démo statiques).
 */
const CatalogContext = createContext(null);

export const CatalogProvider = ({ children }) => {
    const [products, setProducts] = useState([]);
    const [loaded, setLoaded] = useState(false);

    const refresh = async () => {
        try {
            const list = await productsAPI.list();
            if (Array.isArray(list)) setProducts(list);
        } catch {
            // réseau indisponible — on garde la liste actuelle
        } finally {
            setLoaded(true);
        }
    };

    useEffect(() => {
        refresh();
    }, []);

    return (
        <CatalogContext.Provider value={{ products, loaded, refresh }}>
            {children}
        </CatalogContext.Provider>
    );
};

export const useCatalog = () => {
    const ctx = useContext(CatalogContext);
    if (!ctx) throw new Error("useCatalog must be used within CatalogProvider");
    return ctx;
};
