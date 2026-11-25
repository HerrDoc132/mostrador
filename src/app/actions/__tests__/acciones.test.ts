import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * TP5-47: las acciones solo resuelven la sesión y delegan en el mismo servicio
 * que usan los Route Handlers. No duplican validación, permisos ni transacciones.
 */

const mocks = vi.hoisted(() => ({
  requireSession: vi.fn(),
  createCliente: vi.fn(),
  updateCliente: vi.fn(),
  createProducto: vi.fn(),
  updateProducto: vi.fn(),
  createCategoria: vi.fn(),
  updateCategoria: vi.fn(),
  createUsuario: vi.fn(),
  updateUsuario: vi.fn(),
  resetPassword: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  requireSession: (...args: unknown[]) => mocks.requireSession(...args),
}));

vi.mock("@/services/clientes", () => ({
  createCliente: (...args: unknown[]) => mocks.createCliente(...args),
  updateCliente: (...args: unknown[]) => mocks.updateCliente(...args),
}));
vi.mock("@/services/productos", () => ({
  createProducto: (...args: unknown[]) => mocks.createProducto(...args),
  updateProducto: (...args: unknown[]) => mocks.updateProducto(...args),
}));
vi.mock("@/services/categorias", () => ({
  createCategoria: (...args: unknown[]) => mocks.createCategoria(...args),
  updateCategoria: (...args: unknown[]) => mocks.updateCategoria(...args),
}));
vi.mock("@/services/usuarios", () => ({
  createUsuario: (...args: unknown[]) => mocks.createUsuario(...args),
  updateUsuario: (...args: unknown[]) => mocks.updateUsuario(...args),
  resetPassword: (...args: unknown[]) => mocks.resetPassword(...args),
}));

import {
  actualizarClienteAccion,
  crearClienteAccion,
} from "@/app/actions/clientes";
import {
  actualizarCategoriaAccion,
  crearCategoriaAccion,
} from "@/app/actions/categorias";
import {
  alternarActivoProductoAccion,
  crearProductoAccion,
} from "@/app/actions/productos";
import {
  crearUsuarioAccion,
  resetPasswordUsuarioAccion,
} from "@/app/actions/usuarios";
import { ApiError } from "@/lib/errors";

const actor = {
  id: 1,
  nombre: "Laura Méndez",
  email: "admin@comercio.test",
  rol: "admin" as const,
};
const input = { nombre: "Mariana López" };
const cliente = { id: 5, ...input };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireSession.mockResolvedValue(actor);
  mocks.createCliente.mockResolvedValue(cliente);
  mocks.updateCliente.mockResolvedValue(cliente);
  mocks.createProducto.mockResolvedValue({ id: 9 });
  mocks.updateProducto.mockResolvedValue({ id: 9 });
  mocks.createCategoria.mockResolvedValue({ id: 3 });
  mocks.updateCategoria.mockResolvedValue({ id: 3 });
  mocks.createUsuario.mockResolvedValue({ id: 7 });
  mocks.updateUsuario.mockResolvedValue({ id: 7 });
  mocks.resetPassword.mockResolvedValue({ passwordTemporal: "Temp1234!" });
});

describe("Server Actions de formularios (TP5-47)", () => {
  it("crea un cliente delegando en el servicio con la sesión actual", async () => {
    await expect(crearClienteAccion(input)).resolves.toEqual({ ok: true, data: cliente });
    expect(mocks.requireSession).toHaveBeenCalledTimes(1);
    expect(mocks.createCliente).toHaveBeenCalledWith(input, actor);
  });

  it("actualiza un cliente pasando el id antes que el input", async () => {
    await expect(actualizarClienteAccion(5, input)).resolves.toEqual({
      ok: true,
      data: cliente,
    });
    expect(mocks.updateCliente).toHaveBeenCalledWith(5, input, actor);
  });

  it("devuelve ok:false con el código y los details del servicio", async () => {
    mocks.createCliente.mockRejectedValue(
      new ApiError(409, "DOCUMENTO_DUPLICADO", "El documento ya está registrado.", [
        { campo: "nroDoc", mensaje: "Ya existe." },
      ])
    );

    await expect(crearClienteAccion(input)).resolves.toEqual({
      ok: false,
      error: {
        status: 409,
        code: "DOCUMENTO_DUPLICADO",
        message: "El documento ya está registrado.",
        details: [{ campo: "nroDoc", mensaje: "Ya existe." }],
      },
    });
  });

  it("no llama al servicio si no hay sesión", async () => {
    mocks.requireSession.mockRejectedValue(
      new ApiError(401, "NO_AUTENTICADO", "Tenés que iniciar sesión.")
    );

    const resultado = await crearClienteAccion(input);

    expect(resultado).toMatchObject({
      ok: false,
      error: { status: 401, code: "NO_AUTENTICADO" },
    });
    expect(mocks.createCliente).not.toHaveBeenCalled();
  });

  it("crea y desactiva productos sin lógica propia", async () => {
    await expect(crearProductoAccion(input)).resolves.toEqual({
      ok: true,
      data: { id: 9 },
    });
    expect(mocks.createProducto).toHaveBeenCalledWith(input, actor);

    await expect(alternarActivoProductoAccion(9, false)).resolves.toEqual({
      ok: true,
      data: { id: 9 },
    });
    expect(mocks.updateProducto).toHaveBeenCalledWith(9, { activo: false }, actor);
  });

  it("crea y renombra categorías delegando en el servicio", async () => {
    await crearCategoriaAccion({ nombre: "Herramientas" });
    expect(mocks.createCategoria).toHaveBeenCalledWith({ nombre: "Herramientas" }, actor);

    await actualizarCategoriaAccion(3, { nombre: "Ferretería" });
    expect(mocks.updateCategoria).toHaveBeenCalledWith(3, { nombre: "Ferretería" }, actor);
  });

  it("crea usuarios y devuelve la contraseña temporal del reset", async () => {
    await crearUsuarioAccion(input);
    expect(mocks.createUsuario).toHaveBeenCalledWith(input, actor);

    await expect(resetPasswordUsuarioAccion(7)).resolves.toEqual({
      ok: true,
      data: { passwordTemporal: "Temp1234!" },
    });
    expect(mocks.resetPassword).toHaveBeenCalledWith(7, actor);
  });
});
