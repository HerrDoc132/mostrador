import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * TP5-50: `POST /api/auth/logout` debe exigir sesión activa.
 * El middleware es solo la primera barrera; el handler se prueba aislado,
 * sin levantar servidor HTTP (ver skill TDD).
 * Fuente: docs/06-api-rest/specs-api-rest.md:8,43,70.
 */

const { requireSessionMock, clearSessionCookieMock } = vi.hoisted(() => ({
  requireSessionMock: vi.fn(),
  clearSessionCookieMock: vi.fn(),
}));

vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  requireSession: (...args: unknown[]) => requireSessionMock(...args),
}));

vi.mock("@/lib/auth", () => ({
  clearSessionCookie: (...args: unknown[]) => clearSessionCookieMock(...args),
}));

import { POST } from "@/app/api/auth/logout/route";
import { ApiError } from "@/lib/errors";

const actor = {
  id: 1,
  nombre: "Laura Méndez",
  email: "admin@comercio.test",
  rol: "admin" as const,
};

beforeEach(() => {
  vi.clearAllMocks();
  requireSessionMock.mockResolvedValue(actor);
  clearSessionCookieMock.mockResolvedValue(undefined);
});

describe("POST /api/auth/logout (TP5-50)", () => {
  it("sin sesión responde 401 NO_AUTENTICADO y NO expira la cookie", async () => {
    requireSessionMock.mockRejectedValue(
      new ApiError(401, "NO_AUTENTICADO", "Tenés que iniciar sesión.")
    );

    const response = await POST();

    expect(requireSessionMock).toHaveBeenCalledTimes(1);
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "NO_AUTENTICADO",
        message: "Tenés que iniciar sesión.",
      },
    });
    expect(clearSessionCookieMock).not.toHaveBeenCalled();
  });

  it("con una cookie inválida o vencida responde 401", async () => {
    requireSessionMock.mockRejectedValue(
      new ApiError(401, "NO_AUTENTICADO", "Tenés que iniciar sesión.")
    );

    const response = await POST();

    expect(response.status).toBe(401);
    expect(clearSessionCookieMock).not.toHaveBeenCalled();
  });

  it("con sesión válida responde 204 y expira la cookie", async () => {
    const response = await POST();

    expect(requireSessionMock).toHaveBeenCalledTimes(1);
    expect(clearSessionCookieMock).toHaveBeenCalledTimes(1);
    expect(response.status).toBe(204);
    await expect(response.text()).resolves.toBe("");
  });

  it("traduce un error inesperado al formato estándar", async () => {
    clearSessionCookieMock.mockRejectedValue(new Error("falló el cookie store"));

    const response = await POST();

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "ERROR_INTERNO",
        message: "Ocurrió un error inesperado.",
      },
    });
  });
});
