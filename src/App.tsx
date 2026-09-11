import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { OpenF1SessionProvider } from "@/contexts/OpenF1SessionContext";
import { SetUsernameModal } from "@/components/auth/SetUsernameModal";
import { Analytics } from "@vercel/analytics/react";
import Index from "./pages/Index";
import Login from "./pages/Login";
import Register from "./pages/Register";
import Dashboard from "./pages/Dashboard";
import Leaderboard from "./pages/Leaderboard";
import Standings from "./pages/Standings";
import Results from "./pages/Results";
import Predict from "./pages/Predict";
import PredictionHistory from "./pages/PredictionHistory";
import Discussions from "./pages/Discussions";
import NotFound from "./pages/NotFound";
import Admin from "./pages/Admin";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <OpenF1SessionProvider>
        <TooltipProvider>
        <Toaster />
        <Sonner />
        <SetUsernameModal />
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/leaderboard" element={<Leaderboard />} />
            <Route path="/standings" element={<Standings />} />
            <Route path="/results" element={<Results />} />
            <Route path="/predictions" element={<PredictionHistory />} />
            <Route path="/predict/:raceId/:type?" element={<Predict />} />
            <Route path="/discussions" element={<Discussions />} />
            <Route path="/admin" element={<Admin />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
        <Analytics />
        </TooltipProvider>
      </OpenF1SessionProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
