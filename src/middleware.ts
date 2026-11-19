import { NextResponse, type NextRequest } from "next/server";

/**
 * RF-U2: primera barrera de protección.
 * - Páginas sin cookie => redirect a /login.
 * - Endpoints /api/* sin cookie => 401 NO_AUTENTICADO.
 * La validación real contra la base se hace en cada servicio (segunda/tercera barrera).
 */

const PUBLIC_PATHS = ["/login", "/api/auth/login"];

function isPublic(pathname: string): boolean {
  return PUBLIC_PATHS.some(
    (publicPath) =>
      pathname === publicPath || pathname.startsWith(`${publicPath}/`)
  );
}

export function middleware(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl;

  if (isPublic(pathname)) {
    return NextResponse.next();
  }

  if (request.cookies.has("session_token")) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/api/")) {
    return NextResponse.json(
      {
        error: {
          code: "NO_AUTENTICADO",
          message: "Tenés que iniciar sesión.",
        },
      },
      { status: 401 }
    );
  }

  const loginUrl = new URL("/login", request.url);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
