import { AdminTable } from "@/components/admin/AdminTable";

export default function AdminPage() {
  return (
    <main className="mx-auto max-w-6xl px-4 py-6">
      <h2 className="mb-4 font-serif text-xl font-semibold">Admin — Profiles &amp; Claim Mail</h2>
      <AdminTable />
    </main>
  );
}
