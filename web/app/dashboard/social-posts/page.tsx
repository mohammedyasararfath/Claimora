import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Card, CardTitle, CardDescription } from "@/components/ui/card";

export default async function SocialPostsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/dashboard/social-posts");

  const { data: profile } = await supabase.from("profiles").select("status").eq("owner_user_id", user.id).maybeSingle();
  if (!profile) redirect("/dashboard");

  if (profile.status !== "pro") {
    return (
      <div className="mx-auto flex max-w-xl flex-col gap-4">
        <h2 className="font-serif text-xl font-semibold">Social Posts</h2>
        <Card>
          <CardTitle className="text-base">Social Posts is a Pro feature</CardTitle>
          <CardDescription>
            Upgrade to Pro to schedule and publish social posts directly from your dashboard.
          </CardDescription>
          <Button asChild className="mt-3 w-full">
            <Link href="/dashboard/upgrade">Upgrade to Pro</Link>
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-4">
      <h2 className="font-serif text-xl font-semibold">Social Posts</h2>
      <Card>
        <CardTitle className="text-base">No posts yet</CardTitle>
        <CardDescription>Social post scheduling is coming soon.</CardDescription>
      </Card>
    </div>
  );
}
