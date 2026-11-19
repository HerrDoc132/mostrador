import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { ApiError } from "@/lib/errors";
import { getCurrentUser, type PublicUser } from "@/services/auth";

/**
 * Traduce errores de servicios al formato estándar de la API.
 * Fuente: docs/06-api-rest/specs-api-rest.md
 */
export function errorResponse(error: unknown): NextResponse {
  if (error instanceof ApiError) {
    return NextResponse.json(
      {
        error: {
          code: error.code,
          message: error.message,
          ...(error.details ? { details: error.details } : {}),
        },
      },
      { status: error.status }
    );
  }

  console.error("[api] Error inesperado:", error);
  return NextResponse.json(
    {
      error: {
        code: "ERROR_INTERNO",
        message: "Ocurrió un error inesperado.",
      },
    },
    { status: 500 }
  );
}

/**
 * Lee el body JSON y traduce un cuerpo inválido al error estándar.
 */
export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new ApiError(400, "JSON_INVALIDO", "El cuerpo no es JSON válido.");
  }
}

/**
 * Adaptador para Route Handlers / Server Components:
 * lee la cookie, valida la sesión contra la base y devuelve el usuario actual.
 */
export async function requireSession(): Promise<PublicUser> {
  const session = await getSession();
  if (!session) {
    throw new ApiError(401, "NO_AUTENTICADO", "Tenés que iniciar sesión.");
  }
  return getCurrentUser(session);
}
