import { NextResponse } from "next/server";
import { clearSessionCookie } from "@/lib/auth";
import { errorResponse, requireSession } from "@/lib/api";

/**
 * POST /api/auth/logout (RF-U1)
 * TP5-50: toda ruta salvo POST /api/auth/login exige sesión activa.
 * El middleware es la primera barrera; el handler valida de nuevo.
 * Fuente: docs/06-api-rest/specs-api-rest.md:8,43,70.
 */
export async function POST(): Promise<NextResponse> {
  try {
    await requireSession();
    await clearSessionCookie();
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return errorResponse(error);
  }
}
