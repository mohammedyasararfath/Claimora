import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { ResultCard } from "@/components/results/ResultCard";
import { CreateCtaClient } from "@/components/results/CreateCtaClient";

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const query = (q ?? "").trim();

  const supabase = await createClient();

  const { data: results } = query
    ? await supabase
        .from("profiles")
        .select("id, slug, name, category, brokerage, city, status, rating, reviews_count, srs, top5, snippet")
        .or(`name.ilike.%${query}%,city.ilike.%${query}%,category.ilike.%${query}%,brokerage.ilike.%${query}%`)
        .limit(25)
    : { data: [] };

  return (
    <main className="mx-auto max-w-3xl px-5 py-6">
      <p className="mb-1 text-sm text-ink-soft">
        <Link href="/" className="hover:underline">
          Home
        </Link>{" "}
        / Search
      </p>
      <h2 className="font-serif text-xl font-semibold">Results for &ldquo;{query}&rdquo;</h2>
      <p className="mb-4 text-sm text-ink-soft">{results?.length ?? 0} profiles found</p>

      {results && results.length > 0 ? (
        results.map((profile) => <ResultCard key={profile.id} profile={profile} />)
      ) : (
        <div className="mt-2 rounded-lg border border-dashed border-violet bg-violet-soft p-6 text-center">
          <h3 className="mb-1 font-serif text-lg font-semibold">No profile found</h3>
          <p className="mb-4 text-sm text-ink-soft">
            We couldn&apos;t find a match for &ldquo;{query}&rdquo;. You can build a new profile with our AI copilot instead.
          </p>
          <CreateCtaClient freeformText={query} />
        </div>
      )}
    </main>
  );
}
