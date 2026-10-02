import { useState } from "react";
import { Link } from "react-router-dom";
import { apiClient } from "@/lib/api/client";
import { PageShell } from "@/components/layout/PageShell";
import { BrandMark } from "@/components/layout/BrandMark";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setLoading(true); setError("");
    try { await apiClient.post("/api/auth/forgot-password", { email }); setSent(true); }
    catch { setError("Could not submit your request. Please try again."); }
    finally { setLoading(false); }
  };
  return <PageShell><main className="container flex min-h-screen items-center justify-center py-16">
    <section className="section-card w-full max-w-xl p-8 md:p-10">
      <BrandMark compact className="justify-center" />
      <h1 className="mt-7 text-center font-heading text-3xl text-white">Reset your password</h1>
      {sent ? <p className="mt-5 text-center text-muted-foreground">If an account exists for that email, a reset link has been sent. Check your inbox.</p> :
        <form onSubmit={submit} className="mt-7 space-y-4"><Label htmlFor="reset-email">Account email</Label>
          <Input id="reset-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <Button type="submit" className="w-full" disabled={loading}>{loading ? "Sending..." : "Send reset link"}</Button>
        </form>}
      <p className="mt-6 text-center text-sm"><Link to="/login" className="text-primary">Back to sign in</Link></p>
    </section>
  </main></PageShell>;
}
