import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiClient } from "@/lib/api/client";
import { PageShell } from "@/components/layout/PageShell";
import { BrandMark } from "@/components/layout/BrandMark";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/contexts/AuthContext";

export default function ResetPassword() {
  const [token] = useState(() => new URLSearchParams(window.location.search).get("token") || "");
  const { logout } = useAuth();
  useEffect(() => { window.history.replaceState(window.history.state, "", window.location.pathname); }, []);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (password !== confirm) { setError("Passwords do not match."); return; }
    setLoading(true); setError("");
    try { await apiClient.post("/api/auth/reset-password", { token, password }); await logout(); setDone(true); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Could not reset your password."); }
    finally { setLoading(false); }
  };
  return <PageShell><main className="container flex min-h-screen items-center justify-center py-16">
    <section className="section-card w-full max-w-xl p-8 md:p-10">
      <BrandMark compact className="justify-center" />
      <h1 className="mt-7 text-center font-heading text-3xl text-white">Choose a new password</h1>
      {!token ? <p className="mt-5 text-center text-destructive">This reset link is invalid. Request a new one.</p> : done ?
        <p className="mt-5 text-center text-muted-foreground">Your password has been changed. Sign in again with your new password.</p> :
        <form onSubmit={submit} className="mt-7 space-y-4">
          <div className="space-y-2"><Label htmlFor="new-password">New password</Label><Input id="new-password" type="password" minLength={8} maxLength={128} value={password} onChange={(event) => setPassword(event.target.value)} required /></div>
          <div className="space-y-2"><Label htmlFor="confirm-password">Confirm password</Label><Input id="confirm-password" type="password" minLength={8} maxLength={128} value={confirm} onChange={(event) => setConfirm(event.target.value)} required /></div>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <Button type="submit" className="w-full" disabled={loading}>{loading ? "Updating..." : "Update password"}</Button>
        </form>}
      <p className="mt-6 text-center text-sm"><Link to={done ? "/login" : "/forgot-password"} className="text-primary">{done ? "Sign in" : "Request another link"}</Link></p>
    </section>
  </main></PageShell>;
}
