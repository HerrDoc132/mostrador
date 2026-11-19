import type { z } from "zod";
import { ApiError } from "@/lib/errors";

/**
 * Convierte los issues de Zod al formato estándar de la API.
 */
export function validationError(error: z.ZodError): ApiError {
  return new ApiError(
    422,
    "VALIDACION",
    "Hay campos con errores.",
    error.issues.map((issue) => ({
      campo: issue.path.join(".") || "body",
      mensaje: issue.message,
    }))
  );
}
