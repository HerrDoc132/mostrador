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
import { createCliente } from "@/services/clientes";
import { createFactura, getProximoNumero } from "@/services/facturas";
import { createTestDb } from "@/test/db";

let db: Database;
let admin: PublicUser;
let vendedor: PublicUser;
let categoriaId: number;
let martilloId: number;
let cintaId: number;
let inactivoId: number;
let clienteCcId: number;
let clienteSinCcId: number;

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

async function seedProducto(overrides: Partial<typeof productos.$inferInsert>) {
  const [producto] = await db
    .insert(productos)
    .values({
      codigo: "P-1",
      descripcion: "Producto",
      categoriaId,
      precio: 100000,
      existencia: 10,
      stockMinimo: 1,
      activo: true,
      ...overrides,
    })
    .returning();
  return producto;
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

const pagoContado = (montoRecibido?: number) => ({
  forma: "contado" as const,
  ...(montoRecibido !== undefined ? { montoRecibido } : {}),
});

beforeEach(async () => {
  db = await createTestDb();
  admin = toPublicUser(
    await seedUser({ email: "admin@test.com", nombre: "Laura Méndez", rol: "admin" })
  );
  vendedor = toPublicUser(
    await seedUser({ email: "vend@test.com", nombre: "Pablo Ruiz", rol: "vendedor" })
  );

  const [cat] = await db.insert(categorias).values({ nombre: "Herramientas" }).returning();
  categoriaId = cat.id;

  const martillo = await seedProducto({
    codigo: "HE-001",
    descripcion: "Martillo carpintero 500 g",
    precio: 1250000,
    existencia: 10,
  });
  martilloId = martillo.id;

  const cinta = await seedProducto({
    codigo: "EL-001",
    descripcion: "Cinta aisladora 20 m",
    precio: 190000,
    existencia: 5,
  });
  cintaId = cinta.id;

  const inactivo = await seedProducto({
    codigo: "BA-001",
    descripcion: "Producto dado de baja",
    precio: 50000,
    existencia: 10,
    activo: false,
  });
  inactivoId = inactivo.id;

  const conCc = await createCliente(
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
  clienteCcId = conCc.id;

  const sinCc = await createCliente(
    { tipoDoc: "DNI", nroDoc: "20000001", nombre: "Consumidor registrado" },
    vendedor,
    db
  );
  clienteSinCcId = sinCc.id;
});

describe("createFactura · RF-V6", () => {
  it("emite una factura de contado, congela precios y descuenta stock en una transacción", async () => {
    const factura = await createFactura(
      {
        clienteId: null,
        items: [
          { productoId: martilloId, cantidad: 2 },
          { productoId: cintaId, cantidad: 1 },
        ],
        pago: pagoContado(3000000),
      },
      vendedor,
      db
    );

    expect(factura).toMatchObject({
      id: expect.any(Number),
      puntoVenta: 1,
      numero: 1,
      numeroFormateado: "0001-00000001",
      estado: "emitida",
      total: 2690000,
      cliente: null,
      vendedor: { id: vendedor.id, nombre: "Pablo Ruiz" },
      pago: { forma: "contado", montoRecibido: 3000000, vuelto: 310000 },
    });
    expect(factura.items).toEqual([
      {
        productoId: martilloId,
        codigo: "HE-001",
        descripcion: "Martillo carpintero 500 g",
        cantidad: 2,
        precioUnitario: 1250000,
        subtotal: 2500000,
      },
      {
        productoId: cintaId,
        codigo: "EL-001",
        descripcion: "Cinta aisladora 20 m",
        cantidad: 1,
        precioUnitario: 190000,
        subtotal: 190000,
      },
    ]);

    const [guardada] = await db.select().from(facturas);
    expect(guardada).toMatchObject({
      numero: 1,
      total: 2690000,
      formaPago: "contado",
      montoRecibido: 3000000,
      estado: "emitida",
      clienteId: null,
      usuarioId: vendedor.id,
    });

    const items = await db.select().from(facturaItems);
    expect(items).toHaveLength(2);
    expect(items.map((item) => item.descripcion)).toContain("Martillo carpintero 500 g");

    const [martillo] = await db
      .select({ existencia: productos.existencia })
      .from(productos)
      .where(eq(productos.id, martilloId));
    const [cinta] = await db
      .select({ existencia: productos.existencia })
      .from(productos)
      .where(eq(productos.id, cintaId));
    expect(martillo.existencia).toBe(8);
    expect(cinta.existencia).toBe(4);

    const movimientos = await db.select().from(movimientosStock);
    expect(movimientos).toHaveLength(2);
    expect(movimientos).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          productoId: martilloId,
          tipo: "venta",
          cantidad: -2,
          facturaId: factura.id,
          usuarioId: vendedor.id,
        }),
        expect.objectContaining({
          productoId: cintaId,
          tipo: "venta",
          cantidad: -1,
          facturaId: factura.id,
        }),
      ])
    );

    expect(await db.select().from(movimientosCuenta)).toHaveLength(0);
  });

  it("si no se informa montoRecibido en contado, asume el total y no genera vuelto", async () => {
    const factura = await createFactura(
      { items: [{ productoId: cintaId, cantidad: 1 }], pago: { forma: "contado" } },
      vendedor,
      db
    );

    expect(factura.total).toBe(190000);
    expect(factura.pago).toEqual({ forma: "contado", montoRecibido: 190000, vuelto: 0 });
  });

  it("rechaza contado con monto insuficiente y no deja rastros (rollback)", async () => {
    const error = await expectApiError(
      createFactura(
        {
          items: [{ productoId: cintaId, cantidad: 1 }],
          pago: pagoContado(100000),
        },
        vendedor,
        db
      ),
      422,
      "MONTO_INSUFICIENTE"
    );

    expect(error.details?.[0]).toMatchObject({
      total: 190000,
      montoRecibido: 100000,
      faltante: 90000,
    });
    expect(await db.select().from(facturas)).toHaveLength(0);
    expect(await db.select().from(facturaItems)).toHaveLength(0);
    expect(await db.select().from(movimientosStock)).toHaveLength(0);

    const [cinta] = await db
      .select({ existencia: productos.existencia })
      .from(productos)
      .where(eq(productos.id, cintaId));
    expect(cinta.existencia).toBe(5);
  });

  it("rechaza stock insuficiente con details por producto (409)", async () => {
    const error = await expectApiError(
      createFactura(
        { items: [{ productoId: cintaId, cantidad: 6 }], pago: pagoContado() },
        vendedor,
        db
      ),
      409,
      "STOCK_INSUFICIENTE"
    );

    expect(error.details?.[0]).toMatchObject({
      productoId: cintaId,
      solicitado: 6,
      disponible: 5,
    });
    expect(await db.select().from(facturas)).toHaveLength(0);
  });

  it("hace rollback total si el segundo ítem no tiene stock", async () => {
    await expectApiError(
      createFactura(
        {
          items: [
            { productoId: martilloId, cantidad: 1 },
            { productoId: cintaId, cantidad: 6 },
          ],
          pago: pagoContado(),
        },
        vendedor,
        db
      ),
      409,
      "STOCK_INSUFICIENTE"
    );

    const [martillo] = await db
      .select({ existencia: productos.existencia })
      .from(productos)
      .where(eq(productos.id, martilloId));
    expect(martillo.existencia).toBe(10);
    expect(await db.select().from(facturas)).toHaveLength(0);
    expect(await db.select().from(movimientosStock)).toHaveLength(0);
  });

  it("rechaza productos dados de baja (422 PRODUCTO_INACTIVO)", async () => {
    await expectApiError(
      createFactura(
        { items: [{ productoId: inactivoId, cantidad: 1 }], pago: pagoContado() },
        vendedor,
        db
      ),
      422,
      "PRODUCTO_INACTIVO"
    );
  });

  it("rechaza productos inexistentes (404 NO_ENCONTRADO)", async () => {
    await expectApiError(
      createFactura(
        { items: [{ productoId: 999999, cantidad: 1 }], pago: pagoContado() },
        vendedor,
        db
      ),
      404,
      "NO_ENCONTRADO"
    );
  });

  it("emite a cuenta corriente y registra el débito en la misma transacción", async () => {
    const factura = await createFactura(
      {
        clienteId: clienteCcId,
        items: [
          { productoId: martilloId, cantidad: 1 },
          { productoId: cintaId, cantidad: 1 },
        ],
        pago: { forma: "cuenta_corriente" },
      },
      vendedor,
      db
    );

    expect(factura.total).toBe(1440000);
    expect(factura.saldoCliente).toBe(1440000);
    expect(factura.pago).toEqual({ forma: "cuenta_corriente" });

    const movimientos = await db.select().from(movimientosCuenta);
    expect(movimientos).toHaveLength(1);
    expect(movimientos[0]).toMatchObject({
      clienteId: clienteCcId,
      tipo: "debito",
      importe: 1440000,
      facturaId: factura.id,
      descripcion: "Factura 0001-00000001",
    });
  });

  it("exige cliente con cuenta corriente habilitada para ese medio", async () => {
    await expectApiError(
      createFactura(
        { items: [{ productoId: cintaId, cantidad: 1 }], pago: { forma: "cuenta_corriente" } },
        vendedor,
        db
      ),
      422,
      "CUENTA_CORRIENTE_NO_HABILITADA"
    );

    await expectApiError(
      createFactura(
        {
          clienteId: clienteSinCcId,
          items: [{ productoId: cintaId, cantidad: 1 }],
          pago: { forma: "cuenta_corriente" },
        },
        vendedor,
        db
      ),
      422,
      "CUENTA_CORRIENTE_NO_HABILITADA"
    );
  });

  it("rechaza la venta si supera el límite de crédito (422) y hace rollback", async () => {
    const cliente = await createCliente(
      {
        tipoDoc: "DNI",
        nroDoc: "30000002",
        nombre: "Límite bajo",
        cuentaCorriente: true,
        limiteCredito: 1000000,
      },
      vendedor,
      db
    );

    const error = await expectApiError(
      createFactura(
        {
          clienteId: cliente.id,
          items: [
            { productoId: martilloId, cantidad: 1 },
            { productoId: cintaId, cantidad: 1 },
          ],
          pago: { forma: "cuenta_corriente" },
        },
        vendedor,
        db
      ),
      422,
      "LIMITE_CREDITO_EXCEDIDO"
    );

    expect(error.details?.[0]).toMatchObject({
      saldoActual: 0,
      limite: 1000000,
      excedente: 440000,
    });
    expect(await db.select().from(facturas)).toHaveLength(0);
    expect(await db.select().from(movimientosCuenta)).toHaveLength(0);
  });

  it("persiste los datos de tarjeta sin pedir el número completo", async () => {
    const factura = await createFactura(
      {
        items: [{ productoId: cintaId, cantidad: 1 }],
        pago: {
          forma: "tarjeta",
          tarjeta: { tipo: "credito", marca: "Visa", ultimos4: "1234" },
        },
      },
      vendedor,
      db
    );

    expect(factura.pago).toEqual({
      forma: "tarjeta",
      tarjeta: { tipo: "credito", marca: "Visa", ultimos4: "1234" },
    });

    const [guardada] = await db.select().from(facturas);
    expect(guardada).toMatchObject({
      formaPago: "tarjeta",
      tarjetaTipo: "credito",
      tarjetaMarca: "Visa",
      tarjetaUltimos4: "1234",
    });
  });

  it("rechaza tarjeta con últimos 4 inválidos o con número completo", async () => {
    await expectApiError(
      createFactura(
        {
          items: [{ productoId: cintaId, cantidad: 1 }],
          pago: {
            forma: "tarjeta",
            tarjeta: { tipo: "debito", marca: "Visa", ultimos4: "12345" },
          },
        },
        vendedor,
        db
      ),
      422,
      "VALIDACION"
    );

    await expectApiError(
      createFactura(
        {
          items: [{ productoId: cintaId, cantidad: 1 }],
          pago: {
            forma: "tarjeta",
            tarjeta: {
              tipo: "debito",
              marca: "Visa",
              ultimos4: "1234",
              numero: "4111111111111111",
            },
          },
        },
        vendedor,
        db
      ),
      422,
      "VALIDACION"
    );
  });

  it("numera de forma correlativa y sin huecos tras una venta fallida", async () => {
    await expectApiError(
      createFactura(
        { items: [{ productoId: cintaId, cantidad: 99 }], pago: pagoContado() },
        vendedor,
        db
      ),
      409,
      "STOCK_INSUFICIENTE"
    );

    const primera = await createFactura(
      { items: [{ productoId: cintaId, cantidad: 1 }], pago: pagoContado() },
      vendedor,
      db
    );
    const segunda = await createFactura(
      { items: [{ productoId: cintaId, cantidad: 1 }], pago: pagoContado() },
      vendedor,
      db
    );

    expect(primera.numeroFormateado).toBe("0001-00000001");
    expect(segunda.numeroFormateado).toBe("0001-00000002");
  });

  it("valida ítems vacíos, duplicados y cantidades no positivas", async () => {
    const vacio = await expectApiError(
      createFactura({ items: [], pago: pagoContado() }, vendedor, db),
      422,
      "VALIDACION"
    );
    expect((vacio.details ?? []).map((d) => d.campo)).toContain("items");

    await expectApiError(
      createFactura(
        {
          items: [
            { productoId: cintaId, cantidad: 1 },
            { productoId: cintaId, cantidad: 2 },
          ],
          pago: pagoContado(),
        },
        vendedor,
        db
      ),
      422,
      "VALIDACION"
    );

    await expectApiError(
      createFactura(
        { items: [{ productoId: cintaId, cantidad: 0 }], pago: pagoContado() },
        vendedor,
        db
      ),
      422,
      "VALIDACION"
    );
  });

  it("expone el próximo número informativo sin consumirlo", async () => {
    expect(await getProximoNumero(vendedor, db)).toEqual({
      puntoVenta: 1,
      numero: 1,
      numeroFormateado: "0001-00000001",
    });

    await createFactura(
      { items: [{ productoId: cintaId, cantidad: 1 }], pago: pagoContado() },
      vendedor,
      db
    );

    expect(await getProximoNumero(vendedor, db)).toEqual({
      puntoVenta: 1,
      numero: 2,
      numeroFormateado: "0001-00000002",
    });
  });

  it("permite vender a Consumidor Final sin cliente", async () => {
    const factura = await createFactura(
      { clienteId: null, items: [{ productoId: cintaId, cantidad: 1 }], pago: pagoContado() },
      admin,
      db
    );

    expect(factura.cliente).toBeNull();
    expect(factura.vendedor.id).toBe(admin.id);
  });

  it("rechaza vender a un cliente inactivo", async () => {
    await db.update(usuarios).set({ activo: true }).where(eq(usuarios.id, vendedor.id));
    const inactivo = await createCliente(
      { tipoDoc: "DNI", nroDoc: "40000004", nombre: "Cliente inactivo" },
      vendedor,
      db
    );
    await db.update(clientes).set({ activo: false }).where(eq(clientes.id, inactivo.id));

    await expectApiError(
      createFactura(
        {
          clienteId: inactivo.id,
          items: [{ productoId: cintaId, cantidad: 1 }],
          pago: pagoContado(),
        },
        vendedor,
        db
      ),
      422,
      "VALIDACION"
    );
  });

  it("ante dos ventas simultáneas de la última unidad, solo una se confirma", async () => {
    await db.update(productos).set({ existencia: 1 }).where(eq(productos.id, cintaId));

    const resultados = await Promise.allSettled([
      createFactura(
        { items: [{ productoId: cintaId, cantidad: 1 }], pago: pagoContado() },
        vendedor,
        db
      ),
      createFactura(
        { items: [{ productoId: cintaId, cantidad: 1 }], pago: pagoContado() },
        vendedor,
        db
      ),
    ]);

    const exitosas = resultados.filter((r) => r.status === "fulfilled");
    const fallidas = resultados.filter(
      (r): r is PromiseRejectedResult => r.status === "rejected"
    );
    expect(exitosas).toHaveLength(1);
    expect(fallidas).toHaveLength(1);
    expect(fallidas[0].reason).toMatchObject({ status: 409, code: "STOCK_INSUFICIENTE" });
    expect(await db.select().from(facturas)).toHaveLength(1);
  });
});
