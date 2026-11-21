import { beforeEach, describe, expect, it } from "vitest";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import type { Database } from "@/db";
import { categorias, facturas, productos, usuarios } from "@/db/schema";
import { ApiError } from "@/lib/errors";
import { toPublicUser, type PublicUser, type UserRow } from "@/services/auth";
import { createCliente } from "@/services/clientes";
import { createFactura, getFactura } from "@/services/facturas";
import { createTestDb } from "@/test/db";

let db: Database;
let admin: PublicUser;
let vendedor: PublicUser;
let productoId: number;
let clienteId: number;

async function seedUser(overrides: Partial<typeof usuarios.$inferInsert>): Promise<UserRow> {
  const passwordHash = await bcrypt.hash("secreto123", 4);
  const [user] = await db
    .insert(usuarios)
    .values({
      email: "user@test.com",
      nombre: "Usuario",
      passwordHash,
      rol: "vendedor",
      activo: true,
      ...overrides,
    })
    .returning();
  return user;
}

async function expectApiError(promise: Promise<unknown>, status: number, code: string) {
  try {
    await promise;
    throw new Error(`Se esperaba ${status} ${code}.`);
  } catch (error) {
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(status);
    expect((error as ApiError).code).toBe(code);
    return error as ApiError;
  }
}

beforeEach(async () => {
  db = await createTestDb();
  admin = toPublicUser(
    await seedUser({ email: "admin@test.com", nombre: "Laura Méndez", rol: "admin" })
  );
  vendedor = toPublicUser(
    await seedUser({ email: "vend@test.com", nombre: "Pablo Ruiz", rol: "vendedor" })
  );

  const [categoria] = await db.insert(categorias).values({ nombre: "Herramientas" }).returning();
  const [producto] = await db
    .insert(productos)
    .values({
      codigo: "EL-001",
      descripcion: "Cinta aisladora 20 m",
      categoriaId: categoria.id,
      precio: 190000,
      existencia: 20,
      stockMinimo: 1,
      activo: true,
    })
    .returning();
  productoId = producto.id;

  const cliente = await createCliente(
    {
      tipoDoc: "DNI",
      nroDoc: "28456123",
      nombre: "Mariana López",
      domicilio: "Las Heras 455",
      cuentaCorriente: true,
      limiteCredito: 40000000,
    },
    vendedor,
    db
  );
  clienteId = cliente.id;
});

describe("getFactura · RF-V7", () => {
  it("devuelve el comprobante completo con ítems, cliente y vendedor", async () => {
    const emitida = await createFactura(
      {
        clienteId,
        items: [{ productoId, cantidad: 2 }],
        pago: { forma: "cuenta_corriente" },
      },
      vendedor,
      db
    );

    const comprobante = await getFactura(emitida.id, admin, db);

    expect(comprobante).toMatchObject({
      id: emitida.id,
      numeroFormateado: "0001-00000001",
      estado: "emitida",
      total: 380000,
      cliente: {
        id: clienteId,
        nombre: "Mariana López",
        tipoDoc: "DNI",
        nroDoc: "28456123",
        domicilio: "Las Heras 455",
      },
      vendedor: { id: vendedor.id, nombre: "Pablo Ruiz" },
      pago: { forma: "cuenta_corriente" },
      saldoCliente: 380000,
      anulacion: null,
    });
    expect(comprobante.items).toEqual([
      {
        productoId,
        codigo: "EL-001",
        descripcion: "Cinta aisladora 20 m",
        cantidad: 2,
        precioUnitario: 190000,
        subtotal: 380000,
      },
    ]);
    expect(comprobante.comercio).toMatchObject({ nombre: expect.any(String) });
  });

  it("informa la anulación con fecha, usuario y motivo", async () => {
    const emitida = await createFactura(
      { items: [{ productoId, cantidad: 1 }], pago: { forma: "contado" } },
      vendedor,
      db
    );

    await db
      .update(facturas)
      .set({
        estado: "anulada",
        motivoAnulacion: "Error de carga",
        usuarioAnulacionId: admin.id,
        fechaAnulacion: "2026-11-21T18:00:00Z",
      })
      .where(eq(facturas.id, emitida.id));

    const comprobante = await getFactura(emitida.id, vendedor, db);

    expect(comprobante.estado).toBe("anulada");
    expect(comprobante.anulacion).toEqual({
      fecha: "2026-11-21T18:00:00Z",
      usuario: "Laura Méndez",
      motivo: "Error de carga",
    });
  });

  it("devuelve 404 si la factura no existe", async () => {
    await expectApiError(getFactura(999999, admin, db), 404, "NO_ENCONTRADO");
  });

  it("devuelve 422 VALIDACION para un id inválido", async () => {
    await expectApiError(getFactura(0, admin, db), 422, "VALIDACION");
  });

  it("no expone saldo de cliente en facturas de contado", async () => {
    const emitida = await createFactura(
      {
        clienteId,
        items: [{ productoId, cantidad: 1 }],
        pago: { forma: "contado", montoRecibido: 190000 },
      },
      admin,
      db
    );

    const comprobante = await getFactura(emitida.id, admin, db);

    expect(comprobante.saldoCliente).toBeUndefined();
    expect(comprobante.pago).toEqual({ forma: "contado", montoRecibido: 190000, vuelto: 0 });
  });
});
