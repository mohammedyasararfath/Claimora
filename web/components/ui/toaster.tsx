"use client";

import { useToastStore } from "@/hooks/useToast";
import { cn } from "@/lib/utils";

export function Toaster() {
  const toasts = useToastStore((s) => s.toasts);
  const dismiss = useToastStore((s) => s.dismiss);

  return (
    <div className="fixed bottom-5 left-1/2 z-[100] flex -translate-x-1/2 flex-col items-center gap-2">
      {toasts.map((t) => (
        <button
          key={t.id}
          onClick={() => dismiss(t.id)}
          className={cn(
            "rounded-md px-4 py-2 text-sm shadow-lg",
            t.variant === "error" && "bg-coral text-white",
            t.variant === "success" && "bg-mint text-[#06331E]",
            (!t.variant || t.variant === "default") && "bg-ink text-paper",
          )}
        >
          {t.message}
        </button>
      ))}
    </div>
  );
}
