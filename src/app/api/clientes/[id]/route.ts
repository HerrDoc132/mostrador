import { NextResponse } from "next/server";
import { errorResponse, readJson, requireSession } from "@/lib/api";
import { getCliente, updateCliente } from "@/services/clientes";

/**
 * GET /api/clientes/{id} (RF-C3)
 * PATCH /api/clientes/{id} (RF-C2, RF-C7)
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const actor = await requireSession();
    const { id } = await params;
    const cliente = await getCliente(Number(id), actor);
    return NextResponse.json(cliente, { status: 200 });
  } catch (error) {
    return errorResponse(error);
  }
}

/** PATCH /api/clientes/{id} (RF-C2, RF-C7) */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const actor = await requireSession();
    const { id } = await params;
    const body = await readJson(request);
    const cliente = await updateCliente(Number(id), body, actor);
    return NextResponse.json(cliente, { status: 200 });
  } catch (error) {
    return errorResponse(error);
  }
}
