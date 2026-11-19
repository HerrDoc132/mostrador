import { NextResponse, type NextRequest } from "next/server";
import { errorResponse, readJson, requireSession } from "@/lib/api";
import { createProducto, listProductos } from "@/services/productos";

/**
 * GET /api/productos (RF-P1)
 * POST /api/productos (RF-P2, solo admin)
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const actor = await requireSession();
    const params = request.nextUrl.searchParams;

    const result = await listProductos(
      {
        q: params.get("q") ?? undefined,
        categoriaId: params.get("categoriaId") ?? undefined,
        bajoMinimo: params.get("bajoMinimo") ?? undefined,
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

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const actor = await requireSession();
    const body = await readJson(request);
    const producto = await createProducto(body, actor);
    return NextResponse.json(producto, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
