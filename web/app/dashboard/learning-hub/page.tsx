import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card, CardTitle, CardDescription } from "@/components/ui/card";

const ARTICLES = [
  { title: "5 ways to earn more reviews", desc: "Simple, non-pushy ways to ask happy clients for a review." },
  { title: "Writing a profile bio that converts", desc: "What to include in your professional summary." },
  { title: "Understanding your Search Rank Score", desc: "What actually moves the needle, and what doesn't." },
];

export default async function LearningHubPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/dashboard/learning-hub");

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-3">
      <h2 className="font-serif text-xl font-semibold">Learning Hub</h2>
      {ARTICLES.map((a) => (
        <Card key={a.title}>
          <CardTitle className="text-base">{a.title}</CardTitle>
          <CardDescription>{a.desc}</CardDescription>
        </Card>
      ))}
    </div>
  );
}
