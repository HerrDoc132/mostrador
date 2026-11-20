import { NextResponse, type NextRequest } from "next/server";
import { errorResponse, requireSession } from "@/lib/api";
import { listClientes } from "@/services/clientes";

/**
 * GET /api/clientes (RF-C1, RF-C6)
 * Adaptador fino: lee la query, delega en el servicio y responde el listado.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const actor = await requireSession();
    const params = request.nextUrl.searchParams;

    const result = await listClientes(
      {
        q: params.get("q") ?? undefined,
        conDeuda: params.get("conDeuda") ?? undefined,
        orden: params.get("orden") ?? undefined,
        activo: params.get("activo") ?? undefined,
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
