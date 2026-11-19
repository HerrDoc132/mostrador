import { NextResponse, type NextRequest } from "next/server";
import { errorResponse, readJson, requireSession } from "@/lib/api";
import {
  listMovimientosPorProducto,
  registrarMovimientoManual,
} from "@/services/stock";

/**
 * GET /api/productos/{id}/movimientos (RF-P6)
 * POST /api/productos/{id}/movimientos (RF-P4, RF-P5, solo admin)
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const actor = await requireSession();
    const { id } = await context.params;
    const params = request.nextUrl.searchParams;

    const result = await listMovimientosPorProducto(
      Number(id),
      {
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

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const actor = await requireSession();
    const { id } = await context.params;
    const body = await readJson(request);
    const movimiento = await registrarMovimientoManual(Number(id), body, actor);
    return NextResponse.json(movimiento, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
