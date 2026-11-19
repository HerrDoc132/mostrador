import { NextResponse } from "next/server";
import { errorResponse, requireSession } from "@/lib/api";

/**
 * GET /api/auth/me (RF-U1, RF-U2)
 * Devuelve el usuario conectado validando la sesión contra la base.
 */
export async function GET(): Promise<NextResponse> {
  try {
    const user = await requireSession();
    return NextResponse.json(user, { status: 200 });
  } catch (error) {
    return errorResponse(error);
  }
}
