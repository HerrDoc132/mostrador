import { NextResponse, type NextRequest } from "next/server";
import { errorResponse, requireSession } from "@/lib/api";
import { listFacturas } from "@/services/facturas";

/**
 * GET /api/facturas (RF-V8)
 * Listado paginado con filtros y totalEmitido calculado en servidor.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const actor = await requireSession();
    const params = request.nextUrl.searchParams;

    const result = await listFacturas(
      {
        q: params.get("q") ?? undefined,
        desde: params.get("desde") ?? undefined,
        hasta: params.get("hasta") ?? undefined,
        clienteId: params.get("clienteId") ?? undefined,
        vendedorId: params.get("vendedorId") ?? undefined,
        forma: params.get("forma") ?? undefined,
        estado: params.get("estado") ?? undefined,
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
