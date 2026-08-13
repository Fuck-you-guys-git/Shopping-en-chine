import { BrowserRouter, Routes, Route, useLocation, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import "@/App.css";
import { Toaster } from "@/components/ui/sonner";
import { CartProvider } from "@/context/CartContext";
import { CatalogProvider } from "@/context/CatalogContext";
import { SellerAuthProvider } from "@/context/SellerAuthContext";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { CartDrawer } from "@/components/CartDrawer";
import { ProtectedSellerRoute } from "@/components/ProtectedSellerRoute";
import Home from "@/pages/Home";
import Products from "@/pages/Products";
import ProductDetail from "@/pages/ProductDetail";
import Cart from "@/pages/Cart";
import Checkout from "@/pages/Checkout";
import TrackOrder from "@/pages/TrackOrder";
import PaymentSuccess from "@/pages/PaymentSuccess";
import PaymentCancel from "@/pages/PaymentCancel";
import RetryOrder from "@/pages/RetryOrder";
import About from "@/pages/About";
import Wholesale from "@/pages/Wholesale";
import { WhatsAppButton } from "@/components/WhatsAppButton";
import ScrollToTop from "@/components/ScrollToTop";
import { LocaleProvider, useLocale } from "@/context/LocaleContext";
import SellerLayout from "@/pages/seller/SellerLayout";
import Dashboard from "@/pages/seller/Dashboard";
import Orders from "@/pages/seller/Orders";
import SellerProducts from "@/pages/seller/Products";
import AddProduct from "@/pages/seller/AddProduct";
import SellerEmails from "@/pages/seller/Emails";
import SellerLogin from "@/pages/seller/Login";
import { ComingSoon, GATE_ENABLED, isSiteUnlocked } from "@/components/ComingSoon";

/*
 * Retour de paiement Paxity (Wave / Orange Money) :
 * Paxity redirige le client vers shoppingenchine.com après le paiement.
 * Si un paiement est en cours (persisté dans localStorage), on amène
 * automatiquement le client sur la page de confirmation (/commande),
 * quelle que soit la page sur laquelle Paxity l'a fait atterrir.
 * Vérifié UNE SEULE FOIS au chargement de la page (pas pendant la
 * navigation interne, pour ne pas bloquer le client sur /commande).
 */
function PaymentReturnRedirect() {
    const navigate = useNavigate();
    useEffect(() => {
        const path = window.location.pathname;
        if (path === "/commande" || path.startsWith("/vendeur") || path.startsWith("/admin") || path.startsWith("/paiement")) return;
        try {
            const raw = localStorage.getItem("sec_pending_paxity_tx_v1");
            if (!raw) return;
            const tx = JSON.parse(raw);
            if (tx?.transaction_id && tx.status === "pending") {
                navigate("/commande", { replace: true });
            }
        } catch { /* ignore */ }
    }, []);
    return null;
}

function Shell({ children }) {
    const { pathname } = useLocation();
    const { lang, currency } = useLocale();
    const isSeller = pathname.startsWith("/vendeur") || pathname.startsWith("/admin");
    // Verrou de lancement : le site public affiche « Bientôt disponible »
    // tant que le mot de passe n'a pas été saisi. L'espace vendeur reste ouvert.
    const [unlocked, setUnlocked] = useState(isSiteUnlocked());
    if (GATE_ENABLED && !isSeller && !unlocked) {
        return <ComingSoon onUnlock={() => setUnlocked(true)} />;
    }
    // Le changement de langue/devise force un re-rendu complet via la key —
    // SAUF sur la page commande : un remontage y détruirait l'état du paiement
    // (confirmation affichée, formulaire en cours de saisie) quand la détection
    // IP de la locale se termine pendant le checkout.
    const localeKey = pathname === "/commande" ? "" : `-${lang}-${currency}`;
    return (
        <>
            <PaymentReturnRedirect />
            {!isSeller && <Navbar />}
            <main key={`${pathname}${localeKey}`} className="page-fade">{children}</main>
            {!isSeller && <Footer />}
            {!isSeller && <CartDrawer />}
            {!isSeller && <WhatsAppButton />}
        </>
    );
}

function App() {
    return (
        <div className="App min-h-screen bg-background text-foreground">
            <BrowserRouter>
                <LocaleProvider>
                <SellerAuthProvider>
                    <CatalogProvider>
                    <CartProvider>
                        <ScrollToTop />
                        <Shell>
                            <Routes>
                                <Route path="/" element={<Home />} />
                                <Route path="/boutique" element={<Products />} />
                                <Route path="/boutique/:categoryId" element={<Products />} />
                                <Route path="/produit/:id" element={<ProductDetail />} />
                                <Route path="/panier" element={<Cart />} />
                                <Route path="/commande" element={<Checkout />} />
                                <Route path="/suivi" element={<TrackOrder />} />
                                <Route path="/suivi/:orderId" element={<TrackOrder />} />
                                <Route path="/payment/success" element={<PaymentSuccess />} />
                                <Route path="/payment/cancel" element={<PaymentCancel />} />
                                <Route path="/reprise/:orderId" element={<RetryOrder />} />
                                <Route path="/a-propos" element={<About />} />
                                <Route path="/achat-en-gros" element={<Wholesale />} />

                                {/* Seller login (public) */}
                                <Route path="/vendeur/login" element={<SellerLogin />} />
                                <Route path="/admin/login" element={<SellerLogin />} />

                                {/* Seller / admin area — protected */}
                                <Route
                                    path="/vendeur"
                                    element={
                                        <ProtectedSellerRoute>
                                            <SellerLayout />
                                        </ProtectedSellerRoute>
                                    }
                                >
                                    <Route index element={<Dashboard />} />
                                    <Route path="commandes" element={<Orders />} />
                                    <Route path="produits" element={<SellerProducts />} />
                                    <Route path="ajouter" element={<AddProduct />} />
                                    <Route path="modifier/:editId" element={<AddProduct />} />
                                    <Route path="emails" element={<SellerEmails />} />
                                </Route>
                                <Route
                                    path="/admin"
                                    element={
                                        <ProtectedSellerRoute>
                                            <SellerLayout />
                                        </ProtectedSellerRoute>
                                    }
                                >
                                    <Route index element={<Dashboard />} />
                                    <Route path="commandes" element={<Orders />} />
                                    <Route path="produits" element={<SellerProducts />} />
                                    <Route path="ajouter" element={<AddProduct />} />
                                    <Route path="modifier/:editId" element={<AddProduct />} />
                                    <Route path="emails" element={<SellerEmails />} />
                                    <Route path="orders" element={<Orders />} />
                                    <Route path="products" element={<SellerProducts />} />
                                    <Route path="add" element={<AddProduct />} />
                                </Route>
                            </Routes>
                        </Shell>
                        <Toaster position="bottom-right" />
                    </CartProvider>
                    </CatalogProvider>
                </SellerAuthProvider>
                </LocaleProvider>
            </BrowserRouter>
        </div>
    );
}

export default App;
