import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "@/server/auth/auth.config";
import { buildCsp, generateNonce } from "@/lib/csp";

const { auth } = NextAuth(authConfig);

export default auth((req) => {
  const nonce = generateNonce();
  const csp = buildCsp(nonce, process.env.NODE_ENV !== "production", { turnstile: !!process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY });

  // Cheap gate only: "is there a session cookie that decodes?". Real authorization
  // (active user, session version, permissions) happens server-side in every page/action.
  const { pathname } = req.nextUrl;
  if (pathname !== "/login" && !req.auth?.user) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    const redirect = NextResponse.redirect(url);
    redirect.headers.set("Content-Security-Policy", csp);
    return redirect;
  }

  // Pass the nonce to Next.js (it adds it to its own scripts) via the request headers.
  const headers = new Headers(req.headers);
  headers.set("x-nonce", nonce);
  headers.set("Content-Security-Policy", csp);
  const res = NextResponse.next({ request: { headers } });
  res.headers.set("Content-Security-Policy", csp);
  return res;
});

export const config = {
  matcher: [
    {
      source: "/((?!api/auth|api/health|_next/static|_next/image|favicon.ico|icons|manifest.webmanifest).*)",
      missing: [{ type: "header", key: "next-router-prefetch" }, { type: "header", key: "purpose", value: "prefetch" }],
    },
  ],
};
