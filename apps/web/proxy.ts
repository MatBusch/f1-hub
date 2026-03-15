import { NextResponse, type NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

const PUBLIC_PATHS = ["/sign-in"];
const PUBLIC_PREFIXES = ["/invite/", "/api/auth/"];

function isPublicPath(pathname: string) {
  if (PUBLIC_PATHS.includes(pathname)) {
    return true;
  }

  return PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  const sessionToken = getSessionCookie(request.headers);

  if (sessionToken) {
    return NextResponse.next();
  }

  const signInUrl = new URL("/sign-in", request.url);
  const returnTo = `${pathname}${search}`;

  signInUrl.searchParams.set("returnTo", returnTo);

  return NextResponse.redirect(signInUrl);
}

export const config = {
  matcher: ["/((?!_next|favicon.ico|.*\\.[^/]+$).*)"],
};
