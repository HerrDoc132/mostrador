import { NextResponse } from "next/server";
import { errorResponse, readJson, requireSession } from "@/lib/api";
import { updateUsuario } from "@/services/usuarios";

/**
 * PATCH /api/usuarios/{id} (RF-U4, solo admin)
 */
export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const actor = await requireSession();
    const { id } = await context.params;
    const body = await readJson(request);
    const user = await updateUsuario(Number(id), body, actor);
    return NextResponse.json(user, { status: 200 });
  } catch (error) {
    return errorResponse(error);
  }
}
