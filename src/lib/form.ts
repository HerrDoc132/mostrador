/**
 * Utilidades de formularios para Client Components.
 * No contienen reglas de negocio: solo traducen la respuesta de la API a
 * mensajes por campo y clases de estilo.
 */

/**
 * Clases de un input/select. Con error usa contorno rojo; sin error, el borde
 * gris habitual.
 */
export function fieldClasses(hasError = false): string {
  const base =
    "w-full rounded-lg border bg-white px-3 py-2 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:ring-2";

  return hasError
    ? `${base} border-red-500 focus:border-red-500 focus:ring-red-200`
    : `${base} border-slate-300 focus:border-slate-500 focus:ring-slate-200`;
}

export interface FormErrors {
  message: string;
  fields: Record<string, string>;
}

interface ApiErrorBody {
  error?: {
    code?: string;
    message?: string;
    details?: Array<{ campo?: string; mensaje?: string }>;
  };
}

/** Códigos de error de la API que corresponden a un campo puntual. */
const CODE_TO_FIELDS: Record<string, string[]> = {
  CREDENCIALES_INVALIDAS: ["email", "password"],
  EMAIL_DUPLICADO: ["email"],
  CONTRASENA_ACTUAL_INCORRECTA: ["actual"],
};

/**
 * Convierte el cuerpo de error estándar de la API en:
 * - `message`: mensaje general para el banner.
 * - `fields`: mensajes indexados por nombre de campo (para el contorno rojo).
 */
export function parseApiError(data: unknown): FormErrors {
  const body = (data ?? {}) as ApiErrorBody;
  const message = body.error?.message ?? "Ocurrió un error inesperado.";
  const fields: Record<string, string> = {};

  for (const detail of body.error?.details ?? []) {
    if (detail?.campo) {
      fields[detail.campo] = detail.mensaje ?? "Valor inválido.";
    }
  }

  if (Object.keys(fields).length === 0) {
    const code = body.error?.code;
    const targets = code ? CODE_TO_FIELDS[code] : undefined;
    for (const field of targets ?? []) {
      fields[field] = message;
    }
  }

  return { message, fields };
}
