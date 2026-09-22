import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";

export default async function SettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/dashboard/settings");

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-4">
      <h2 className="font-serif text-xl font-semibold">Settings</h2>

      <Card>
        <CardTitle className="mb-3 text-base">Account</CardTitle>
        <div className="flex justify-between border-b border-dashed border-line py-2 text-sm">
          <span className="text-ink-soft">Login email</span>
          <span className="font-semibold">{user.email}</span>
        </div>
        <Button asChild variant="outline" className="mt-3 w-full">
          <Link href="/auth/update-password">Change password</Link>
        </Button>
      </Card>
    </div>
  );
}
