import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card, CardTitle, CardDescription } from "@/components/ui/card";

export default async function AIVisibilityPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/dashboard/ai-visibility");

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-4">
      <h2 className="font-serif text-xl font-semibold">AI Visibility</h2>
      <Card>
        <CardTitle className="text-base">Customers are searching right now</CardTitle>
        <CardDescription>
          AI Visibility tracks how often your profile is surfaced by AI assistants and citation tools. Detailed
          citation tracking and GEO analytics are part of the Pro plan.
        </CardDescription>
      </Card>
    </div>
  );
}
