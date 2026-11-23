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
import {
  anularFactura,
  createFactura,
  getFactura,
  getProximoNumero,
  listFacturas,
} from "@/services/facturas";
import { createTestDb } from "@/test/db";

/**
 * Casos de prueba de las secciones "Cómo probar" de los PR #10–#18 más
 * edge cases derivados de las reglas de negocio (RF-V1 a RF-V9).
 * Los casos HTTP/UI puros se cubren en api-adapter.test.ts y format-casos-pr.test.ts.
 */

let db: Database;
let admin: PublicUser;
let vendedor: PublicUser;
let cintaId: number;
let martilloId: number;
let clienteCcId: number;
let clienteSinCcId: number;
let clienteInactivoId: number;
let clienteLimiteId: number;

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
      categoriaId: (await db.select().from(categorias).limit(1))[0].id,
      precio: 190000,
      existencia: 20,
      stockMinimo: 1,
      activo: true,
      ...overrides,
    })
    .returning();
  return producto;
}

async function expectApiError(
  promise: Promise<unknown>,
  status: number,
  code: string
): Promise<ApiError> {
  try {
    await promise;
    throw new Error(`Se esperaba ${status} ${code}.`);
  } catch (error) {
    expect(error).toBeInstanceOf(ApiError);
    const apiError = error as ApiError;
    expect(apiError.status).toBe(status);
    expect(apiError.code).toBe(code);
    return apiError;
  }
}

const pagoContado = (montoRecibido?: number) => ({
  forma: "contado" as const,
  ...(montoRecibido !== undefined ? { montoRecibido } : {}),
});

async function existencia(producto: number): Promise<number> {
  const [row] = await db
    .select({ existencia: productos.existencia })
    .from(productos)
    .where(eq(productos.id, producto));
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

  const cinta = await seedProducto({
    codigo: "EL-001",
    descripcion: "Cinta aisladora 20 m",
    categoriaId: categoria.id,
    precio: 190000,
    existencia: 20,
  });
  cintaId = cinta.id;

  const martillo = await seedProducto({
    codigo: "HE-001",
    descripcion: "Martillo carpintero 500 g",
    categoriaId: categoria.id,
    precio: 1250000,
    existencia: 10,
  });
  martilloId = martillo.id;

  await seedProducto({
    codigo: "BA-001",
    descripcion: "Producto dado de baja",
    categoriaId: categoria.id,
    precio: 50000,
    activo: false,
  });

  const conCc = await createCliente(
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
  clienteCcId = conCc.id;

  const sinCc = await createCliente(
    { tipoDoc: "DNI", nroDoc: "30111222", nombre: "Cliente sin cuenta" },
    vendedor,
    db
  );
  clienteSinCcId = sinCc.id;

  const inactivoCliente = await createCliente(
    { tipoDoc: "DNI", nroDoc: "30111224", nombre: "Cliente dado de baja" },
    vendedor,
    db
  );
  clienteInactivoId = inactivoCliente.id;
  await db.update(clientes).set({ activo: false }).where(eq(clientes.id, clienteInactivoId));

  const conLimite = await createCliente(
    {
      tipoDoc: "DNI",
      nroDoc: "30111223",
      nombre: "Cliente límite exacto",
      cuentaCorriente: true,
      limiteCredito: 380000,
    },
    vendedor,
    db
  );
  clienteLimiteId = conLimite.id;
});

