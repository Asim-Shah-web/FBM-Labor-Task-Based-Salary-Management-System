"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { Loader2, Mail } from "lucide-react";
import { resendCodeAction, startLoginAction, verifyLoginAction } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Turnstile, type TurnstileHandle } from "@/components/shared/turnstile";

const RESEND_SECONDS = 30;

export function LoginForm({ passwordChanged }: { passwordChanged: boolean }) {
  const [step, setStep] = useState<"password" | "code">("password");
  const [challenge, setChallenge] = useState<{ id: string; hint: string } | null>(null);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [token, setToken] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [cooldown, setCooldown] = useState(0);
  const turnstile = useRef<TurnstileHandle>(null);
  const onToken = useCallback((t: string) => setToken(t), []);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const submitPassword = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null); setInfo(null);
    start(async () => {
      const r = await startLoginAction({ username, password, turnstileToken: token || undefined });
      turnstile.current?.reset(); // a Turnstile token works only once
      if (!r.ok) return setError(r.error);
      setPassword("");
      setChallenge({ id: r.data!.challengeId, hint: r.data!.emailHint });
      setCooldown(RESEND_SECONDS);
      setStep("code");
    });
  };

  const submitCode = (e: React.FormEvent) => {
    e.preventDefault();
    if (!challenge) return;
    setError(null); setInfo(null);
    start(async () => {
      const r = await verifyLoginAction({ challengeId: challenge.id, code });
      if (r && !r.ok) { setError(r.error); setCode(""); }
      // On success the server redirects to the dashboard.
    });
  };

  const resend = () => {
    if (!challenge) return;
    setError(null); setInfo(null);
    start(async () => {
      const r = await resendCodeAction({ challengeId: challenge.id });
      if (!r.ok) return setError(r.error);
      setInfo("A new code was sent. Older codes no longer work."); setCooldown(RESEND_SECONDS); setCode("");
    });
  };

  const back = () => { setStep("password"); setChallenge(null); setCode(""); setError(null); setInfo(null); };

  return (
    <Card className="w-full max-w-sm">
      <CardHeader className="items-center text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary text-xl font-bold text-primary-foreground">F</div>
        <h1 className="mt-2 text-xl font-semibold">FBM Labor</h1>
        <p className="text-sm text-muted-foreground">{step === "password" ? "Sign in to continue" : "Check your email"}</p>
      </CardHeader>
      <CardContent>
        {step === "password" ? (
          <form onSubmit={submitPassword} className="flex flex-col gap-4">
            {passwordChanged && <p role="status" className="rounded-md bg-secondary p-3 text-sm">Password changed. Please sign in again.</p>}
            <div className="flex flex-col gap-2">
              <Label htmlFor="username">Username or email</Label>
              <Input id="username" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" autoCapitalize="none" autoCorrect="off" required />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="password">Password</Label>
              <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
            </div>
            <Turnstile ref={turnstile} onToken={onToken} />
            {error && <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
            <Button type="submit" disabled={pending || (!!process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY && !token)}>
              {pending && <Loader2 className="h-4 w-4 animate-spin" />} Continue
            </Button>
          </form>
        ) : (
          <form onSubmit={submitCode} className="flex flex-col gap-4">
            <div className="flex items-start gap-2 rounded-md bg-secondary p-3 text-sm">
              <Mail className="mt-0.5 h-4 w-4 shrink-0" />
              <p>We emailed a 6-digit code to <b>{challenge?.hint}</b>. It expires in 10 minutes.</p>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="code">Login code</Label>
              <Input
                id="code" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} placeholder="123456"
                className="text-center text-xl tracking-[0.5em]" autoFocus required
              />
            </div>
            {info && <p role="status" className="rounded-md bg-emerald-50 p-3 text-sm text-emerald-800">{info}</p>}
            {error && <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
            <Button type="submit" disabled={pending || code.length !== 6}>
              {pending && <Loader2 className="h-4 w-4 animate-spin" />} Sign in
            </Button>
            <div className="flex items-center justify-between text-sm">
              <Button type="button" variant="ghost" size="sm" onClick={back}>Back</Button>
              <Button type="button" variant="ghost" size="sm" disabled={pending || cooldown > 0} onClick={resend}>
                {cooldown > 0 ? `Resend code (${cooldown}s)` : "Resend code"}
              </Button>
            </div>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
