import { ApiError, type ErrorDetail } from "@/lib/errors";

/**
 * TP5-47: contrato de las Server Actions. Espejo de `errorResponse` de la REST,
 * pero devolviendo objetos planos serializables en vez de NextResponse.
 * Fuente: docs/00-general/01-arquitectura-y-pautas.md.
 */

export interface ActionError {
  status: number;
  code: string;
  message: string;
  details?: ErrorDetail[];
}

export type ActionResult<T> =
  | { ok: true; data: T | null }
  | { ok: false; error: ActionError };

export async function runAction<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    const data = await fn();
    return { ok: true, data: data ?? null };
  } catch (error) {
    if (error instanceof ApiError) {
      return {
        ok: false,
        error: {
          status: error.status,
          code: error.code,
          message: error.message,
          ...(error.details ? { details: error.details } : {}),
        },
      };
    }

    console.error("[action] Error inesperado:", error);
    return {
      ok: false,
      error: {
        status: 500,
        code: "ERROR_INTERNO",
        message: "Ocurrió un error inesperado.",
      },
    };
  }
}
