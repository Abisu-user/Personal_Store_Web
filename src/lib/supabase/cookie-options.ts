/**
 * Keep the Supabase browser session in a first-party, persistent cookie.
 *
 * App locking is deliberately separate from authentication: closing the PWA
 * or putting it in the background must not remove a valid refresh session.
 * The browser client needs access to this cookie to rotate its refresh token,
 * so it cannot be HttpOnly in this SSR browser-client setup.
 */
export const authCookieOptions = {
  path: "/",
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  // Cookie lifetime only controls browser persistence. Supabase Auth remains
  // the source of truth for refresh-session expiry, sign-out, and revocation.
  maxAge: 400 * 24 * 60 * 60,
};
