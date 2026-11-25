import { describe, expect, it } from "vitest";
import { parseActionError, parseApiError } from "@/lib/form";
import type { ActionError } from "@/lib/action-result";

/**
 * TP5-47: el mapeo de errores por campo debe sobrevivir al envoltorio de
 * Server Actions, igual que con el cuerpo de la REST.
 */

describe("parseActionError (TP5-47)", () => {
  const error: ActionError = {
    status: 422,
    code: "VALIDACION",
    message: "Revisá los datos.",
    details: [{ campo: "email", mensaje: "El email no es válido." }],
  };

  it("mapea los details a mensajes por campo", () => {
    expect(parseActionError(error)).toEqual({
      message: "Revisá los datos.",
      fields: { email: "El email no es válido." },
    });
  });

  it("aplica el mismo mapa código→campo que parseApiError", () => {
    const duplicado: ActionError = {
      status: 409,
      code: "EMAIL_DUPLICADO",
      message: "Ese email ya está en uso.",
    };

    expect(parseActionError(duplicado)).toEqual(parseApiError({ error: duplicado }));
    expect(parseActionError(duplicado).fields).toEqual({ email: "Ese email ya está en uso." });
  });
});
