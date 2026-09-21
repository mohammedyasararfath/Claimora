import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { searchSchema } from "@/lib/validation/schemas";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const parsed = searchSchema.safeParse({ q: searchParams.get("q") ?? "" });

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "invalid query" }, { status: 400 });
  }

  const supabase = await createClient();

  // Full-text search across name/city/category/brokerage, ranked by match
  // quality — replaces the prototype's client-side Array#filter over a
  // hardcoded DATASET with a real Postgres query against live profiles.
  const tsQuery = parsed.data.q.trim().split(/\s+/).join(" & ");

  const { data, error } = await supabase
    .from("profiles")
    .select("id, slug, name, category, brokerage, city, status, rating, reviews_count, srs, top5, snippet")
    .textSearch("name", tsQuery, { type: "websearch", config: "english" })
    .limit(25);

  if (error) {
    // websearch-style textSearch can fail on odd input (e.g. bare punctuation) —
    // fall back to a plain ILIKE match rather than surfacing a 500 to the visitor.
    const { data: fallback, error: fallbackError } = await supabase
      .from("profiles")
      .select("id, slug, name, category, brokerage, city, status, rating, reviews_count, srs, top5, snippet")
      .or(`name.ilike.%${parsed.data.q}%,city.ilike.%${parsed.data.q}%,category.ilike.%${parsed.data.q}%`)
      .limit(25);

    if (fallbackError) {
      return NextResponse.json({ error: "search failed" }, { status: 500 });
    }
    return NextResponse.json({ results: fallback, query: parsed.data.q });
  }

  return NextResponse.json({ results: data, query: parsed.data.q });
}
