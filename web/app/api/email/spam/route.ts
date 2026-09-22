import { NextResponse } from "next/server";
import { z } from "zod";
import { suppressEmail } from "@/lib/email/suppress";

// Mirrors /api/email/unsubscribe. Real Resend-delivered mail also reports
// spam complaints via supabase/functions/email-events-webhook (Resend's
// "email.complained" webhook) — this route exists for the same reason the
// unsubscribe link does: a demo/@example.com recipient has no real mailbox
// to click a native "report spam" button from.
const schema = z.object({ email: z.string().email() });

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const parsed = schema.safeParse({ email: searchParams.get("email") });
  if (!parsed.success) return NextResponse.json({ error: "invalid email" }, { status: 400 });

  await suppressEmail(parsed.data.email, "spam");

  return new NextResponse(
    "<html><body style='font-family:sans-serif;padding:40px;text-align:center'>Thanks — this has been reported and you won't receive further claim reminders.</body></html>",
    { headers: { "Content-Type": "text/html" } },
  );
}
