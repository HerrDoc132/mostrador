import { NextResponse } from "next/server";
import { clearSessionCookie } from "@/lib/auth";
import { errorResponse } from "@/lib/api";

/**
 * POST /api/auth/logout (RF-U1)
 * Borra la cookie de sesión. Es idempotente.
 */
export async function POST(): Promise<NextResponse> {
  try {
    await clearSessionCookie();
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return errorResponse(error);
  }
}
