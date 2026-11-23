import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Casos HTTP de los PR #10, #11, #16, #17 y #18 que pueden verificarse sin
 * levantar un servidor: el adaptador traduce errores, parsea el body y exige
 * sesión. La capa de servicios se prueba en los otros archivos.
 */

const { getSessionMock, getCurrentUserMock } = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
  getCurrentUserMock: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ getSession: () => getSessionMock() }));
vi.mock("@/services/auth", () => ({
  getCurrentUser: (...args: unknown[]) => getCurrentUserMock(...args),
}));

import { errorResponse, readJson, requireSession } from "@/lib/api";
import { ApiError } from "@/lib/errors";

const sesion = { userId: 1, email: "admin@comercio.test", rol: "admin" as const };
const usuario = {
  id: 1,
  nombre: "Laura Méndez",
  email: "admin@comercio.test",
  rol: "admin" as const,
};

beforeEach(() => {
  getSessionMock.mockReset();
  getCurrentUserMock.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("readJson · PR #10 y #18 (cuerpo no JSON)", () => {
  it("devuelve el objeto parseado cuando el body es JSON válido", async () => {
    const request = new Request("http://localhost/api/facturas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: '{"items":[{"productoId":1,"cantidad":2}],"pago":{"forma":"contado"}}',
    });

    await expect(readJson(request)).resolves.toMatchObject({
      items: [{ productoId: 1, cantidad: 2 }],
      pago: { forma: "contado" },
    });
  });

  it("lanza 400 JSON_INVALIDO para texto plano y para un body vacío", async () => {
    for (const body of ["hola", ""]) {
      const request = new Request("http://localhost/api/facturas", {
        method: "POST",
        body,
      });

      try {
        await readJson(request);
        throw new Error("Se esperaba 400 JSON_INVALIDO.");
      } catch (error) {
        expect(error).toBeInstanceOf(ApiError);
        expect((error as ApiError).status).toBe(400);
        expect((error as ApiError).code).toBe("JSON_INVALIDO");
      }
    }
  });
});

describe("errorResponse · catálogo de errores de los PR", () => {
  const casos = [
    { status: 400, code: "JSON_INVALIDO", message: "El cuerpo no es JSON válido." },
    { status: 401, code: "NO_AUTENTICADO", message: "Tenés que iniciar sesión." },
    { status: 403, code: "SIN_PERMISO", message: "Sin permiso." },
    { status: 404, code: "NO_ENCONTRADO", message: "La factura no existe." },
    { status: 409, code: "FACTURA_ANULADA", message: "La factura ya está anulada." },
    { status: 422, code: "VALIDACION", message: "Hay campos con errores." },
  ];

  for (const { status, code, message } of casos) {
    it(`traduce ${status} ${code} al formato { error }`, async () => {
      const response = errorResponse(new ApiError(status, code, message));

      expect(response.status).toBe(status);
      await expect(response.json()).resolves.toEqual({
        error: { code, message },
      });
    });
  }

  it("incluye los details cuando el error los tiene", async () => {
    const response = errorResponse(
      new ApiError(409, "STOCK_INSUFICIENTE", "Sin stock.", [
        { productoId: 7, solicitado: 6, disponible: 5 },
      ])
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "STOCK_INSUFICIENTE",
        message: "Sin stock.",
        details: [{ productoId: 7, solicitado: 6, disponible: 5 }],
      },
    });
  });

  it("oculta errores inesperados detrás de 500 ERROR_INTERNO", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = errorResponse(new Error("detalle interno sensible"));

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: { code: "ERROR_INTERNO", message: "Ocurrió un error inesperado." },
    });
    expect(consoleSpy).toHaveBeenCalled();
  });
});

describe("requireSession · casos sin sesión de los PR", () => {
  it("lanza 401 NO_AUTENTICADO cuando no hay cookie válida", async () => {
    getSessionMock.mockResolvedValue(null);

    try {
      await requireSession();
      throw new Error("Se esperaba 401 NO_AUTENTICADO.");
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError);
      expect((error as ApiError).status).toBe(401);
      expect((error as ApiError).code).toBe("NO_AUTENTICADO");
    }
    expect(getCurrentUserMock).not.toHaveBeenCalled();
  });

  it("devuelve el usuario actual cuando la sesión es válida", async () => {
    getSessionMock.mockResolvedValue(sesion);
    getCurrentUserMock.mockResolvedValue(usuario);

    await expect(requireSession()).resolves.toEqual(usuario);
    expect(getCurrentUserMock).toHaveBeenCalledWith(sesion);
  });

  it("propaga el 401 cuando el usuario de la sesión fue desactivado", async () => {
    getSessionMock.mockResolvedValue(sesion);
    getCurrentUserMock.mockRejectedValue(
      new ApiError(401, "NO_AUTENTICADO", "La sesión no es válida o el usuario está inactivo.")
    );

    await expect(requireSession()).rejects.toMatchObject({
      status: 401,
      code: "NO_AUTENTICADO",
    });
  });
});
