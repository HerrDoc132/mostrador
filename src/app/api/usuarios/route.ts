import { NextResponse, type NextRequest } from "next/server";
import { errorResponse, readJson, requireSession } from "@/lib/api";
import { createUsuario, listUsuarios } from "@/services/usuarios";

/**
 * GET /api/usuarios (RF-U4, solo admin)
 * POST /api/usuarios (RF-U4, solo admin)
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const actor = await requireSession();
    const params = request.nextUrl.searchParams;

    const result = await listUsuarios(
      {
        q: params.get("q") ?? undefined,
        activo: params.get("activo") ?? undefined,
        page: params.get("page") ?? undefined,
        pageSize: params.get("pageSize") ?? undefined,
      },
      actor
    );

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const actor = await requireSession();
    const body = await readJson(request);
    const user = await createUsuario(body, actor);
    return NextResponse.json(user, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
