import { NextResponse } from "next/server";
import { errorResponse, readJson, requireSession } from "@/lib/api";
import { changeOwnPassword } from "@/services/auth";

/**
 * PUT /api/auth/password (RF-U5)
 * Ambos roles pueden cambiar su propia contraseña.
 */
export async function PUT(request: Request): Promise<NextResponse> {
  try {
    const actor = await requireSession();
    const body = await readJson(request);
    await changeOwnPassword(body, actor);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return errorResponse(error);
  }
}
