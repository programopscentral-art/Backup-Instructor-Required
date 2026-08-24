import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isDomainAllowed } from "@/lib/auth/roles";

/**
 * Google OAuth redirect target. Exchanges the code for a session, then enforces
 * the @nxtwave domain lock before letting the user in.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  // Only allow same-site relative paths as the post-login destination — reject
  // absolute URLs and protocol-relative "//host" to prevent an open redirect.
  const nextRaw = searchParams.get("next") ?? "/dashboard";
  const next = /^\/(?!\/)/.test(nextRaw) ? nextRaw : "/dashboard";

  if (!code) {
    return NextResponse.redirect(`${origin}/auth/auth-error?reason=nocode`);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(`${origin}/auth/auth-error?reason=exchange`);
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Domain lock: only @nxtwave.in / @nxtwave.co.in may proceed. Because the
  // Google consent screen is "External" (to allow BOTH nxtwave orgs), this
  // server-side check is the real security boundary. Any other account that
  // reaches here is signed out AND its stray auth record is deleted.
  if (!isDomainAllowed(user?.email)) {
    if (user) {
      try {
        await createAdminClient().auth.admin.deleteUser(user.id);
      } catch {
        /* best-effort cleanup */
      }
    }
    await supabase.auth.signOut();
    return NextResponse.redirect(`${origin}/auth/auth-error?reason=domain`);
  }

  // Handle load balancers / proxies that set x-forwarded-host.
  const forwardedHost = request.headers.get("x-forwarded-host");
  const isLocal = process.env.NODE_ENV === "development";
  const base = isLocal || !forwardedHost ? origin : `https://${forwardedHost}`;

  return NextResponse.redirect(`${base}${next}`);
}
