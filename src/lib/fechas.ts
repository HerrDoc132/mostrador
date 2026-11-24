/**
 * Normalización de fechas en la frontera de la API.
 * TP5-45: los servicios devuelven ISO 8601 UTC con sufijo `Z`.
 * Fuente: docs/06-api-rest/specs-api-rest.md:11.
 *
 * La BD guarda `datetime('now','utc')` como "AAAA-MM-DD HH:MM:SS" y el seed
 * escribe ISO. Este helper acepta ambos formatos y es idempotente.
 * No se usa para presentación: esa responsabilidad es de `src/lib/format.ts`.
 */

const CON_ZONA_HORARIA = /(?:[zZ]|[+-]\d{2}:?\d{2})$/;

export function aIsoUtc(valor: string | null | undefined): string | null {
  if (valor === null || valor === undefined || valor.trim() === "") return null;

  const texto = valor.trim();
  const candidato = CON_ZONA_HORARIA.test(texto) ? texto : `${texto.replace(" ", "T")}Z`;
  const fecha = new Date(candidato);
  if (Number.isNaN(fecha.getTime())) {
    throw new Error(`Fecha inválida expuesta por la API: ${valor}`);
  }

  // `toISOString()` siempre agrega milisegundos; la spec usa segundos.
  return fecha.toISOString().replace(/\.000Z$/, "Z");
}

/**
 * Variante para campos obligatorios: mantiene el tipo `string` en la forma
 * pública de la API en lugar de `string | null`.
 */
export function aIsoUtcTexto(valor: string): string {
  const normalizado = aIsoUtc(valor);
  if (normalizado === null) {
    throw new Error("Fecha obligatoria ausente en la API.");
  }
  return normalizado;
}
