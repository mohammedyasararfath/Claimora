"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/useToast";

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<"password" | "reset">("password");

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      toast(error.message, "error");
      return;
    }
    router.push(searchParams.get("next") ?? "/dashboard");
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
    </>
  );
}
