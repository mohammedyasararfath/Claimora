"use client";

import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/useToast";

export function ShareProfileLinkButton({ slug, label }: { slug: string; label: string }) {
  const { toast } = useToast();

  async function copyLink() {
    const url = `${window.location.origin}/p/${slug}`;
    try {
      await navigator.clipboard.writeText(url);
      toast("Profile link copied to clipboard", "success");
    } catch {
      toast(url, "success");
    }
  }

  return (
    <Button onClick={copyLink} className="w-full">
      {label}
    </Button>
  );
}
