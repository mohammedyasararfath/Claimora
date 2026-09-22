import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card, CardTitle, CardDescription } from "@/components/ui/card";

export default async function ConnectionsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/dashboard/connections");

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-4">
      <h2 className="font-serif text-xl font-semibold">Connections</h2>
      <Card>
        <CardTitle className="text-base">0 of 7 connected</CardTitle>
        <CardDescription>
          Connect with other professionals on Claimora to build your network and earn Search Rank Score points.
        </CardDescription>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-line">
          <div className="h-full w-0 bg-indigo" />
        </div>
      </Card>
    </div>
  );
}
