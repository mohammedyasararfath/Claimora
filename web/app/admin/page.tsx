import Link from "next/link";
import { AdminTable } from "@/components/admin/AdminTable";

export default function AdminPage() {
  return (
    <main className="mx-auto max-w-6xl px-4 py-6">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="font-serif text-xl font-semibold">Admin — Profiles &amp; Claim Mail</h2>
        <div className="flex items-center gap-4">
          <Link href="/admin/mail" className="text-sm font-semibold text-indigo">
            Simulated Inbox →
          </Link>
          <Link href="/admin/conversion-measurement" className="text-sm font-semibold text-indigo">
            Conversion Measurement →
          </Link>
        </div>
      </div>
      <AdminTable />
    </main>
  );
}
