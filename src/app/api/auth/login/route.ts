import { NextResponse } from "next/server";
import { setSessionCookie } from "@/lib/auth";
import { errorResponse, readJson } from "@/lib/api";
import { login } from "@/services/auth";

/**
 * POST /api/auth/login (RF-U1)
 * Adaptador fino: parsea JSON, delega en el servicio y setea la cookie.
 */
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const body = await readJson(request);
    const { user, session } = await login(body);
    await setSessionCookie(session);

    return NextResponse.json(user, { status: 200 });
  } catch (error) {
    return errorResponse(error);
  }
}
