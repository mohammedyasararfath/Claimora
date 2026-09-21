import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database.types";

const SEARCH_COLUMNS = "id, slug, name, category, brokerage, city, status, rating, reviews_count, srs, top5, snippet";

/**
 * Splits a free-text query into tokens and requires every token to match at
 * least one of name/city/category/brokerage (AND across tokens, OR across
 * fields per token). A naive single `ilike %whole query%` match fails for
 * anything like "Jordan Reyes, Austin TX" — no single column contains that
 * exact combined substring, even though every token individually matches.
 */
export async function searchProfiles(supabase: SupabaseClient<Database>, rawQuery: string) {
  const tokens = rawQuery
    .split(/[\s,]+/)
    .map((t) => t.trim())
    .filter(Boolean);

  if (tokens.length === 0) {
    return { data: [], error: null };
  }

  let builder = supabase.from("profiles").select(SEARCH_COLUMNS).limit(25);

  for (const token of tokens) {
    const escaped = token.replace(/[%_]/g, "\\$&");
    builder = builder.or(`name.ilike.%${escaped}%,city.ilike.%${escaped}%,category.ilike.%${escaped}%,brokerage.ilike.%${escaped}%`);
  }

  return builder;
}
