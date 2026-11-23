import { beforeEach, describe, expect, it } from "vitest";
import bcrypt from "bcryptjs";
import type { Database } from "@/db";
import { categorias, clientes, facturas, movimientosCuenta, productos, usuarios } from "@/db/schema";
import { toPublicUser, type PublicUser, type UserRow } from "@/services/auth";
import { getIndicadores, getTablero } from "@/services/tablero";
import { createTestDb } from "@/test/db";

/**
 * RF-T1 (TP5-34): indicadores del tablero. TDD: estos tests se escriben antes
 * que el servicio y fijan la zona horaria inyectando `ahora`.
 */

const AHORA = new Date("2026-11-21T15:00:00Z"); // 21/11/2026, 12:00 en Buenos Aires

let db: Database;
let admin: PublicUser;
let vendedor: PublicUser;
let correlativo: number;

async function seedUser(overrides: Partial<typeof usuarios.$inferInsert>): Promise<UserRow> {
  const [user] = await db
    .insert(usuarios)
    .values({
      email: "user@test.com",
      nombre: "Usuario",
      passwordHash: await bcrypt.hash("secreto123", 4),
      rol: "vendedor",
      activo: true,
      ...overrides,
    })
    .returning();
  return user;
}

async function seedFactura(overrides: Partial<typeof facturas.$inferInsert> = {}) {
  correlativo += 1;
  const [factura] = await db
    .insert(facturas)
    .values({
      numero: correlativo,
      fecha: "2026-11-21 12:00:00",
      total: 190000,
      formaPago: "contado",
      estado: "emitida",
      usuarioId: vendedor.id,
      ...overrides,
    })
    .returning();
  return factura;
}

async function seedCliente(overrides: Partial<typeof clientes.$inferInsert> = {}) {
  const [cliente] = await db
    .insert(clientes)
    .values({
      tipoDoc: "DNI",
      nroDoc: "30000001",
      nombre: "Cliente",
      cuentaCorriente: true,
      activo: true,
      ...overrides,
    })
    .returning();
  return cliente;
}

async function seedMovimiento(
  clienteId: number,
  tipo: "debito" | "credito",
  importe: number
) {
  await db.insert(movimientosCuenta).values({
    clienteId,
    tipo,
    importe,
    fecha: "2026-11-21 12:00:00",
    descripcion: "Prueba",
  });
}

async function seedProducto(
  overrides: Partial<typeof productos.$inferInsert>,
  categoriaId: number
) {
  const [producto] = await db
    .insert(productos)
    .values({
      codigo: "P-DEFAULT",
      descripcion: "Producto",
      categoriaId,
      precio: 100000,
      existencia: 20,
      stockMinimo: 5,
      activo: true,
      ...overrides,
    })
    .returning();
  return producto;
}

beforeEach(async () => {
  db = await createTestDb();
  correlativo = 0;
  admin = toPublicUser(
    await seedUser({ email: "admin@test.com", nombre: "Laura Méndez", rol: "admin" })
  );
  vendedor = toPublicUser(
    await seedUser({ email: "vend@test.com", nombre: "Pablo Ruiz", rol: "vendedor" })
  );
});

