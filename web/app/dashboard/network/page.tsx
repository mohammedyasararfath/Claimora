import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card, CardTitle, CardDescription } from "@/components/ui/card";

export default async function NetworkPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/dashboard/network");

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-4">
      <h2 className="font-serif text-xl font-semibold">Network</h2>
      <Card>
        <CardTitle className="text-base">Grow your professional network</CardTitle>
        <CardDescription>
          Connect with other professionals on Claimora — referrals and connections both count towards your Search
          Rank Score.
        </CardDescription>
      </Card>
    </div>
  );
}
