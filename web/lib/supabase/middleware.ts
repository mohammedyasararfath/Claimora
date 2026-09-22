import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { requireClientEnv } from "./env";
import { createAdminClient } from "./admin";

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
    // Looked up via the admin (service-role) client, not the request-scoped
    // anon-key `supabase` above: that client's Postgres role check depends on
    // the access token used for THIS query still being fresh at the exact
    // moment it fires, right after `getUser()` may have just rotated it —
    // any lag in that handoff makes `auth.uid()` resolve to nothing inside
    // the "self read" RLS policy, so a genuinely-staff user intermittently
    // got bounced to /dashboard?error=forbidden on refresh. The service-role
    // client bypasses RLS entirely, so the role lookup only ever depends on
    // `user.id`, which `getUser()` has already verified server-side.
    const admin = createAdminClient();
    const { data: appUser } = await admin.from("app_users").select("role").eq("id", user.id).maybeSingle();
    const role = appUser?.role;
    const allowed = needsAdmin ? role === "admin" : role === "admin" || role === "live_agent";
    if (!allowed) {
      return NextResponse.redirect(new URL("/dashboard?error=forbidden", request.url));
    }
  }

  return response;
}
