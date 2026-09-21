import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { requireClientEnv } from "./env";

const ADMIN_PREFIX = "/admin";
const AGENT_CONSOLE_PREFIX = "/agent-console";
const DASHBOARD_PREFIX = "/dashboard";

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    requireClientEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireClientEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const needsAdmin = path.startsWith(ADMIN_PREFIX);
  const needsStaff = needsAdmin || path.startsWith(AGENT_CONSOLE_PREFIX);
  const needsAuth = needsStaff || path.startsWith(DASHBOARD_PREFIX);

  if (needsAuth && !user) {
    const redirectUrl = new URL("/login", request.url);
    redirectUrl.searchParams.set("next", path);
    return NextResponse.redirect(redirectUrl);
  }

  if (needsStaff && user) {
    const { data: appUser } = await supabase.from("app_users").select("role").eq("id", user.id).single();
    const role = appUser?.role;
    const allowed = needsAdmin ? role === "admin" : role === "admin" || role === "live_agent";
    if (!allowed) {
      return NextResponse.redirect(new URL("/dashboard?error=forbidden", request.url));
    }
  }

  return response;
}
