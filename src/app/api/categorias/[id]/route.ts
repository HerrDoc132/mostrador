import { NextResponse } from "next/server";
import { errorResponse, readJson, requireSession } from "@/lib/api";
import { updateCategoria } from "@/services/categorias";

/**
 * PATCH /api/categorias/{id} (RF-P7, solo admin)
 */
export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const actor = await requireSession();
    const { id } = await context.params;
    const body = await readJson(request);
    const categoria = await updateCategoria(Number(id), body, actor);
    return NextResponse.json(categoria, { status: 200 });
  } catch (error) {
    return errorResponse(error);
  }
}
