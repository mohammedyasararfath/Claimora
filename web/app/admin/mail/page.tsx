import Link from "next/link";
import { MailSimulator } from "@/components/admin/MailSimulator";

export default function AdminMailPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-6">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h2 className="font-serif text-xl font-semibold">Simulated Inbox</h2>
          <span className="rounded bg-slate-soft px-1.5 py-0.5 text-[0.65rem] font-bold uppercase text-slate">
            Internal tool
          </span>
        </div>
        <Link href="/admin" className="text-sm font-semibold text-indigo">
          ← Back to admin
        </Link>
      </div>
      <MailSimulator />
    </main>
  );
}
