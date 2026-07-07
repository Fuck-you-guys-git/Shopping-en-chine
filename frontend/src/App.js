import { BrowserRouter, Routes, Route } from "react-router-dom";
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

function App() {
    return (
        <div className="App min-h-screen bg-background text-foreground">
            <BrowserRouter>
                <CartProvider>
                    <ScrollToTop />
                    <Navbar />
                    <main>
                        <Routes>
                            <Route path="/" element={<Home />} />
                            <Route path="/boutique" element={<Products />} />
                            <Route path="/boutique/:categoryId" element={<Products />} />
                            <Route path="/produit/:id" element={<ProductDetail />} />
                            <Route path="/panier" element={<Cart />} />
                            <Route path="/commande" element={<Checkout />} />
                        </Routes>
                    </main>
                    <Footer />
                    <CartDrawer />
                    <Toaster position="bottom-right" />
                </CartProvider>
            </BrowserRouter>
        </div>
    );
}

export default App;
