import { NextResponse } from "next/server";
import { z } from "zod";
import { suppressEmail } from "@/lib/email/suppress";

const schema = z.object({ email: z.string().email() });

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const parsed = schema.safeParse({ email: searchParams.get("email") });
  if (!parsed.success) return NextResponse.json({ error: "invalid email" }, { status: 400 });

  await suppressEmail(parsed.data.email, "unsubscribed");

  return new NextResponse(
    "<html><body style='font-family:sans-serif;padding:40px;text-align:center'>You're unsubscribed from claim reminder emails.</body></html>",
    { headers: { "Content-Type": "text/html" } },
  );
}
