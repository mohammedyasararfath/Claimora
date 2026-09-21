"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/useToast";

export default function UpdatePasswordPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 8) {
      toast("Password must be at least 8 characters", "error");
      return;
    }
    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) {
      toast(error.message, "error");
      return;
    }
    toast("Password set — welcome!", "success");
    router.push("/dashboard");
  }

  return (
    <main className="mx-auto flex max-w-sm flex-col gap-4 px-5 py-16">
      <h1 className="text-center font-serif text-xl font-semibold">Set your password</h1>
      <form className="flex flex-col gap-3" onSubmit={submit}>
        <div>
          <Label htmlFor="password">New password</Label>
          <Input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={8}
            required
            className="mt-1"
          />
        </div>
        <Button type="submit" disabled={loading}>
          Save password
        </Button>
      </form>
    </main>
  );
}
