import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card, CardTitle, CardDescription } from "@/components/ui/card";

export default async function InsightsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/dashboard/insights");

  const { data: profile } = await supabase
    .from("profiles")
    .select("reviews_count, rating, srs")
    .eq("owner_user_id", user.id)
    .maybeSingle();
  if (!profile) redirect("/dashboard");

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-4">
      <h2 className="font-serif text-xl font-semibold">Insights</h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Card>
          <CardTitle className="text-base">{profile.reviews_count}</CardTitle>
          <CardDescription>Reviews on file</CardDescription>
        </Card>
        <Card>
          <CardTitle className="text-base">{profile.rating}</CardTitle>
          <CardDescription>Average rating</CardDescription>
        </Card>
        <Card>
          <CardTitle className="text-base">{profile.srs}</CardTitle>
          <CardDescription>Search Rank Score</CardDescription>
        </Card>
      </div>
    </div>
  );
}
