import { NextResponse } from "next/server";
import { errorResponse, requireSession } from "@/lib/api";
import { getPago } from "@/services/pagos";

/**
 * GET /api/pagos/{id} (RF-C5): recibo para impresión / reimpresión.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const actor = await requireSession();
    const { id } = await params;
    const pago = await getPago(Number(id), actor);
    return NextResponse.json(pago, { status: 200 });
  } catch (error) {
    return errorResponse(error);
  }
}
