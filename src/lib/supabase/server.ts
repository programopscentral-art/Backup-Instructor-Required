import { cache } from "react";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Like createClient(), but guarantees the auth session is loaded onto the
 * client before you run any RLS-protected query or mutation.
 *
 * Wrapped in React cache(): within a single request, every caller shares ONE
 * client and ONE getUser() validation — instead of each page/helper doing its
 * own network round-trip to the auth server (the main source of nav latency).
 */
export const createAuthedClient = cache(async () => {
  const supabase = await createClient();
  await supabase.auth.getUser();
  return supabase;
});

/**
 * Supabase client for Server Components, Route Handlers and Server Actions.
 * Reads/writes the auth session from the request cookies (Next.js 15: async).
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Called from a Server Component — safe to ignore; middleware
            // refreshes the session cookie on the response instead.
          }
        },
      },
    },
  );
}
