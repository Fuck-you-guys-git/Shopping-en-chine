import { Navigate, useLocation } from "react-router-dom";
import { useSellerAuth } from "@/context/SellerAuthContext";

export const ProtectedSellerRoute = ({ children }) => {
    const { isAuthenticated } = useSellerAuth();
    const location = useLocation();

    if (!isAuthenticated) {
        const base = location.pathname.startsWith("/admin") ? "/admin" : "/vendeur";
        return <Navigate to={`${base}/login`} state={{ from: location }} replace />;
    }

    return children;
};
