import { NextResponse, type NextRequest } from "next/server";

const PUBLIC = ["/login", "/signup"];

/** Cheap gate: bounce visitors without a session cookie. Real validation happens server-side. */
export function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  const hasSession = req.cookies.has("wl_session");
  if (PUBLIC.some((p) => pathname.startsWith(p))) return NextResponse.next();
  if (!hasSession) {
    if (pathname.startsWith("/api/")) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = pathname === "/" ? "" : `?next=${encodeURIComponent(pathname + search)}`;
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|.*\\.(?:png|jpg|jpeg|svg|webp|woff2?)$).*)"],
};
