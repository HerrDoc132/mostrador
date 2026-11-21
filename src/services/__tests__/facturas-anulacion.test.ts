import { beforeEach, describe, expect, it } from "vitest";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import type { Database } from "@/db";
import {
  categorias,
  clientes,
  facturaItems,
  facturas,
  movimientosCuenta,
  movimientosStock,
  productos,
  usuarios,
} from "@/db/schema";
import { ApiError } from "@/lib/errors";
import { toPublicUser, type PublicUser, type UserRow } from "@/services/auth";
import { createCliente, saldoSql } from "@/services/clientes";
import { anularFactura, createFactura, getFactura } from "@/services/facturas";
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
  }
}

async function existencia(): Promise<number> {
  const [row] = await db
    .select({ existencia: productos.existencia })
    .from(productos)
    .where(eq(productos.id, productoId));
  return row.existencia;
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
      existencia: 10,
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
      cuentaCorriente: true,
      limiteCredito: 40000000,
    },
    vendedor,
    db
  );
  clienteId = cliente.id;
});

describe("anularFactura · RF-V9", () => {
  it("reingresa el stock con movimiento tipo anulacion y marca la factura como anulada", async () => {
    const emitida = await createFactura(
      {
        clienteId,
        items: [{ productoId, cantidad: 3 }],
        pago: { forma: "contado", montoRecibido: 570000 },
      },
      vendedor,
      db
    );
    expect(await existencia()).toBe(7);

    const anulada = await anularFactura(
      emitida.id,
      { motivo: "Error de carga" },
      admin,
      db
    );

    expect(anulada).toMatchObject({
      id: emitida.id,
      estado: "anulada",
      motivoAnulacion: "Error de carga",
      usuarioAnulacionId: admin.id,
      itemCount: 1,
      stockReingresado: 3,
    });
    expect(anulada.fechaAnulacion).toBeTruthy();

    expect(await existencia()).toBe(10);
    const movimientos = await db
      .select()
      .from(movimientosStock)
      .where(eq(movimientosStock.facturaId, emitida.id));
    expect(movimientos).toHaveLength(2);
    const reingreso = movimientos.find((movimiento) => movimiento.tipo === "anulacion");
    expect(reingreso).toMatchObject({
      productoId,
      cantidad: 3,
      existenciaResultante: 10,
      motivo: "Error de carga",
      usuarioId: admin.id,
    });

    const [fila] = await db.select().from(facturas).where(eq(facturas.id, emitida.id));
    expect(fila.estado).toBe("anulada");
    expect(fila.motivoAnulacion).toBe("Error de carga");
    expect(fila.usuarioAnulacionId).toBe(admin.id);
  });

  it("registra un crédito por el total y deja el saldo en cero cuando fue cuenta corriente", async () => {
    const emitida = await createFactura(
      {
        clienteId,
        items: [{ productoId, cantidad: 2 }],
        pago: { forma: "cuenta_corriente" },
      },
      vendedor,
      db
    );

    const [antes] = await db
      .select({ saldo: saldoSql() })
      .from(clientes)
      .where(eq(clientes.id, clienteId));
    expect(Number(antes.saldo)).toBe(380000);

    await anularFactura(emitida.id, { motivo: "Factura duplicada" }, admin, db);

    const [despues] = await db
      .select({ saldo: saldoSql() })
      .from(clientes)
      .where(eq(clientes.id, clienteId));
    expect(Number(despues.saldo)).toBe(0);

    const movimientos = await db
      .select()
      .from(movimientosCuenta)
      .where(eq(movimientosCuenta.facturaId, emitida.id));
    expect(movimientos).toHaveLength(2);
    const credito = movimientos.find((movimiento) => movimiento.tipo === "credito");
    expect(credito).toMatchObject({
      clienteId,
      importe: 380000,
      descripcion: expect.stringContaining("Anulación"),
    });
  });

  it("no genera movimiento de cuenta en ventas de contado", async () => {
    const emitida = await createFactura(
      { items: [{ productoId, cantidad: 1 }], pago: { forma: "contado" } },
      vendedor,
      db
    );

    await anularFactura(emitida.id, { motivo: "Prueba" }, admin, db);

    const movimientos = await db
      .select()
      .from(movimientosCuenta)
      .where(eq(movimientosCuenta.facturaId, emitida.id));
    expect(movimientos).toHaveLength(0);
  });

  it("rechaza a un vendedor con 403 SIN_PERMISO", async () => {
    const emitida = await createFactura(
      { items: [{ productoId, cantidad: 1 }], pago: { forma: "contado" } },
      vendedor,
      db
    );

    await expectApiError(
      anularFactura(emitida.id, { motivo: "Prueba" }, vendedor, db),
      403,
      "SIN_PERMISO"
    );

    const [fila] = await db.select().from(facturas).where(eq(facturas.id, emitida.id));
    expect(fila.estado).toBe("emitida");
  });

  it("rechaza anular dos veces con 409 FACTURA_ANULADA", async () => {
    const emitida = await createFactura(
      { items: [{ productoId, cantidad: 1 }], pago: { forma: "contado" } },
      vendedor,
      db
    );
    await anularFactura(emitida.id, { motivo: "Primera" }, admin, db);

    await expectApiError(
      anularFactura(emitida.id, { motivo: "Segunda" }, admin, db),
      409,
      "FACTURA_ANULADA"
    );
  });

  it("exige un motivo obligatorio con 422 VALIDACION", async () => {
    const emitida = await createFactura(
      { items: [{ productoId, cantidad: 1 }], pago: { forma: "contado" } },
      vendedor,
      db
    );

    await expectApiError(
      anularFactura(emitida.id, { motivo: "   " }, admin, db),
      422,
      "VALIDACION"
    );
  });

  it("devuelve 404 si la factura no existe y 422 para un id inválido", async () => {
    await expectApiError(
      anularFactura(999999, { motivo: "Prueba" }, admin, db),
      404,
      "NO_ENCONTRADO"
    );
    await expectApiError(
      anularFactura(0, { motivo: "Prueba" }, admin, db),
      422,
      "VALIDACION"
    );
  });

  it("el comprobante refleja la anulación real con motivo, usuario y fecha", async () => {
    const emitida = await createFactura(
      { items: [{ productoId, cantidad: 1 }], pago: { forma: "contado" } },
      vendedor,
      db
    );
    await anularFactura(emitida.id, { motivo: "Error del cliente" }, admin, db);

    const comprobante = await getFactura(emitida.id, vendedor, db);

    expect(comprobante.estado).toBe("anulada");
    expect(comprobante.anulacion).toMatchObject({
      motivo: "Error del cliente",
      usuario: "Laura Méndez",
    });
    expect(comprobante.anulacion?.fecha).toBeTruthy();
    expect((await db.select().from(facturaItems).where(eq(facturaItems.facturaId, emitida.id))))
      .toHaveLength(1);
  });
});
