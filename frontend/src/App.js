import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import "@/App.css";
import { Toaster } from "@/components/ui/sonner";
import { CartProvider } from "@/context/CartContext";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { CartDrawer } from "@/components/CartDrawer";
import Home from "@/pages/Home";
import Products from "@/pages/Products";
import ProductDetail from "@/pages/ProductDetail";
import Cart from "@/pages/Cart";
import Checkout from "@/pages/Checkout";
import ScrollToTop from "@/components/ScrollToTop";
import SellerLayout from "@/pages/seller/SellerLayout";
import Dashboard from "@/pages/seller/Dashboard";
import Orders from "@/pages/seller/Orders";
import SellerProducts from "@/pages/seller/Products";
import AddProduct from "@/pages/seller/AddProduct";

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

                            {/* Seller / admin area — accessible via /vendeur or /admin */}
                            <Route path="/vendeur" element={<SellerLayout />}>
                                <Route index element={<Dashboard />} />
                                <Route path="commandes" element={<Orders />} />
                                <Route path="produits" element={<SellerProducts />} />
                                <Route path="ajouter" element={<AddProduct />} />
                            </Route>
                            <Route path="/admin" element={<SellerLayout />}>
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
            </BrowserRouter>
        </div>
    );
}

export default App;
