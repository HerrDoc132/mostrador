import { describe, expect, it, vi } from "vitest";
import { runAction } from "@/lib/action-result";
import { ApiError } from "@/lib/errors";

/**
 * TP5-47: las Server Actions devuelven un objeto serializable y nunca
 * lanzan errores hacia el componente.
 */

describe("runAction (TP5-47)", () => {
  it("devuelve { ok: true, data } con el valor del servicio", async () => {
    const datos = { id: 1, nombre: "Mariana López" };

    await expect(runAction(async () => datos)).resolves.toEqual({
      ok: true,
      data: datos,
    });
  });

  it("usa data: null cuando el servicio no devuelve valor", async () => {
    await expect(runAction(async () => undefined)).resolves.toEqual({
      ok: true,
      data: null,
    });
  });

  it("traduce ApiError al mismo catálogo que la REST", async () => {
    await expect(
      runAction(async () => {
        throw new ApiError(409, "DOCUMENTO_DUPLICADO", "El DNI ya está registrado.", [
          { campo: "nroDoc", mensaje: "Ya existe un cliente con ese documento." },
        ]);
      })
    ).resolves.toEqual({
      ok: false,
      error: {
        status: 409,
        code: "DOCUMENTO_DUPLICADO",
        message: "El DNI ya está registrado.",
        details: [{ campo: "nroDoc", mensaje: "Ya existe un cliente con ese documento." }],
      },
    });
  });

  it("traduce errores inesperados a 500 ERROR_INTERNO sin filtrarlos", async () => {
    const consola = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      await expect(
        runAction(async () => {
          throw new Error("falló la base");
        })
      ).resolves.toEqual({
        ok: false,
        error: {
          status: 500,
          code: "ERROR_INTERNO",
          message: "Ocurrió un error inesperado.",
        },
      });
      expect(consola).toHaveBeenCalledTimes(1);
    } finally {
      consola.mockRestore();
    }
  });
});
