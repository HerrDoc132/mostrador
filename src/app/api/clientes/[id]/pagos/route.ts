import { NextResponse } from "next/server";
import { errorResponse, readJson, requireSession } from "@/lib/api";
import { registrarPago } from "@/services/pagos";

/**
 * POST /api/clientes/{id}/pagos (RF-C5)
 * El servicio abre la transacción: pago + recibo + movimiento de crédito.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const actor = await requireSession();
    const { id } = await params;
    const body = await readJson(request);
    const pago = await registrarPago(Number(id), body, actor);
    return NextResponse.json(pago, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
