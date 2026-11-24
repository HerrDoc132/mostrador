/**
 * Validación de variables de entorno sensibles.
 * TP5-49: los secretos se leen del entorno, nunca de un literal en el código.
 * Fuente: docs/07-entregables-y-calidad/specs-entregables-y-calidad.md:51
 */

const LONGITUD_MINIMA_SECRETO = 32;

/**
 * Valida y normaliza el secreto usado para firmar las cookies de sesión.
 * No lee `process.env`: es una función pura para poder testearla sin mocks.
 */
export function validarSecretoSesion(valor: string | undefined): string {
  const secreto = valor?.trim() ?? "";
  if (secreto.length < LONGITUD_MINIMA_SECRETO) {
    throw new Error(
      "SESSION_SECRET no está configurado: definí una variable de entorno con al menos 32 caracteres (por ejemplo, generala con `openssl rand -base64 32`)."
    );
  }
  return secreto;
}

/**
 * Punto único de lectura del secreto desde el entorno del proceso.
 */
export function secretoSesionDesdeEntorno(): string {
  return validarSecretoSesion(process.env.SESSION_SECRET);
}
