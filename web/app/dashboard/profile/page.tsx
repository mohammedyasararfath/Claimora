import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card, CardTitle, CardDescription } from "@/components/ui/card";
import { ProfileEditForm } from "@/components/dashboard/ProfileEditForm";
import { onboardingProgress } from "../layout";

export default async function ProfilePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/dashboard/profile");

  const { data: profile } = await supabase.from("profiles").select("*").eq("owner_user_id", user.id).maybeSingle();
  if (!profile) redirect("/dashboard");

  const { data: locks } = await supabase.from("profile_field_locks").select("field_name").eq("profile_id", profile.id);
  const lockedFields = (locks ?? []).map((l) => l.field_name);
  const { done, total } = onboardingProgress(profile);

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-4">
      <h2 className="font-serif text-xl font-semibold">Profile</h2>

      {profile.is_restricted && (
        <div className="rounded-lg border border-amber bg-amber-soft p-3 text-sm text-amber">
          🔒 Name, License ID, Reply to Reviews, and Reviews Report are locked pending admin verification.
        </div>
      )}

      <Card>
        <CardTitle className="text-base">Profile completeness</CardTitle>
        <CardDescription>
          {done} of {total} items complete
        </CardDescription>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-line">
          <div className="h-full bg-indigo" style={{ width: `${Math.round((done / total) * 100)}%` }} />
        </div>
      </Card>

      <Card>
        <ProfileEditForm
          initial={{
            full_name: profile.name,
            category: profile.category,
            city: profile.city ?? "",
            brokerage: profile.brokerage ?? "",
            license: profile.license ?? "",
            phone_e164: profile.phone_e164 ?? "",
            email: profile.email ?? "",
            snippet: profile.snippet ?? "",
          }}
          lockedFields={lockedFields}
        />
      </Card>
    </div>
  );
}
