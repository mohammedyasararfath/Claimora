import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { searchSchema } from "@/lib/validation/schemas";
import { searchProfiles } from "@/lib/search/query";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const parsed = searchSchema.safeParse({ q: searchParams.get("q") ?? "" });

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "invalid query" }, { status: 400 });
  }

  const supabase = await createClient();
  const { data, error } = await searchProfiles(supabase, parsed.data.q);

  if (error) {
    return NextResponse.json({ error: "search failed" }, { status: 500 });
  }

  return NextResponse.json({ results: data, query: parsed.data.q });
}
