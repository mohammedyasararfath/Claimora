"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function UserMenu({ name, initials }: { name: string; initials: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  async function logOut() {
    setLoggingOut(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-md px-1.5 py-1 text-sm hover:bg-paper"
      >
        <span className="text-ink-soft">Viewing as</span>
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-indigo-soft text-[0.65rem] font-bold text-indigo">
          {initials}
        </span>
        <span className="font-semibold">{name}</span>
      </button>
      {open && (
        <div className="absolute right-0 top-full z-10 mt-1 w-40 rounded-md border border-line bg-card py-1 shadow-md">
          <button
            onClick={logOut}
            disabled={loggingOut}
            className="w-full px-3 py-2 text-left text-sm font-semibold text-coral hover:bg-paper disabled:opacity-50"
          >
            {loggingOut ? "Logging out…" : "Log out"}
          </button>
        </div>
      )}
    </div>
  );
}
