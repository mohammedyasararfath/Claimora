"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/useToast";

type Fields = {
  full_name: string;
  category: string;
  city: string;
  brokerage: string;
  license: string;
  phone_e164: string;
  email: string;
  snippet: string;
};

const LABELS: Record<keyof Fields, string> = {
  full_name: "Full name",
  category: "Category",
  city: "City",
  brokerage: "Brokerage",
  license: "License",
  phone_e164: "Phone",
  email: "Email",
  snippet: "Bio",
};

export function ProfileEditForm({ initial, lockedFields }: { initial: Fields; lockedFields: string[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const [fields, setFields] = useState(initial);
  const [saving, setSaving] = useState(false);
  const locked = new Set(lockedFields);

  async function save() {
    setSaving(true);
    try {
      const res = await fetch("/api/dashboard/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fields }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "could not save");
      toast(json.changed > 0 ? `Saved ${json.changed} change${json.changed === 1 ? "" : "s"}` : "No changes to save", "success");
      router.refresh();
    } catch (err) {
      toast((err as Error).message, "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {(Object.keys(LABELS) as (keyof Fields)[]).map((key) => (
        <div key={key}>
          <label className="mb-1 block text-xs font-semibold text-ink-soft">
            {LABELS[key]}
            {locked.has(key) && " 🔒"}
          </label>
          {key === "snippet" ? (
            <Textarea
              value={fields[key]}
              onChange={(e) => setFields({ ...fields, [key]: e.target.value })}
              disabled={locked.has(key)}
              className="min-h-[80px]"
            />
          ) : (
            <Input
              value={fields[key]}
              onChange={(e) => setFields({ ...fields, [key]: e.target.value })}
              disabled={locked.has(key)}
            />
          )}
        </div>
      ))}
      <Button onClick={save} disabled={saving} className="mt-1">
        {saving ? "Saving…" : "Save changes"}
      </Button>
    </div>
  );
}
