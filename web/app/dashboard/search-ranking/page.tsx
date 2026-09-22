import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card, CardTitle, CardDescription } from "@/components/ui/card";

export default async function SearchRankingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/dashboard/search-ranking");

  const { data: profile } = await supabase.from("profiles").select("srs, status").eq("owner_user_id", user.id).maybeSingle();
  if (!profile) redirect("/dashboard");

  const factors =
    profile.status === "pro"
      ? ["Profile / NAP", "Reviews & Replies", "Social Connections", "Web Analytics", "Listings"]
      : ["Profile / NAP", "Reviews & Replies", "Social Connections"];

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-4">
      <h2 className="font-serif text-xl font-semibold">Search Ranking</h2>
      <Card>
        <CardTitle className="text-base">Search Rank Score® — {profile.srs} of 850</CardTitle>
        <CardDescription>Your score is calculated across these factors:</CardDescription>
        <ul className="mt-3 flex flex-col gap-1.5 text-sm">
          {factors.map((f) => (
            <li key={f} className="border-b border-dashed border-line py-1.5">
              {f}
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
