import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { toast } from "sonner";

import { useAuth } from "@/contexts/AuthContext";
import { BrandMark } from "@/components/layout/BrandMark";
import { PageShell } from "@/components/layout/PageShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const Login = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const result = await login(email, password);
      if (result.success) {
        toast.success("Welcome back!");
        navigate("/dashboard");
      } else {
        toast.error(result.error || "Invalid credentials");
      }
    } catch {
      toast.error("An error occurred during login");
    } finally {
      setLoading(false);
    }
  };

  return (
    <PageShell>
      <div className="container flex min-h-screen items-center justify-center py-10">
        <section className="section-card mx-auto w-full max-w-xl animate-slide-up p-8 md:p-10">
          <BrandMark compact className="justify-center" />
          <div className="mt-6 text-center">
            <p className="page-eyebrow">Welcome back</p>
            <h1 className="mt-3 font-heading text-3xl text-white md:text-4xl">Sign in to F1 Predict</h1>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">Use your email and password.</p>
          </div>

          <form onSubmit={handleSubmit} className="mt-8 space-y-5">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="driver@f1.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            <Button type="submit" className="w-full" size="lg" disabled={loading}>
              {loading ? "Signing in..." : "Sign In"}
              {!loading && <ArrowRight className="h-4 w-4" />}
            </Button>
          </form>

          <p className="mt-4 text-center text-sm"><Link to="/forgot-password" className="text-primary transition-colors hover:text-primary/80">Forgot your password?</Link></p>

          <p className="mt-6 text-center text-sm text-white/55">
            Need an account?{" "}
            <Link to="/register" className="text-primary transition-colors hover:text-primary/80">
              Create your account
            </Link>
          </p>
        </section>
      </div>
    </PageShell>
  );
};

export default Login;
