import { describe, expect, it } from "vitest";
import { aIsoUtc, aIsoUtcTexto } from "@/lib/fechas";

/**
 * TP5-45: la API expone ISO 8601 UTC; la BD guarda textos SQLite y el seed
 * escribe ISO. El helper es puro y debe ser idempotente.
 * Fuente: docs/06-api-rest/specs-api-rest.md:11.
 */

describe("aIsoUtc (TP5-45)", () => {
  it("convierte un texto SQLite UTC a ISO con Z conservando el instante", () => {
    expect(aIsoUtc("2026-10-29 18:24:00")).toBe("2026-10-29T18:24:00Z");
  });

  it("es idempotente con ISO que ya termina en Z", () => {
    expect(aIsoUtc("2026-10-29T18:24:00Z")).toBe("2026-10-29T18:24:00Z");
  });

  it("canonicaliza los milisegundos cero del toISOString()", () => {
    expect(aIsoUtc("2026-10-29T18:24:00.000Z")).toBe("2026-10-29T18:24:00Z");
  });

  it("convierte una fecha con offset a UTC", () => {
    expect(aIsoUtc("2026-10-29T15:24:00-03:00")).toBe("2026-10-29T18:24:00Z");
  });

  it("devuelve null para valores ausentes o vacíos", () => {
    expect(aIsoUtc(null)).toBeNull();
    expect(aIsoUtc(undefined)).toBeNull();
    expect(aIsoUtc("  ")).toBeNull();
  });

  it("falla con un mensaje claro ante una fecha inválida", () => {
    expect(() => aIsoUtc("no-es-una-fecha")).toThrow(/Fecha inválida/);
  });

  it("garantiza string para los campos de fecha obligatorios", () => {
    expect(aIsoUtcTexto("2026-10-29 18:24:00")).toBe("2026-10-29T18:24:00Z");
    expect(() => aIsoUtcTexto("   ")).toThrow(/obligatoria/);
  });
});
