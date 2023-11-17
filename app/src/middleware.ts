import { fallbackLng, languages } from "@/i18n/settings";
import acceptLanguage from "accept-language";
import authMiddleware, { NextRequestWithAuth } from "next-auth/middleware";
import { NextMiddlewareResult } from "next/dist/server/web/types";
import { NextResponse } from "next/server";

acceptLanguage.languages(languages);

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|assets|favicon.ico|sw.js).*)"],
};

const authMatcher = /^\/[a-z]{0,2}[\/]?auth\//;
const cookieName = "i18next";

export function middleware(req: NextRequestWithAuth) {
  let lng;
  if (req.cookies.has(cookieName)) {
    lng = acceptLanguage.get(req.cookies.get(cookieName)?.value);
  }
  if (!lng) {
    lng = acceptLanguage.get(req.headers.get("Accept-Language"));
  }
  if (!lng) {
    lng = fallbackLng;
  }

  // redirect for paths that don't have lng at the start
  if (
    !languages.some((loc) => req.nextUrl.pathname.startsWith(`/${loc}`)) &&
    !req.nextUrl.pathname.startsWith("/_next")
  ) {
    return NextResponse.redirect(
      new URL(
        `/${lng}${req.nextUrl.pathname}?${req.nextUrl.searchParams}`,
        req.url,
      ),
    );
  }

  if (req.headers.has("referer")) {
    const refererUrl = new URL(req.headers.get("referer")!);
    const lngInReferer = languages.find((l) =>
      refererUrl.pathname.startsWith(`/${l}`),
    );
    const response = next(req);
    if (response instanceof NextResponse && lngInReferer) {
      response.cookies.set(cookieName, lngInReferer);
    }
    return response;
  }

  return next(req);
}

async function next(req: NextRequestWithAuth): Promise<NextMiddlewareResult> {
  const basePath = new URL(req.url).pathname;
  if (!authMatcher.test(basePath)) {
    return await authMiddleware(req);
  } else {
    return NextResponse.next();
  }
}
