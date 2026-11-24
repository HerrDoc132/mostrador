import { NextResponse, type NextRequest } from "next/server";
import { errorResponse, readJson, requireSession } from "@/lib/api";
import { createFactura, listFacturas } from "@/services/facturas";

/**
 * POST /api/facturas (RF-V1 a RF-V6)
 * Adaptador fino: el servicio abre la transacción de 9 pasos (stock,
 * numeración, factura, ítems, movimientos y débito en cuenta corriente).
 */
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const actor = await requireSession();
    const body = await readJson(request);
    const factura = await createFactura(body, actor);
    return NextResponse.json(factura, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}

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
