import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { OpenF1SessionProvider } from "@/contexts/OpenF1SessionContext";
import { SetUsernameModal } from "@/components/auth/SetUsernameModal";
import { EmailVerificationPrompt } from "@/components/auth/EmailVerificationPrompt";
import { RouteSeo } from "@/components/seo/RouteSeo";
import Index from "./pages/Index";
import HowItWorks from "./pages/HowItWorks";
import Login from "./pages/Login";
import Register from "./pages/Register";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
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
          <RouteSeo />
          <EmailVerificationPrompt />
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/how-it-works" element={<HowItWorks />} />
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/reset-password" element={<ResetPassword />} />
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
        </TooltipProvider>
      </OpenF1SessionProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
