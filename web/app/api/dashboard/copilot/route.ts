import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { callEdgeFunction } from "@/lib/supabase/functions";

const schema = z.object({
  message: z.string().trim().min(1).max(2000),
  sessionId: z.string().uuid().nullish(),
  history: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string() }))
    .max(20)
    .optional(),
});

export async function POST(req: Request) {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "invalid request" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "sign in required" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, name, category, city, status, srs, reviews_count, rating, brokerage, license, phone_e164, email, snippet")
    .eq("owner_user_id", user.id)
    .maybeSingle();

  if (!profile) return NextResponse.json({ error: "no profile linked to this account" }, { status: 404 });

  // The edge function trusts sessionId at face value (it runs with
  // service-role privileges) — a client-supplied id must be verified here
  // first, or a malicious caller could pass someone else's session and have
  // messages inserted into it.
  if (parsed.data.sessionId) {
    const { data: session } = await supabase
      .from("chat_sessions")
      .select("visitor_user_id")
      .eq("id", parsed.data.sessionId)
      .maybeSingle();
    if (!session || session.visitor_user_id !== user.id) {
      return NextResponse.json({ error: "not authorized for this session" }, { status: 403 });
    }
  }

  const { ok, status, data } = await callEdgeFunction("dashboard-copilot", {
    mode: "chat",
    profile,
    ownerUserId: user.id,
    sessionId: parsed.data.sessionId ?? null,
    history: parsed.data.history ?? [],
    message: parsed.data.message,
  });

  return NextResponse.json(data, { status: ok ? 200 : status });
}
