import { NextResponse } from "next/server";
import { errorResponse, readJson, requireSession } from "@/lib/api";
import { getProducto, updateProducto } from "@/services/productos";

/**
 * GET /api/productos/{id} (RF-P1)
 * PATCH /api/productos/{id} (RF-P2, RF-P3, solo admin)
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const actor = await requireSession();
    const { id } = await context.params;
    const producto = await getProducto(Number(id), actor);
    return NextResponse.json(producto, { status: 200 });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const actor = await requireSession();
    const { id } = await context.params;
    const body = await readJson(request);
    const producto = await updateProducto(Number(id), body, actor);
    return NextResponse.json(producto, { status: 200 });
  } catch (error) {
    return errorResponse(error);
  }
}
