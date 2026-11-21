import { NextResponse } from "next/server";
import { errorResponse, readJson, requireSession } from "@/lib/api";
import { anularFactura } from "@/services/facturas";

/**
 * POST /api/facturas/{id}/anulacion (RF-V9)
 * Exclusivo de administrador. Motivo obligatorio.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const actor = await requireSession();
    const { id } = await params;
    const body = await readJson(request);

    const resultado = await anularFactura(Number(id), body, actor);
    return NextResponse.json(resultado, { status: 200 });
  } catch (error) {
    return errorResponse(error);
  }
}
