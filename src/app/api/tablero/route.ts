import { NextResponse } from "next/server";
import { errorResponse, requireSession } from "@/lib/api";
import { getTablero } from "@/services/tablero";

/**
 * GET /api/tablero (RF-T1, TP5-34).
 * Adaptador HTTP: solo obtiene la sesión, llama al servicio y traduce errores.
 */
export async function GET(): Promise<NextResponse> {
  try {
    const actor = await requireSession();
    const tablero = await getTablero(actor);
    return NextResponse.json(tablero, { status: 200 });
  } catch (error) {
    return errorResponse(error);
  }
}
