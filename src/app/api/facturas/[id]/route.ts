import { NextResponse } from "next/server";
import { errorResponse, requireSession } from "@/lib/api";
import { getFactura } from "@/services/facturas";

/**
 * GET /api/facturas/{id} (RF-V7)
 * Comprobante completo con ítems y datos de anulación si corresponde.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const actor = await requireSession();
    const { id } = await params;
    const factura = await getFactura(Number(id), actor);
    return NextResponse.json(factura, { status: 200 });
  } catch (error) {
    return errorResponse(error);
  }
}
