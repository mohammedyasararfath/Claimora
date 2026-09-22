"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/useToast";

const DEMO_ACCOUNTS = [
  { label: "Admin", email: "admin-demo@experience.com", next: "/admin" },
  { label: "Live Agent", email: "live-agent-demo@experience.com", next: "/agent-console" },
];
const DEMO_PASSWORD = "Claimora@2026";

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<"password" | "reset">("password");

  async function signInWith(loginEmail: string, loginPassword: string, next: string) {
    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email: loginEmail, password: loginPassword });
    setLoading(false);
    if (error) {
      toast(error.message, "error");
      return;
    }
    router.push(next);
  }

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    await signInWith(email, password, searchParams.get("next") ?? "/dashboard");
  }

  async function sendReset(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback?type=recovery`,
    });
    setLoading(false);
    if (error) {
      toast(error.message, "error");
      return;
    }
    toast("Check your email for a link to set your password.", "success");
  }

  return (
    <>
      <h1 className="text-center font-serif text-xl font-semibold">
        {mode === "password" ? "Log in" : "Set / reset your password"}
      </h1>

      <form className="flex flex-col gap-3" onSubmit={mode === "password" ? signIn : sendReset}>
        <div>
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required className="mt-1" />
        </div>
        {mode === "password" && (
          <div>
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="mt-1"
            />
          </div>
        )}
        <Button type="submit" disabled={loading}>
          {mode === "password" ? "Log in" : "Send reset link"}
        </Button>
      </form>

      <button
        onClick={() => setMode(mode === "password" ? "reset" : "password")}
        className="text-center text-sm text-ink-soft underline"
      >
        {mode === "password" ? "Forgot your password / first time logging in?" : "Back to log in"}
      </button>

      {mode === "password" && process.env.NEXT_PUBLIC_DEMO_MODE === "true" && (
        <div className="mt-2 rounded-lg border border-line bg-paper p-3">
          <p className="mb-2 text-center text-xs font-bold uppercase text-ink-soft">Demo staff accounts</p>
          {DEMO_ACCOUNTS.map((acct) => (
            <div key={acct.email} className="mb-2 flex items-center justify-between gap-2 text-xs last:mb-0">
              <span className="text-ink-soft">
                <span className="font-semibold text-ink">{acct.label}</span>
                <br />
                {acct.email} / {DEMO_PASSWORD}
              </span>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={loading}
                onClick={() => signInWith(acct.email, DEMO_PASSWORD, acct.next)}
              >
                Log in
              </Button>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
