import { NextResponse } from "next/server";
import { errorResponse, readJson, requireSession } from "@/lib/api";
import { createFactura } from "@/services/facturas";

/**
 * POST /api/facturas (RF-V6)
 * El servicio abre la transacción de 9 pasos: stock, numeración, factura,
 * ítems, movimientos de stock y débito en cuenta corriente.
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