describe("RF-V6 · validaciones de la request (PR #10, #13, #15)", () => {
  it("rechaza ítems vacíos, producto repetido y cantidad 0 con details por campo", async () => {
    const vacios = await expectApiError(
      createFactura({ items: [], pago: pagoContado() }, vendedor, db),
      422,
      "VALIDACION"
    );
    expect(vacios.details?.[0].campo).toBe("items");

    const repetido = await expectApiError(
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
    expect(repetido.details?.[0].campo).toBe("items.1.productoId");

    const cantidadCero = await expectApiError(
      createFactura(
        { items: [{ productoId: cintaId, cantidad: 0 }], pago: pagoContado() },
        vendedor,
        db
      ),
      422,
      "VALIDACION"
    );
    expect(cantidadCero.details?.[0].campo).toBe("items.0.cantidad");
  });

  it("rechaza pago ausente, campos extra, cantidad decimal y más de 100 ítems", async () => {
    const items = [{ productoId: cintaId, cantidad: 1 }];

    await expectApiError(createFactura({ items }, vendedor, db), 422, "VALIDACION");
    await expectApiError(
      createFactura({ items, pago: pagoContado(), extra: true }, vendedor, db),
      422,
      "VALIDACION"
    );

    const decimal = await expectApiError(
      createFactura(
        { items: [{ productoId: cintaId, cantidad: 1.5 }], pago: pagoContado() },
        vendedor,
        db
      ),
      422,
      "VALIDACION"
    );
    expect(decimal.details?.[0].campo).toBe("items.0.cantidad");

    const muchos = Array.from({ length: 101 }, (_, indice) => ({
      productoId: indice + 1,
      cantidad: 1,
    }));
    const exceso = await expectApiError(
      createFactura({ items: muchos, pago: pagoContado() }, vendedor, db),
      422,
      "VALIDACION"
    );
    expect(exceso.details?.[0].campo).toBe("items");
  });

  it("rechaza montoRecibido negativo o decimal con 422 VALIDACION", async () => {
    const items = [{ productoId: cintaId, cantidad: 1 }];

    for (const monto of [-1, 1.5]) {
      const error = await expectApiError(
        createFactura({ items, pago: { forma: "contado", montoRecibido: monto } }, vendedor, db),
        422,
        "VALIDACION"
      );
      expect(error.details?.[0].campo).toBe("pago.montoRecibido");
    }
  });

  it("acepta el monto exacto sin vuelto y detalla el faltante cuando no alcanza", async () => {
    const items = [{ productoId: cintaId, cantidad: 1 }];

    const exacta = await createFactura(
      { items, pago: { forma: "contado", montoRecibido: 190000 } },
      vendedor,
      db
    );
    expect(exacta.pago).toEqual({ forma: "contado", montoRecibido: 190000, vuelto: 0 });

    const error = await expectApiError(
      createFactura(
        { items, pago: { forma: "contado", montoRecibido: 1000 } },
        vendedor,
        db
      ),
      422,
      "MONTO_INSUFICIENTE"
    );
    expect(error.details?.[0]).toMatchObject({ total: 190000, montoRecibido: 1000, faltante: 189000 });
    expect(await db.select().from(facturas)).toHaveLength(1);
  });

  it("rechaza un cliente inexistente con 404 NO_ENCONTRADO", async () => {
    await expectApiError(
      createFactura(
        { clienteId: 999999, items: [{ productoId: cintaId, cantidad: 1 }], pago: pagoContado() },
        vendedor,
        db
      ),
      404,
      "NO_ENCONTRADO"
    );
  });

  it("rechaza cuenta corriente sin cliente, sin cuenta habilitada y clientes inactivos", async () => {
    const items = [{ productoId: cintaId, cantidad: 1 }];
    const pagoCc = { forma: "cuenta_corriente" as const };

    await expectApiError(
      createFactura({ items, pago: pagoCc }, vendedor, db),
      422,
      "CUENTA_CORRIENTE_NO_HABILITADA"
    );
    await expectApiError(
      createFactura({ clienteId: clienteSinCcId, items, pago: pagoCc }, vendedor, db),
      422,
      "CUENTA_CORRIENTE_NO_HABILITADA"
    );

    const inactivo = await expectApiError(
      createFactura(
        { clienteId: clienteInactivoId, items, pago: pagoContado() },
        vendedor,
        db
      ),
      422,
      "VALIDACION"
    );
    expect(inactivo.details?.[0].campo).toBe("clienteId");
  });

  it("factura a un cliente registrado en contado sin exponer saldo ni movimiento de cuenta", async () => {
    const factura = await createFactura(
      {
        clienteId: clienteCcId,
        items: [{ productoId: cintaId, cantidad: 1 }],
        pago: pagoContado(190000),
      },
      vendedor,
      db
    );

    expect(factura.cliente).toMatchObject({ id: clienteCcId, nombre: "Mariana López" });
    expect(factura).not.toHaveProperty("saldoCliente");
    expect(await db.select().from(movimientosCuenta)).toHaveLength(0);
  });

  it("permite agotar el límite de crédito exactamente y detalla el excedente después", async () => {
    const items = [{ productoId: cintaId, cantidad: 1 }];
    const input = { clienteId: clienteLimiteId, items, pago: { forma: "cuenta_corriente" as const } };

    const primera = await createFactura(input, vendedor, db);
    expect(primera.saldoCliente).toBe(190000);

    const segunda = await createFactura(input, vendedor, db);
    expect(segunda.saldoCliente).toBe(380000);

    const error = await expectApiError(createFactura(input, vendedor, db), 422, "LIMITE_CREDITO_EXCEDIDO");
    expect(error.details?.[0]).toMatchObject({
      saldoActual: 380000,
      limite: 380000,
      excedente: 190000,
    });
    expect(await db.select().from(facturas)).toHaveLength(2);
  });

  it("rechaza forma de pago desconocida y tarjeta sin marca", async () => {
    const items = [{ productoId: cintaId, cantidad: 1 }];

    await expectApiError(
      createFactura({ items, pago: { forma: "transferencia" } }, vendedor, db),
      422,
      "VALIDACION"
    );

    const sinMarca = await expectApiError(
      createFactura(
        {
          items,
          pago: { forma: "tarjeta", tarjeta: { tipo: "credito", ultimos4: "1234" } },
        },
        vendedor,
        db
      ),
      422,
      "VALIDACION"
    );
    expect(sinMarca.details?.[0].campo).toBe("pago.tarjeta.marca");
  });

  it("no persiste datos de tarjeta en ventas que no son con tarjeta", async () => {
    await createFactura(
      { items: [{ productoId: cintaId, cantidad: 1 }], pago: pagoContado() },
      vendedor,
      db
    );

    const [fila] = await db.select().from(facturas);
    expect(fila.tarjetaTipo).toBeNull();
    expect(fila.tarjetaMarca).toBeNull();
    expect(fila.tarjetaUltimos4).toBeNull();
  });

  it("no consume el próximo número informativo y lo mantiene tras una anulación", async () => {
    const inicial = await getProximoNumero(vendedor, db);
    expect(inicial.numeroFormateado).toBe("0001-00000001");

    const primera = await createFactura(
      { items: [{ productoId: cintaId, cantidad: 1 }], pago: pagoContado() },
      vendedor,
      db
    );
    expect(primera.numero).toBe(1);
    await anularFactura(primera.id, { motivo: "Error de carga" }, admin, db);

    const siguiente = await getProximoNumero(vendedor, db);
    expect(siguiente.numero).toBe(2);

    const segunda = await createFactura(
      { items: [{ productoId: cintaId, cantidad: 1 }], pago: pagoContado() },
      vendedor,
      db
    );
    expect(segunda.numeroFormateado).toBe("0001-00000002");
  });
});

describe("RF-V7 · comprobante (PR #16)", () => {
  it("muestra los datos de la tarjeta y del comercio sin saldo de cliente", async () => {
    const emitida = await createFactura(
      {
        items: [{ productoId: cintaId, cantidad: 1 }],
        pago: {
          forma: "tarjeta",
          tarjeta: { tipo: "debito", marca: "Visa", ultimos4: "1234" },
        },
      },
      vendedor,
      db
    );

    const comprobante = await getFactura(emitida.id, vendedor, db);

    expect(comprobante.pago).toEqual({
      forma: "tarjeta",
      tarjeta: { tipo: "debito", marca: "Visa", ultimos4: "1234" },
    });
    expect(comprobante.comercio).toMatchObject({
      nombre: expect.any(String),
      direccion: expect.any(String),
      cuit: expect.any(String),
      telefono: expect.any(String),
    });
    expect(comprobante.saldoCliente).toBeUndefined();
    expect(comprobante.anulacion).toBeNull();
  });

  it("detalla el campo id para identificadores fraccionarios o negativos", async () => {
    for (const id of [0, -1, 1.5]) {
      const error = await expectApiError(getFactura(id, admin, db), 422, "VALIDACION");
      expect(error.details?.[0].campo).toBe("id");
    }
  });
});

describe("RF-V8 · listado y filtros (PR #17)", () => {
  const casosInvalidos: Array<{ input: Record<string, unknown>; campo: string }> = [
    { input: { pageSize: 101 }, campo: "pageSize" },
    { input: { page: 0 }, campo: "page" },
    { input: { estado: "otro" }, campo: "estado" },
    { input: { forma: "otra" }, campo: "forma" },
    { input: { desde: "21-11-2026" }, campo: "desde" },
    { input: { hasta: "2026/11/21" }, campo: "hasta" },
    { input: { clienteId: 0 }, campo: "clienteId" },
    { input: { q: "x".repeat(121) }, campo: "q" },
  ];

  for (const { input, campo } of casosInvalidos) {
    it(`rechaza el filtro ${JSON.stringify(input)} con details en ${campo}`, async () => {
      const error = await expectApiError(listFacturas(input, admin, db), 422, "VALIDACION");
      expect(error.details?.some((detalle) => detalle.campo === campo)).toBe(true);
    });
  }

  it("busca por número suelto y devuelve cero filas sin alterar totalEmitido global", async () => {
    const items = [{ productoId: cintaId, cantidad: 1 }];
    await createFactura({ items, pago: pagoContado() }, vendedor, db);
    await createFactura({ items, pago: pagoContado() }, vendedor, db);

    const porNumero = await listFacturas({ q: "2" }, admin, db);
    expect(porNumero.data.map((f) => f.numero)).toEqual([2]);

    const sinCoincidencias = await listFacturas({ q: "zzz" }, admin, db);
    expect(sinCoincidencias.data).toHaveLength(0);
    expect(sinCoincidencias.total).toBe(0);
    expect(sinCoincidencias.totalEmitido).toBe(0);

    const todas = await listFacturas({}, admin, db);
    expect(todas.totalEmitido).toBe(380000);
  });

  it("un rango invertido devuelve cero filas en lugar de error de validación", async () => {
    await createFactura(
      { items: [{ productoId: cintaId, cantidad: 1 }], pago: pagoContado() },
      vendedor,
      db
    );

    const invertido = await listFacturas(
      { desde: "2026-11-22", hasta: "2026-11-21" },
      admin,
      db
    );
    expect(invertido.data).toHaveLength(0);
    expect(invertido.total).toBe(0);
  });
});

describe("RF-V9 · anulación (PR #18)", () => {
  it("reingresa cada ítem por separado y conserva las líneas del comprobante", async () => {
    const emitida = await createFactura(
      {
        items: [
          { productoId: cintaId, cantidad: 2 },
          { productoId: martilloId, cantidad: 1 },
        ],
        pago: pagoContado(),
      },
      vendedor,
      db
    );
    expect(await existencia(cintaId)).toBe(18);
    expect(await existencia(martilloId)).toBe(9);

    const anulada = await anularFactura(emitida.id, { motivo: "Error de carga" }, admin, db);

    expect(anulada).toMatchObject({ itemCount: 2, stockReingresado: 3 });
    expect(await existencia(cintaId)).toBe(20);
    expect(await existencia(martilloId)).toBe(10);

    const movimientos = await db
      .select()
      .from(movimientosStock)
      .where(eq(movimientosStock.facturaId, emitida.id));
    expect(movimientos.filter((m) => m.tipo === "anulacion").map((m) => m.cantidad)).toEqual([2, 1]);

    const comprobante = await getFactura(emitida.id, admin, db);
    expect(comprobante.items).toHaveLength(2);
    expect(comprobante.items.map((item) => item.cantidad)).toEqual([2, 1]);
  });

  it("no genera movimiento de cuenta al anular una venta con tarjeta", async () => {
    const emitida = await createFactura(
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

    await anularFactura(emitida.id, { motivo: "Factura duplicada" }, admin, db);

    expect(await db.select().from(movimientosCuenta)).toHaveLength(0);
    const comprobante = await getFactura(emitida.id, admin, db);
    expect(comprobante.pago.forma).toBe("tarjeta");
    expect(comprobante.estado).toBe("anulada");
  });

  it("guarda el motivo sin espacios y rechaza motivos vacíos, largos o no string", async () => {
    const emitida = await createFactura(
      { items: [{ productoId: cintaId, cantidad: 1 }], pago: pagoContado() },
      vendedor,
      db
    );

    const anulada = await anularFactura(
      emitida.id,
      { motivo: "   Error de carga   " },
      admin,
      db
    );
    expect(anulada.motivoAnulacion).toBe("Error de carga");

    const otra = await createFactura(
      { items: [{ productoId: cintaId, cantidad: 1 }], pago: pagoContado() },
      vendedor,
      db
    );
    for (const motivo of ["   ", "x".repeat(301), 123]) {
      const error = await expectApiError(
        anularFactura(otra.id, { motivo }, admin, db),
        422,
        "VALIDACION"
      );
      expect(error.details?.[0].campo).toBe("motivo");
    }
  });

  it("no reingresa stock dos veces cuando se reintenta una anulación ya aplicada", async () => {
    const emitida = await createFactura(
      { items: [{ productoId: cintaId, cantidad: 3 }], pago: pagoContado() },
      vendedor,
      db
    );
    await anularFactura(emitida.id, { motivo: "Primera" }, admin, db);
    expect(await existencia(cintaId)).toBe(20);

    await expectApiError(
      anularFactura(emitida.id, { motivo: "Segunda" }, admin, db),
      409,
      "FACTURA_ANULADA"
    );

    expect(await existencia(cintaId)).toBe(20);
    const movimientos = await db
      .select()
      .from(movimientosStock)
      .where(eq(movimientosStock.facturaId, emitida.id));
    expect(movimientos.filter((m) => m.tipo === "anulacion")).toHaveLength(1);
  });

  it("rechaza ids fraccionarios o negativos con details en id", async () => {
    for (const id of [0, -1, 1.5]) {
      const error = await expectApiError(
        anularFactura(id, { motivo: "Prueba" }, admin, db),
        422,
        "VALIDACION"
      );
      expect(error.details?.[0].campo).toBe("id");
    }
  });

  it("no altera los ítems ni el total de la factura al anularla", async () => {
    const emitida = await createFactura(
      {
        items: [{ productoId: martilloId, cantidad: 2 }],
        pago: { forma: "contado", montoRecibido: 3000000 },
      },
      vendedor,
      db
    );

    await anularFactura(emitida.id, { motivo: "Prueba API" }, admin, db);

    const [fila] = await db.select().from(facturas).where(eq(facturas.id, emitida.id));
    expect(fila.total).toBe(2500000);
    expect(fila.montoRecibido).toBe(3000000);
    const items = await db.select().from(facturaItems).where(eq(facturaItems.facturaId, emitida.id));
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ cantidad: 2, precioUnitario: 1250000, subtotal: 2500000 });
  });
});
