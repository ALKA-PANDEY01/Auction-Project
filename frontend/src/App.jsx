import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";

import Login from "./pages/Login";
import Register from "./pages/Register";
import Auctions from "./pages/Auctions";
import AuctionDetails from "./pages/AuctionDetails";
import CreateAuction from "./pages/CreateAuction";
import AuctionResult from "./pages/AuctionResult";
import SellerDashboard from "./pages/SellerDashboard";
import Wishlist from "./pages/Wishlist";
import { AuthProvider } from "./context/AuthContext";
import RequireAuth from "./components/RequireAuth";
import NotificationCenter from "./components/NotificationCenter";

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <NotificationCenter />
        <Routes>
          <Route path="/" element={<Navigate to="/auctions" replace />} />

          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/auctions" element={<Auctions />} />
          <Route element={<RequireAuth />}>
            <Route path="/dashboard" element={<SellerDashboard />} />
            <Route path="/wishlist" element={<Wishlist />} />
            <Route path="/auctions/create" element={<CreateAuction />} />
            <Route path="/auctions/:auctionId/result" element={<AuctionResult />} />
            <Route path="/auctions/:auctionId" element={<AuctionDetails />} />
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
