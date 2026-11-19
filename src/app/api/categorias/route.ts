import { NextResponse } from "next/server";
import { errorResponse, readJson, requireSession } from "@/lib/api";
import { createCategoria, listCategorias } from "@/services/categorias";

/**
 * GET /api/categorias (RF-P7)
 * POST /api/categorias (RF-P7, solo admin)
 */
export async function GET(): Promise<NextResponse> {
  try {
    const actor = await requireSession();
    const categorias = await listCategorias(actor);
    return NextResponse.json(categorias, { status: 200 });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const actor = await requireSession();
    const body = await readJson(request);
    const categoria = await createCategoria(body, actor);
    return NextResponse.json(categoria, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
