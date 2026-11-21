import { NextResponse, type NextRequest } from "next/server";
import { errorResponse, requireSession } from "@/lib/api";
import { getCuentaCliente } from "@/services/clientes";

/**
 * GET /api/clientes/{id}/cuenta (RF-C4)
 * Adaptador fino: sesión + parámetros de fecha; el saldo lo calcula el servicio.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const actor = await requireSession();
    const { id } = await params;
    const query = {
      desde: request.nextUrl.searchParams.get("desde") ?? undefined,
      hasta: request.nextUrl.searchParams.get("hasta") ?? undefined,
    };

    const cuenta = await getCuentaCliente(Number(id), query, actor);
    return NextResponse.json(cuenta, { status: 200 });
  } catch (error) {
    return errorResponse(error);
  }
}
