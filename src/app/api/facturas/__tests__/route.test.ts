import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

/**
 * Regresión TP5-38: el commit de TP5-32 reemplazó el handler POST de
 * /api/facturas por GET, por lo que la pantalla de nueva venta recibía un 405
 * sin cuerpo y mostraba "Ocurrió un error inesperado.".
 * Se prueba el adaptador sin levantar servidor HTTP (ver skill TDD).
 */

const { requireSessionMock, readJsonMock, createFacturaMock, listFacturasMock } = vi.hoisted(
  () => ({
    requireSessionMock: vi.fn(),
    readJsonMock: vi.fn(),
    createFacturaMock: vi.fn(),
    listFacturasMock: vi.fn(),
  })
);

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...actual,
    requireSession: (...args: unknown[]) => requireSessionMock(...args),
    readJson: (...args: unknown[]) => readJsonMock(...args),
  };
});

vi.mock("@/services/facturas", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/facturas")>();
  return {
    ...actual,
    createFactura: (...args: unknown[]) => createFacturaMock(...args),
    listFacturas: (...args: unknown[]) => listFacturasMock(...args),
  };
});

import { GET, POST } from "@/app/api/facturas/route";
import { ApiError } from "@/lib/errors";

const actor = {
  id: 1,
  nombre: "Laura Méndez",
  email: "admin@comercio.test",
  rol: "admin" as const,
};

const body = {
  clienteId: null,
  items: [{ productoId: 1, cantidad: 2 }],
  pago: { forma: "contado" },
};

const factura = { id: 10, numeroFormateado: "0001-00000010", total: 250000 };

beforeEach(() => {
  vi.clearAllMocks();
  requireSessionMock.mockResolvedValue(actor);
  readJsonMock.mockResolvedValue(body);
  createFacturaMock.mockResolvedValue(factura);
});

describe("POST /api/facturas (RF-V1 a RF-V6)", () => {
  it("está exportado junto con GET", () => {
    expect(typeof POST).toBe("function");
    expect(typeof GET).toBe("function");
  });

  it("envía la sesión y el body al servicio y responde 201 con la factura", async () => {
    const request = new Request("http://localhost/api/facturas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const response = await POST(request);

    expect(requireSessionMock).toHaveBeenCalledTimes(1);
    expect(readJsonMock).toHaveBeenCalledWith(request);
    expect(createFacturaMock).toHaveBeenCalledWith(body, actor);
    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual(factura);
  });

  it("traduce los errores de negocio al formato estándar", async () => {
    createFacturaMock.mockRejectedValue(
      new ApiError(409, "STOCK_INSUFICIENTE", "Falta existencia.", [
        { productoId: 1, solicitado: 2, disponible: 1 },
      ])
    );

    const response = await POST(
      new Request("http://localhost/api/facturas", { method: "POST", body: "{}" })
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "STOCK_INSUFICIENTE",
        message: "Falta existencia.",
        details: [{ productoId: 1, solicitado: 2, disponible: 1 }],
      },
    });
  });
});

describe("GET /api/facturas (RF-V8)", () => {
  it("sigue listando facturas con los filtros de query", async () => {
    listFacturasMock.mockResolvedValue({ data: [], total: 0 });

    const response = await GET(
      new NextRequest("http://localhost/api/facturas?q=martillo&pageSize=5")
    );

    expect(listFacturasMock).toHaveBeenCalledWith(
      expect.objectContaining({ q: "martillo", pageSize: "5" }),
      actor
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ data: [], total: 0 });
  });
});
