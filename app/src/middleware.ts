import { fallbackLng, languages } from "@/i18n/settings";
import acceptLanguage from "accept-language";
import { withAuth, type NextRequestWithAuth } from "next-auth/middleware";
import type { NextMiddlewareResult } from "next/dist/server/web/types";
import { NextResponse } from "next/server";
import { logger } from "@/services/logger";

acceptLanguage.languages(languages);

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|assets|favicon.ico|sw.js).*)"],
  pages: { signIn: "/auth/login" },
  session: { strategy: "jwt" },
};

const authMatcher = /^\/[a-z]{0,2}(?!\/public)[\/]?auth\//;
const publicMatcher = /^\/[a-z]{0,2}\/public\//;
const cookieName = "i18next";

export async function middleware(req: NextRequestWithAuth) {
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

  if (req.nextUrl.pathname === `/${lng}`) {
    return NextResponse.redirect(new URL(`/${lng}/`, req.url));
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

  if (response instanceof NextResponse) {
    logger.info({ status: response.status, url: req.url, method: req.method });
  }

  return response;
}

async function next(req: NextRequestWithAuth): Promise<NextMiddlewareResult> {
  const basePath = new URL(req.url).pathname;

  // Allow public routes to pass through without authentication
  if (publicMatcher.test(basePath)) {
    return NextResponse.next();
  }

  // Handle auth routes
  if (authMatcher.test(basePath)) {
    return NextResponse.next();
  }

  // Apply authentication to all other routes
  return await withAuth(req, config);
}
