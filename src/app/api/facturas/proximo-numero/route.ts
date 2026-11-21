import { NextResponse } from "next/server";
import { errorResponse, requireSession } from "@/lib/api";
import { getProximoNumero } from "@/services/facturas";

/**
 * GET /api/facturas/proximo-numero (RF-V1)
 * Informativo: el número definitivo se asigna dentro de la transacción.
 */
export async function GET(): Promise<NextResponse> {
  try {
    const actor = await requireSession();
    const numero = await getProximoNumero(actor);
    return NextResponse.json(numero, { status: 200 });
  } catch (error) {
    return errorResponse(error);
  }
}
