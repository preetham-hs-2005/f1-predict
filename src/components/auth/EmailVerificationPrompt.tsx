import { useEffect, useState } from "react";
import { MailCheck, ShieldCheck } from "lucide-react";
import { useLocation } from "react-router-dom";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export function EmailVerificationPrompt() {
  const { user, isLoading, sendVerificationCode, verifyEmailCode, correctEmail } = useAuth();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [code, setCode] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (!isLoading && user && !user.emailVerified && location.pathname === "/dashboard") setOpen(true);
  }, [isLoading, user, location.pathname]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setTimeout(() => setCooldown(cooldown - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [cooldown]);

  if (!user || user.emailVerified) return null;

  const send = async () => {
    setBusy(true);
    try {
      await sendVerificationCode();
      setCooldown(60);
      toast.success(`Code sent to ${user.email}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not send code");
    } finally { setBusy(false); }
  };

  const verify = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try {
      await verifyEmailCode(code.trim());
      setOpen(false);
      toast.success("Email verified. You're ready to predict!");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Verification failed");
    } finally { setBusy(false); }
  };

  const changeEmail = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try {
      const sent = await correctEmail(email.trim(), password);
      setPassword("");
      setCode("");
      setEditing(false);
      setCooldown(sent ? 60 : 0);
      toast.success(sent ? "Email updated. Check your new inbox for a code." : "Email updated. Request a code when ready.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update email");
    } finally { setBusy(false); }
  };

  return <>
    <button type="button" onClick={() => setOpen(true)} className="fixed bottom-4 left-4 right-4 z-40 mx-auto flex max-w-md items-center justify-center gap-2 rounded-sm border border-signal/45 bg-[#1a1d22] px-4 py-3 text-sm font-semibold text-signal shadow-xl shadow-black/50 transition hover:border-signal sm:left-auto sm:right-6" aria-label="Verify your email">
      <MailCheck className="h-4 w-4" /> Verify your email to make predictions
    </button>
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-h-[90vh] overflow-y-auto border-signal/25 bg-[#1a1d22] text-white sm:max-w-md">
        <DialogHeader>
          <div className="mb-3 flex h-11 w-11 items-center justify-center bg-signal text-black"><ShieldCheck className="h-6 w-6" /></div>
          <p className="font-mono text-xs font-bold uppercase tracking-[.2em] text-signal">Race control / account</p>
          <DialogTitle className="text-2xl font-bold">Verify your email</DialogTitle>
          <DialogDescription className="text-white/65">Enter the six-digit code sent to <strong className="break-all text-white">{user.email}</strong>. Codes expire after 10 minutes. You can browse now, but predictions require verification.</DialogDescription>
        </DialogHeader>
        {editing ? <form onSubmit={changeEmail} className="space-y-4 pt-3">
          <div className="space-y-2"><Label htmlFor="correct-email">Correct email address</Label><Input id="correct-email" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} className="bg-background" /></div>
          <div className="space-y-2"><Label htmlFor="confirm-password">Account password</Label><Input id="confirm-password" type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} className="bg-background" /></div>
          <p className="text-xs text-white/55">Changing your address signs out other sessions and cancels the old code.</p>
          <Button type="submit" disabled={busy} className="w-full">{busy ? "Updating…" : "Save and send new code"}</Button>
          <Button type="button" variant="ghost" onClick={() => setEditing(false)} className="w-full">Back to verification</Button>
        </form> : <form onSubmit={verify} className="space-y-4 pt-3">
          <div className="space-y-2"><Label htmlFor="email-code">Verification code</Label><Input id="email-code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} pattern="[0-9]{6}" required value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))} placeholder="000000" className="bg-background text-center font-mono text-2xl tracking-[.4em]" /></div>
          <Button type="submit" disabled={busy || code.length !== 6} className="w-full">{busy ? "Checking…" : "Verify email"}</Button>
          <Button type="button" variant="outline" disabled={busy || cooldown > 0} onClick={send} className="w-full">{cooldown ? `Resend in ${cooldown}s` : "Send or resend code"}</Button>
          <button type="button" onClick={() => { setEmail(user.email); setEditing(true); }} className="block w-full text-center text-sm text-signal underline underline-offset-4">Wrong email? Edit it</button>
        </form>}
      </DialogContent>
    </Dialog>
  </>;
}
