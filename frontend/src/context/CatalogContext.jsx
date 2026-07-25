import { createContext, useContext, useEffect, useState } from "react";
import { products as seedProducts } from "@/data/products";
import { productsAPI } from "@/lib/api";

/*
 * Global product catalog for the PUBLIC shop.
 * Products live in MongoDB (managed from the Espace vendeur) so items added
 * by the seller are visible to every customer on every device.
 * The static seed list is used as an instant fallback while loading.
 */
const CatalogContext = createContext(null);

export const CatalogProvider = ({ children }) => {
    const [products, setProducts] = useState(seedProducts);
    const [loaded, setLoaded] = useState(false);

    const refresh = async () => {
        try {
            const list = await productsAPI.list();
            if (Array.isArray(list) && list.length) setProducts(list);
            setLoaded(true);
        } catch {
            // Keep the static fallback — the shop stays browsable offline
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
