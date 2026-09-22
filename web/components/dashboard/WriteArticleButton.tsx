"use client";

import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/useToast";

export function WriteArticleButton() {
  const { toast } = useToast();
  return (
    <Button className="mt-2.5 w-full" onClick={() => toast("The AI Writing Studio is coming soon.", "success")}>
      ✎ Write Article
    </Button>
  );
}