describe("RF-T1 · indicadores del tablero (TP5-34)", () => {
  it("computa ventas de hoy y del mes en hora de Buenos Aires, sin anuladas", async () => {
    // 02:30Z del 21 es 20/11 local; 03:00Z del 21 es 21/11 local.
    await seedFactura({ fecha: "2026-11-21 12:00:00", total: 190000 });
    await seedFactura({ fecha: "2026-11-21 02:30:00", total: 100000 });
    await seedFactura({ fecha: "2026-11-21 03:00:00", total: 200000 });
    await seedFactura({ fecha: "2026-10-31 23:00:00", total: 500000 });
    await seedFactura({
      fecha: "2026-11-21 13:00:00",
      total: 900000,
      estado: "anulada",
      motivoAnulacion: "Error de carga",
      fechaAnulacion: "2026-11-21 14:00:00",
      usuarioAnulacionId: admin.id,
    });

    const resultado = await getIndicadores(vendedor, db, AHORA);

    expect(resultado.hoy).toEqual({ cantidad: 2, importe: 390000 });
    expect(resultado.mes).toEqual({
      cantidad: 3,
      importe: 490000,
      ticketPromedio: 163333,
    });
  });

  it("devuelve ceros cuando no hay facturas emitidas", async () => {
    await seedFactura({ estado: "anulada", motivoAnulacion: "Prueba" });

    const resultado = await getIndicadores(vendedor, db, AHORA);

    expect(resultado.hoy).toEqual({ cantidad: 0, importe: 0 });
    expect(resultado.mes).toEqual({ cantidad: 0, importe: 0, ticketPromedio: 0 });
  });

  it("trunca el ticket promedio a centavos enteros", async () => {
    await seedFactura({ total: 250000 });
    await seedFactura({ total: 250001 });

    const { mes } = await getIndicadores(vendedor, db, AHORA);

    expect(mes).toEqual({ cantidad: 2, importe: 500001, ticketPromedio: 250000 });
  });

  it("suma solo saldos deudores positivos de clientes vigentes", async () => {
    const conDeuda = await seedCliente({ nroDoc: "30000001" });
    await seedMovimiento(conDeuda.id, "debito", 100000);
    await seedMovimiento(conDeuda.id, "debito", 50000);
    await seedMovimiento(conDeuda.id, "credito", 20000);

    const aFavor = await seedCliente({ nroDoc: "30000002", nombre: "A favor" });
    await seedMovimiento(aFavor.id, "debito", 70000);
    await seedMovimiento(aFavor.id, "credito", 90000);

    const sinDeuda = await seedCliente({ nroDoc: "30000003", nombre: "Sin deuda" });
    await seedMovimiento(sinDeuda.id, "credito", 10000);

    const inactivo = await seedCliente({
      nroDoc: "30000004",
      nombre: "Inactivo",
      activo: false,
    });
    await seedMovimiento(inactivo.id, "debito", 999999);

    const { cuentasCorrientes } = await getIndicadores(vendedor, db, AHORA);

    expect(cuentasCorrientes).toEqual({ totalAdeudado: 130000, clientesConSaldo: 1 });
  });

  it("descuenta la anulación del saldo de cuenta corriente", async () => {
    const cliente = await seedCliente({ nroDoc: "30000005" });
    await seedMovimiento(cliente.id, "debito", 190000);
    await seedMovimiento(cliente.id, "credito", 190000);

    const { cuentasCorrientes } = await getIndicadores(vendedor, db, AHORA);

    expect(cuentasCorrientes).toEqual({ totalAdeudado: 0, clientesConSaldo: 0 });
  });

  it("cuenta productos activos con existencia menor o igual al mínimo", async () => {
    const [categoria] = await db.insert(categorias).values({ nombre: "Herramientas" }).returning();
    await seedProducto({ codigo: "BAJO", existencia: 5, stockMinimo: 10 }, categoria.id);
    await seedProducto({ codigo: "LIMITE", existencia: 10, stockMinimo: 10 }, categoria.id);
    await seedProducto({ codigo: "ALTO", existencia: 11, stockMinimo: 10 }, categoria.id);
    await seedProducto(
      { codigo: "INACTIVO", existencia: 2, stockMinimo: 5, activo: false },
      categoria.id
    );

    const { bajoMinimo } = await getIndicadores(vendedor, db, AHORA);

    expect(bajoMinimo).toEqual({ cantidad: 2 });
  });

  it("da el mismo resultado a admin y vendedor y lo expone en getTablero", async () => {
    await seedFactura({ total: 190000 });
    const cliente = await seedCliente({ nroDoc: "30000006" });
    await seedMovimiento(cliente.id, "debito", 50000);

    const comoAdmin = await getIndicadores(admin, db, AHORA);
    const comoVendedor = await getIndicadores(vendedor, db, AHORA);
    const tablero = await getTablero(vendedor, db, AHORA);

    expect(comoVendedor).toEqual(comoAdmin);
    expect(tablero).toMatchObject(comoAdmin);
  });
});
