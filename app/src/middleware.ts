import { fallbackLng, languages } from "@/i18n/settings";
import { FeatureFlags, hasFeatureFlag } from "@/util/feature-flags";
import acceptLanguage from "accept-language";
import { withAuth, type NextRequestWithAuth } from "next-auth/middleware";
import type { NextMiddlewareResult } from "next/dist/server/web/types";
import { NextResponse } from "next/server";

acceptLanguage.languages(languages);

export const config = {
  matcher: [
    "/api/:path*",
    "/((?!docs|_next/static|_next/image|assets|favicon.ico|sw.js).*)",
  ],
  pages: { signIn: "/auth/login" },
  session: { strategy: "jwt" },
};

const authMatcher = /^\/[a-z]{0,2}(?!\/public)[\/]?auth\//;
const inviteMatcher = /^\/[a-z]{2}\/(organization|user)\/invites\/?$/;
const publicMatcher = /^\/[a-z]{0,2}\/public\//;
const cookieName = "i18next";

const excludedApi = [
  /^\/api\/auth\//,
  /^\/api\/v1\/auth\//,
  /^\/api\/v1\/check\//,
  /^\/api\/v1\/mock\//,
  /^\/api\/v1\/chat\//,
];

export async function middleware(req: NextRequestWithAuth) {
  if (
    req.nextUrl.pathname.startsWith("/api") ||
    req.nextUrl.pathname.startsWith("/.well-known")
  ) {
    if (excludedApi.some((ptrn) => req.nextUrl.pathname.match(ptrn))) {
      return NextResponse.next();
    }
    if (req.method === "OPTIONS") {
      return new Response(null, {
        status: 200,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization",
          "Access-Control-Max-Age": "86400", // 24 hours
          "Access-Control-Allow-Credentials": "false",
        },
      });
    }
    const response = NextResponse.next();
    response.headers.set("Access-Control-Allow-Origin", "*");
    response.headers.set(
      "Access-Control-Allow-Methods",
      "GET,POST,PUT,PATCH,DELETE,OPTIONS",
    );
    response.headers.set(
      "Access-Control-Allow-Headers",
      "Content-Type, Authorization",
    );
    response.headers.set("Access-Control-Allow-Credentials", "false");
    return response;
  }

  let lng;
  let response: NextResponse | NextMiddlewareResult | undefined;

  // Priority order for language detection:
  // 1. Cookie (user's explicit preference)
  // 2. Accept-Language header (browser preference)
  // 3. Fallback language
  if (req.cookies.has(cookieName)) {
    lng = acceptLanguage.get(req.cookies.get(cookieName)?.value);
  }
  if (!lng) {
    lng = acceptLanguage.get(req.headers.get("Accept-Language"));
  }
  if (!lng) {
    lng = fallbackLng;
  }

  if ([`/${lng}`, `/${lng}/`].includes(req.nextUrl.pathname)) {
    if (hasFeatureFlag(FeatureFlags.JN_ENABLED)) {
      return NextResponse.redirect(new URL(`/${lng}/cities/`, req.url));
    }
    // When JN is disabled, let the PrivateHome component handle the routing
    // Don't redirect here to avoid infinite loops
    return NextResponse.next();
  }

  // redirect for paths that don't have lng at the start
  if (
    !languages.some((loc) => req.nextUrl.pathname.startsWith(`/${loc}`)) &&
    !req.nextUrl.pathname.startsWith("/_next")
  ) {
    const redirectUrl = new URL(
      `/${lng}${req.nextUrl.pathname}?${req.nextUrl.searchParams}`,
      req.url,
    );
    const redirect = NextResponse.redirect(redirectUrl);
    // Set cookie if not already present
    if (!req.cookies.has(cookieName)) {
      redirect.cookies.set(cookieName, lng, {
        path: "/",
        httpOnly: true,
        sameSite: "strict",
      });
    }
    response = redirect;
  } else {
    // Path already has language prefix
    // Extract language from URL
    const lngInUrl = languages.find((l) =>
      req.nextUrl.pathname.startsWith(`/${l}`),
    );

    // If cookie exists and matches URL language, proceed normally
    // If cookie exists but URL has different language, redirect to cookie language
    // This handles cases where user has old URLs bookmarked or cached
    if (lngInUrl && lng !== lngInUrl) {
      // Cookie language takes precedence - redirect to correct language URL
      const pathWithoutLng = req.nextUrl.pathname.replace(
        new RegExp(`^/${lngInUrl}`),
        "",
      );
      const redirectUrl = new URL(
        `/${lng}${pathWithoutLng}${req.nextUrl.search}`,
        req.url,
      );
      response = NextResponse.redirect(redirectUrl);
    } else {
      // Language matches or no cookie - proceed with auth check
      response = await next(req);
    }
  }

  return response;
}

async function next(req: NextRequestWithAuth): Promise<NextMiddlewareResult> {
  const basePath = new URL(req.url).pathname;
  const searchParams = new URL(req.url).searchParams;

  // Allow public routes to pass through without authentication
  if (publicMatcher.test(basePath)) {
    return NextResponse.next();
  }

  // Handle auth routes
  if (authMatcher.test(basePath)) {
    return NextResponse.next();
  }

  // handle invite routes
  if (inviteMatcher.test(basePath) && !searchParams.has("from")) {
    return await withAuth(req, {
      ...config,
      pages: { signIn: "/auth/signup" },
    });
  }

  // Apply authentication to all other routes
  return await withAuth(req, config);
}
