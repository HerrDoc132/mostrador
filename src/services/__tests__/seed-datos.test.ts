import { describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
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
import { getTablero } from "@/services/tablero";
import { cargarDatosDePrueba } from "@/services/seed";
import { createTestDb } from "@/test/db";

/** TP5-42 / requerimientos.md:179: datos iniciales para que el tablero no arranque vacío. */
const AHORA = new Date("2026-11-24T15:00:00.000Z");

async function cuenta(db: Database, tabla: typeof facturas | typeof productos | typeof clientes | typeof categorias | typeof usuarios) {
  const [fila] = await db.select({ total: sql<number>`COUNT(*)` }).from(tabla);
  return Number(fila?.total ?? 0);
}

describe("cargarDatosDePrueba (TP5-42, requerimientos.md:179)", () => {
  it("carga los volúmenes exigidos usando los servicios", async () => {
    const db = await createTestDb();
    const resultado = await cargarDatosDePrueba(db, AHORA);

    expect(await cuenta(db, usuarios)).toBeGreaterThanOrEqual(2);
    expect(await cuenta(db, categorias)).toBeGreaterThanOrEqual(5);
    expect(await cuenta(db, productos)).toBeGreaterThanOrEqual(30);
    expect(await cuenta(db, clientes)).toBeGreaterThanOrEqual(10);
    expect(await cuenta(db, facturas)).toBeGreaterThanOrEqual(50);
    expect(resultado.facturas).toBeGreaterThanOrEqual(50);
  });

  it("registra stock inicial, renglones y movimientos de venta coherentes", async () => {
    const db = await createTestDb();
    await cargarDatosDePrueba(db, AHORA);

    const products = await db.select().from(productos);
    expect(products.every((producto) => producto.existencia >= 0)).toBe(true);
    expect(products.filter((producto) => producto.existencia > 0).length).toBeGreaterThanOrEqual(30);

    const items = await db.select().from(facturaItems);
    const movimientos = await db.select().from(movimientosStock);
    expect(items.length).toBeGreaterThanOrEqual(50);
    expect(movimientos.filter((movimiento) => movimiento.tipo === "venta").length).toBeGreaterThanOrEqual(50);
    expect(
      movimientos.filter((movimiento) => movimiento.tipo === "ingreso" && movimiento.motivo === "Stock inicial").length
    ).toBeGreaterThanOrEqual(30);

    for (const producto of products) {
      const suma = movimientos
        .filter((movimiento) => movimiento.productoId === producto.id)
        .reduce((total, movimiento) => total + movimiento.cantidad, 0);
      expect(suma).toBe(producto.existencia);
    }
  });

  it("distribuye las facturas en 30 días y alimenta el tablero", async () => {
    const db = await createTestDb();
    const { admin } = await cargarDatosDePrueba(db, AHORA);

    const emitidas = await db.select().from(facturas);
    const dias = new Set(emitidas.map((factura) => factura.fecha.slice(0, 10)));
    expect(dias.size).toBeGreaterThanOrEqual(25);
    expect(emitidas.every((factura) => factura.fecha.endsWith("Z"))).toBe(true);

    const tablero = await getTablero(admin, db, AHORA);
    expect(tablero.ventasDiarias).toHaveLength(30);
    expect(tablero.ventasDiarias.filter((dia) => dia.importe > 0).length).toBeGreaterThanOrEqual(25);
    expect(tablero.porFormaDePago).toHaveLength(3);
    expect(tablero.porFormaDePago.every((forma) => forma.importe > 0)).toBe(true);
    expect(tablero.masVendidos.length).toBeGreaterThan(0);
    expect(tablero.masVendidos.length).toBeLessThanOrEqual(5);
    expect(tablero.cuentasCorrientes.totalAdeudado).toBeGreaterThan(0);
  });

  it("es idempotente: una segunda ejecución no duplica los datos", async () => {
    const db = await createTestDb();
    await cargarDatosDePrueba(db, AHORA);
    const antes = await cuenta(db, facturas);

    await cargarDatosDePrueba(db, AHORA);

    expect(await cuenta(db, facturas)).toBe(antes);
    expect(await cuenta(db, productos)).toBeGreaterThanOrEqual(30);
    expect(await cuenta(db, clientes)).toBeGreaterThanOrEqual(10);
  });

  it("deja el saldo de cuenta corriente como débitos menos créditos", async () => {
    const db = await createTestDb();
    await cargarDatosDePrueba(db, AHORA);

    const conCc = (await db.select().from(clientes)).filter((cliente) => cliente.cuentaCorriente);
    expect(conCc.length).toBeGreaterThan(0);

    for (const cliente of conCc) {
      const movimientos = await db
        .select()
        .from(movimientosCuenta)
        .where(eq(movimientosCuenta.clienteId, cliente.id));
      const saldo = movimientos.reduce(
        (total, movimiento) => total + (movimiento.tipo === "debito" ? movimiento.importe : -movimiento.importe),
        0
      );
      expect(saldo).toBeGreaterThan(0);
      const deuda = (await db.select().from(facturas).where(eq(facturas.clienteId, cliente.id))).length;
      expect(deuda).toBeGreaterThan(0);
    }
  });
});
