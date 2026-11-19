import { NextResponse, type NextRequest } from "next/server";
import { errorResponse, requireSession } from "@/lib/api";
import { listMovimientosStock } from "@/services/stock";

/**
 * GET /api/movimientos-stock (RF-P6)
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const actor = await requireSession();
    const params = request.nextUrl.searchParams;

    const result = await listMovimientosStock(
      {
        productoId: params.get("productoId") ?? undefined,
        tipo: params.get("tipo") ?? undefined,
        desde: params.get("desde") ?? undefined,
        hasta: params.get("hasta") ?? undefined,
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
