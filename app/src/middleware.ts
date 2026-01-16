import { fallbackLng, languages } from "@/i18n/settings";
import { FeatureFlags, hasFeatureFlag } from "@/util/feature-flags";
import acceptLanguage from "accept-language";
import { withAuth, type NextRequestWithAuth } from "next-auth/middleware";
import type { NextMiddlewareResult } from "next/dist/server/web/types";
import { NextResponse } from "next/server";

acceptLanguage.languages(languages);

// CORS configuration
const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(",") || [
  process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
];

function isOriginAllowed(origin: string | null): boolean {
  if (!origin) return false;
  return allowedOrigins.some((allowed) => {
    if (allowed.includes("*")) {
      // Support wildcard subdomains like *.example.com
      // Escape regex metacharacters to prevent regex injection
      const escaped = allowed.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
      // Replace all occurrences of * with .*
      const pattern = escaped.replaceAll("*", ".*");
      return new RegExp(`^${pattern}$`).test(origin);
    }
    return origin === allowed;
  });
}

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
  // Handle Content-Type for static files
  if (req.nextUrl.pathname === "/robots.txt") {
    const response = NextResponse.next();
    response.headers.set("Content-Type", "text/plain; charset=utf-8");
    return response;
  }
  if (req.nextUrl.pathname.includes("/sitemap")) {
    const response = NextResponse.next();
    response.headers.set("Content-Type", "application/xml; charset=utf-8");
    return response;
  }

  if (
    req.nextUrl.pathname.startsWith("/api") ||
    req.nextUrl.pathname.startsWith("/.well-known")
  ) {
    if (excludedApi.some((ptrn) => req.nextUrl.pathname.match(ptrn))) {
      return NextResponse.next();
    }

    const origin = req.headers.get("origin");
    const isAllowed = isOriginAllowed(origin);

    if (req.method === "OPTIONS") {
      return new Response(null, {
        status: 200,
        headers: {
          "Access-Control-Allow-Origin": isAllowed
            ? origin!
            : allowedOrigins[0],
          "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization",
          "Access-Control-Max-Age": "86400", // 24 hours
          "Access-Control-Allow-Credentials": isAllowed ? "true" : "false",
          Vary: "Origin",
        },
      });
    }

    const response = NextResponse.next();
    if (isAllowed) {
      response.headers.set("Access-Control-Allow-Origin", origin!);
      response.headers.set("Access-Control-Allow-Credentials", "true");
    } else {
      response.headers.set("Access-Control-Allow-Origin", allowedOrigins[0]);
      response.headers.set("Access-Control-Allow-Credentials", "false");
    }
    response.headers.set(
      "Access-Control-Allow-Methods",
      "GET,POST,PUT,PATCH,DELETE,OPTIONS",
    );
    response.headers.set(
      "Access-Control-Allow-Headers",
      "Content-Type, Authorization",
    );
    response.headers.set("Vary", "Origin");
    return response;
  }

  let lng;
  let response: NextResponse | NextMiddlewareResult | undefined;

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
  if (!req.cookies.has(cookieName)) {
    response?.headers.set(
      "Set-Cookie",
      `${cookieName}=${lng}; Path=/; HttpOnly; SameSite=Strict`,
    );
  }
  if (
    !languages.some((loc) => req.nextUrl.pathname.startsWith(`/${loc}`)) &&
    !req.nextUrl.pathname.startsWith("/_next")
  ) {
    response = NextResponse.redirect(
      new URL(
        `/${lng}${req.nextUrl.pathname}?${req.nextUrl.searchParams}`,
        req.url,
      ),
    );
  } else if (req.headers.has("referer")) {
    const refererUrl = new URL(req.headers.get("referer")!);
    const lngInReferer = languages.find((l) =>
      refererUrl.pathname.startsWith(`/${l}`),
    );
    const response = next(req);
    if (response instanceof NextResponse && lngInReferer) {
      response.cookies.set(cookieName, lngInReferer);
    }
  } else {
    response = await next(req);
  }

  // Add security headers to all responses
  if (response instanceof NextResponse) {
    // Remove X-Powered-By header if present (should be disabled in next.config.mjs, but ensure it's removed)
    response.headers.delete("X-Powered-By");
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
