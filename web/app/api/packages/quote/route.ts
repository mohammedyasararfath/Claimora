import { NextResponse } from "next/server";
import { packagesQuoteSchema } from "@/lib/validation/schemas";
import { quotePrice } from "@/lib/payments/pricing";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const parsed = packagesQuoteSchema.safeParse({
    cycle: searchParams.get("cycle") ?? "yearly",
    addon: searchParams.get("addon") === "true",
    promoCode: searchParams.get("promoCode") ?? undefined,
  });

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "invalid request" }, { status: 400 });
  }

  try {
    const quote = await quotePrice(parsed.data);
    return NextResponse.json(quote);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
