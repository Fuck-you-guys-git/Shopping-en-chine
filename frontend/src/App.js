import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import "@/App.css";
import { Toaster } from "@/components/ui/sonner";
import { CartProvider } from "@/context/CartContext";
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
import ScrollToTop from "@/components/ScrollToTop";
import SellerLayout from "@/pages/seller/SellerLayout";
import Dashboard from "@/pages/seller/Dashboard";
import Orders from "@/pages/seller/Orders";
import SellerProducts from "@/pages/seller/Products";
import AddProduct from "@/pages/seller/AddProduct";
import SellerLogin from "@/pages/seller/Login";

function Shell({ children }) {
    const { pathname } = useLocation();
    const isSeller = pathname.startsWith("/vendeur") || pathname.startsWith("/admin");
    return (
        <>
            {!isSeller && <Navbar />}
            <main>{children}</main>
            {!isSeller && <Footer />}
            {!isSeller && <CartDrawer />}
        </>
    );
}

function App() {
    return (
        <div className="App min-h-screen bg-background text-foreground">
            <BrowserRouter>
                <SellerAuthProvider>
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
                                    <Route path="orders" element={<Orders />} />
                                    <Route path="products" element={<SellerProducts />} />
                                    <Route path="add" element={<AddProduct />} />
                                </Route>
                            </Routes>
                        </Shell>
                        <Toaster position="bottom-right" />
                    </CartProvider>
                </SellerAuthProvider>
            </BrowserRouter>
        </div>
    );
}

export default App;
